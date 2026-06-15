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
