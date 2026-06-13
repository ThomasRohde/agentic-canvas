import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../src/mcp/buildServer.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { connectInMemory, jsonContent, textContent } from "./helpers.js";

describe("baseline MCP tools", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("calls every baseline tool over InMemoryTransport", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    let selectedIds: string[] = [];
    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("No browser canvas client is connected");
      },
      requestSelection: async () => ({ selectedIds }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const state = jsonContent<{ canvas: string }>(
        await client.callTool({ name: "get_canvas_state", arguments: {} }),
      );
      expect(state.canvas).toBe("excalidraw");

      const created = jsonContent<{ id: string }>(
        await client.callTool({
          name: "create_object",
          arguments: { type: "rectangle", x: 10, y: 20, width: 100, height: 80 },
        }),
      );
      expect(created.id).toBeTruthy();
      selectedIds = [created.id, "stale-selected-id"];

      const objects = jsonContent<Array<{ id: string }>>(
        await client.callTool({ name: "list_objects", arguments: {} }),
      );
      expect(objects).toHaveLength(1);

      const object = jsonContent<{ id: string }>(
        await client.callTool({ name: "get_object", arguments: { id: created.id } }),
      );
      expect(object.id).toBe(created.id);

      const selected = jsonContent<{
        version: number;
        selectedIds: string[];
        objects: Array<{ id: string }>;
        missingIds: string[];
      }>(await client.callTool({ name: "get_selected_objects", arguments: {} }));
      expect(selected.version).toBe(controller.currentVersion());
      expect(selected.selectedIds).toEqual([created.id, "stale-selected-id"]);
      expect(selected.objects.map((item) => item.id)).toEqual([created.id]);
      expect(selected.missingIds).toEqual(["stale-selected-id"]);

      await client.callTool({ name: "update_object", arguments: { id: created.id, x: 40 } });
      expect(controller.getObject(created.id)?.x).toBe(40);

      const saved = jsonContent<{ path: string }>(
        await client.callTool({ name: "save_canvas", arguments: { path: "demo.excalidraw" } }),
      );
      expect(saved.path).toContain("demo.excalidraw");

      await client.callTool({ name: "clear_canvas", arguments: {} });
      expect(controller.listObjects()).toEqual([]);

      const opened = jsonContent<{ objectCount: number }>(
        await client.callTool({ name: "open_canvas", arguments: { path: "demo.excalidraw" } }),
      );
      expect(opened.objectCount).toBe(1);

      const missing = await client.callTool({
        name: "open_canvas",
        arguments: { path: "missing.excalidraw" },
      });
      expect((missing as { isError?: boolean }).isError).toBe(true);
      expect(textContent(missing)).toBe("No such canvas file: missing.excalidraw");

      const screenshot = await client.callTool({ name: "screenshot", arguments: {} });
      expect((screenshot as { isError?: boolean }).isError).toBe(true);
      expect(textContent(screenshot)).toMatch(/No browser canvas client/);

      const deleted = jsonContent<{ deleted: string[] }>(
        await client.callTool({ name: "delete_object", arguments: { ids: [created.id] } }),
      );
      expect(deleted.deleted).toEqual([created.id]);
    } finally {
      await close();
    }
  });

  it("returns an empty selection without treating it as an error", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 1,
      requestExport: async () => {
        throw new Error("not used");
      },
      requestSelection: async () => ({ selectedIds: [] }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const selected = jsonContent<{
        selectedIds: string[];
        objects: unknown[];
        missingIds: string[];
      }>(await client.callTool({ name: "get_selected_objects", arguments: {} }));

      expect(selected).toMatchObject({
        selectedIds: [],
        objects: [],
        missingIds: [],
      });
    } finally {
      await close();
    }
  });

  it("returns a clear error when selected objects require a browser and none is connected", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("not used");
      },
      requestSelection: async () => {
        throw new Error("No browser canvas client is connected");
      },
    });
    const { client, close } = await connectInMemory(server);

    try {
      const selected = await client.callTool({ name: "get_selected_objects", arguments: {} });
      expect((selected as { isError?: boolean }).isError).toBe(true);
      expect(textContent(selected)).toMatch(/No browser canvas client/);
    } finally {
      await close();
    }
  });
});
