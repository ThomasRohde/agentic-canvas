import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../../src/mcp/buildServer.js";
import { createJsonCanvasPlugin } from "../../src/plugins/jsoncanvas/index.js";
import { CanvasController } from "../../src/server/canvasController.js";
import { Workspace } from "../../src/server/workspace.js";
import { connectInMemory, jsonContent, textContent } from "../helpers.js";

describe("JSON Canvas MCP tools", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-jsoncanvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("creates cards, connects them, searches, and lays them out", async () => {
    const { client, close, controller } = await connectJsonCanvas(workspace);

    try {
      const first = jsonContent<{ id: string }>(
        await client.callTool({
          name: "add_text_card",
          arguments: { text: "# Context\nAlpha", color: "1" },
        }),
      );
      const second = jsonContent<{ id: string }>(
        await client.callTool({
          name: "add_link_card",
          arguments: { url: "https://example.test/path", x: 0, y: 240 },
        }),
      );
      const edge = jsonContent<{ id: string; toEnd: string }>(
        await client.callTool({
          name: "connect_cards",
          arguments: { fromNode: first.id, toNode: second.id, label: "references" },
        }),
      );

      expect(edge.toEnd).toBe("arrow");
      expect(controller.listObjects().map((object) => object.id)).toEqual([
        first.id,
        second.id,
        edge.id,
      ]);

      const cards = jsonContent<{ ids: string[] }>(
        await client.callTool({ name: "find_cards", arguments: { query: "alpha" } }),
      );
      expect(cards.ids).toEqual([first.id]);

      const edges = jsonContent<{ ids: string[] }>(
        await client.callTool({
          name: "find_edges",
          arguments: { touchingNode: second.id, query: "references" },
        }),
      );
      expect(edges.ids).toEqual([edge.id]);

      const layout = jsonContent<{ movedIds: string[] }>(
        await client.callTool({ name: "auto_layout_cards", arguments: {} }),
      );
      expect(layout.movedIds).toContain(second.id);
    } finally {
      await close();
    }
  });

  it("uses layout spacing as a gap so explicit small values do not overlap cards", async () => {
    const { client, close, controller } = await connectJsonCanvas(workspace);

    try {
      await client.callTool({
        name: "apply_jsoncanvas_patch",
        arguments: {
          createNodes: ["A", "B", "C", "D"].map((id, index) => ({
            id,
            type: "text",
            x: index * 10,
            y: 0,
            width: 360,
            height: 100,
            text: id,
          })),
          createEdges: [
            { id: "AB", fromNode: "A", toNode: "B" },
            { id: "BC", fromNode: "B", toNode: "C" },
            { id: "CD", fromNode: "C", toNode: "D" },
          ],
        },
      });

      await client.callTool({
        name: "auto_layout_cards",
        arguments: { direction: "right", layerSpacing: 100, nodeSpacing: 40 },
      });
      expect(["A", "B", "C", "D"].map((id) => controller.getObject(id)?.x)).toEqual([
        0, 460, 920, 1380,
      ]);

      await client.callTool({
        name: "auto_layout_cards",
        arguments: { direction: "down", layerSpacing: 25, nodeSpacing: 40 },
      });
      expect(["A", "B", "C", "D"].map((id) => controller.getObject(id)?.y)).toEqual([
        0, 125, 250, 375,
      ]);
    } finally {
      await close();
    }
  });

  it("keeps independent chain roots in the first layout layer", async () => {
    const { client, close, controller } = await connectJsonCanvas(workspace);

    try {
      await client.callTool({
        name: "apply_jsoncanvas_patch",
        arguments: {
          createNodes: ["A", "B", "C", "D"].map((id) => ({
            id,
            type: "text",
            x: 0,
            y: 0,
            width: 120,
            height: 80,
            text: id,
          })),
          createEdges: [
            { id: "AB", fromNode: "A", toNode: "B" },
            { id: "CD", fromNode: "C", toNode: "D" },
          ],
        },
      });

      await client.callTool({
        name: "auto_layout_cards",
        arguments: { direction: "right", layerSpacing: 60, nodeSpacing: 40 },
      });

      expect(controller.getObject("A")?.x).toBe(0);
      expect(controller.getObject("C")?.x).toBe(0);
      expect(controller.getObject("B")?.x).toBe(180);
      expect(controller.getObject("D")?.x).toBe(180);
    } finally {
      await close();
    }
  });

  it("updates cards and edges with type-aware validation", async () => {
    const { client, close } = await connectJsonCanvas(workspace);

    try {
      const file = jsonContent<{ id: string }>(
        await client.callTool({
          name: "add_file_card",
          arguments: { file: "docs/PLAN.md", subpath: "# Scope" },
        }),
      );
      const text = jsonContent<{ id: string }>(
        await client.callTool({ name: "add_text_card", arguments: { text: "Target" } }),
      );
      const edge = jsonContent<{ id: string }>(
        await client.callTool({
          name: "connect_cards",
          arguments: { fromNode: file.id, toNode: text.id },
        }),
      );

      const invalid = await client.callTool({
        name: "update_card",
        arguments: { id: file.id, text: "not allowed" },
      });
      expect((invalid as { isError?: boolean }).isError).toBe(true);
      expect(textContent(invalid)).toMatch(/not applicable/);

      const updated = jsonContent<{ raw: { subpath?: string } }>(
        await client.callTool({
          name: "update_card",
          arguments: { id: file.id, subpath: null, x: 20 },
        }),
      );
      expect(updated.raw.subpath).toBeUndefined();

      const updatedEdge = jsonContent<{ label: string }>(
        await client.callTool({
          name: "update_edge",
          arguments: { id: edge.id, label: "uses" },
        }),
      );
      expect(updatedEdge.label).toBe("uses");
    } finally {
      await close();
    }
  });

  it("allows degenerate and parallel edges with advisory warnings", async () => {
    const { client, close, controller } = await connectJsonCanvas(workspace);

    try {
      const first = jsonContent<{ id: string }>(
        await client.callTool({ name: "add_text_card", arguments: { text: "A" } }),
      );
      const second = jsonContent<{ id: string }>(
        await client.callTool({ name: "add_text_card", arguments: { text: "B" } }),
      );

      const selfLoop = jsonContent<{ id: string; warnings: string[] }>(
        await client.callTool({
          name: "connect_cards",
          arguments: { fromNode: first.id, toNode: first.id },
        }),
      );
      expect(selfLoop.warnings).toContain(`Edge ${selfLoop.id} is a self-loop`);
      expect(controller.getObject(selfLoop.id)?.raw).not.toHaveProperty("warnings");

      const parallel = jsonContent<{ id: string; warnings: string[] }>(
        await client.callTool({
          name: "connect_cards",
          arguments: { fromNode: first.id, toNode: first.id, label: "again" },
        }),
      );
      expect(parallel.warnings).toEqual(
        expect.arrayContaining([
          `Edge ${parallel.id} is a self-loop`,
          `Edge ${parallel.id} is parallel to an existing edge`,
        ]),
      );

      const edge = jsonContent<{ id: string }>(
        await client.callTool({
          name: "connect_cards",
          arguments: { fromNode: first.id, toNode: second.id },
        }),
      );
      const updated = jsonContent<{ warnings: string[] }>(
        await client.callTool({
          name: "update_edge",
          arguments: { id: edge.id, toNode: first.id },
        }),
      );
      expect(updated.warnings).toEqual(
        expect.arrayContaining([
          `Edge ${edge.id} is a self-loop`,
          `Edge ${edge.id} is parallel to an existing edge`,
        ]),
      );
    } finally {
      await close();
    }
  });

  it("applies bulk patches atomically and rolls back invalid patches", async () => {
    const { client, close, controller } = await connectJsonCanvas(workspace);

    try {
      const result = jsonContent<{ created: string[] }>(
        await client.callTool({
          name: "apply_jsoncanvas_patch",
          arguments: {
            createNodes: [
              { id: "a", type: "text", x: 0, y: 0, width: 360, height: 180, text: "A" },
              { id: "b", type: "text", x: 420, y: 0, width: 360, height: 180, text: "B" },
            ],
            createEdges: [{ id: "ab", fromNode: "a", toNode: "b", toEnd: "arrow" }],
          },
        }),
      );
      expect(result.created).toEqual(["a", "b", "ab"]);

      const before = controller.listObjects().map((object) => object.id);
      const invalid = await client.callTool({
        name: "apply_jsoncanvas_patch",
        arguments: {
          updateNodes: [{ id: "a", patch: { x: 100 } }],
          createEdges: [{ id: "bad", fromNode: "a", toNode: "missing" }],
        },
      });
      expect((invalid as { isError?: boolean }).isError).toBe(true);
      expect(controller.listObjects().map((object) => object.id)).toEqual(before);
      expect(controller.getObject("a")?.x).toBe(0);

      const warningResult = jsonContent<{ warnings: string[] }>(
        await client.callTool({
          name: "apply_jsoncanvas_patch",
          arguments: {
            createEdges: [{ id: "loop", fromNode: "a", toNode: "a" }],
          },
        }),
      );
      expect(warningResult.warnings).toContain("Edge loop is a self-loop");
      expect(controller.getObject("loop")?.raw).not.toHaveProperty("warnings");
    } finally {
      await close();
    }
  });
});

async function connectJsonCanvas(workspace: Workspace) {
  const plugin = createJsonCanvasPlugin();
  const controller = new CanvasController(plugin);
  const server = buildMcpServer({
    plugin,
    controller,
    workspace,
    clientsConnected: () => 0,
    requestExport: async () => {
      throw new Error("not used");
    },
    requestSelection: async () => ({ selectedIds: [] }),
    requestSetSelection: async (selectedIds) => ({ selectedIds }),
  });
  const { client, close } = await connectInMemory(server);
  return { client, close, controller };
}
