import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../../src/mcp/buildServer.js";
import { createJsonCanvasPlugin } from "../../src/plugins/jsoncanvas/index.js";
import { CanvasController } from "../../src/server/canvasController.js";
import { Workspace } from "../../src/server/workspace.js";
import { connectInMemory, jsonContent, textContent } from "../helpers.js";

describe("JSON Canvas baseline MCP tools", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-jsoncanvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("supports universal tools and hides Excalidraw shape tools", async () => {
    const plugin = createJsonCanvasPlugin();
    const controller = new CanvasController(plugin);
    controller.deserialize(
      JSON.stringify({
        nodes: [
          { id: "a", type: "text", x: 0, y: 0, width: 360, height: 180, text: "A" },
          { id: "b", type: "text", x: 420, y: 0, width: 360, height: 180, text: "B" },
        ],
        edges: [{ id: "e", fromNode: "a", toNode: "b", toEnd: "arrow" }],
      }),
    );
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

    try {
      const state = jsonContent<{ canvas: string }>(
        await client.callTool({ name: "get_canvas_state", arguments: {} }),
      );
      expect(state.canvas).toBe("jsoncanvas");

      const objects = jsonContent<Array<{ id: string }>>(
        await client.callTool({ name: "list_objects", arguments: {} }),
      );
      expect(objects.map((object) => object.id)).toEqual(["a", "b", "e"]);

      const saved = jsonContent<{ path: string }>(
        await client.callTool({ name: "save_canvas", arguments: { path: "demo" } }),
      );
      expect(saved.path).toBe(path.join(root, "demo.canvas"));
      expect(JSON.parse(await readFile(saved.path, "utf8"))).toMatchObject({
        nodes: [{ id: "a" }, { id: "b" }],
        edges: [{ id: "e" }],
      });

      await client.callTool({ name: "clear_canvas", arguments: {} });
      expect(controller.listObjects()).toEqual([]);

      const opened = jsonContent<{ objectCount: number }>(
        await client.callTool({ name: "open_canvas", arguments: { path: "demo" } }),
      );
      expect(opened.objectCount).toBe(3);

      const listed = (await client.listTools()) as { tools: Array<{ name: string }> };
      const toolNames = listed.tools.map((tool) => tool.name);
      expect(toolNames).not.toContain("create_object");
      expect(toolNames).not.toContain("find_objects");
      expect(toolNames).not.toContain("apply_canvas_patch");
      expect(toolNames).not.toContain("set_canvas_background");
    } finally {
      await close();
    }
  });

  it("surfaces strict open_canvas duplicate id validation errors", async () => {
    const { client, close } = await connectJsonCanvas(workspace);

    try {
      await writeFile(
        path.join(root, "malformed.canvas"),
        `${JSON.stringify({
          nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 360, height: 180, text: "A" }],
          edges: [
            { id: "e", fromNode: "a", toNode: "a" },
            { id: "e", fromNode: "a", toNode: "missing" },
          ],
        })}\n`,
      );

      const result = await client.callTool({
        name: "open_canvas",
        arguments: { path: "malformed.canvas", repair: false },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textContent(result)).toMatch(/Duplicate edge id: e/);
      expect(textContent(result)).toMatch(/Edge e references missing node/);
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
