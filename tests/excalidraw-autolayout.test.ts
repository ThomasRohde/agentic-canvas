import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../src/mcp/buildServer.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { planGridLayout } from "../src/plugins/excalidraw/layout.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { connectInMemory, jsonContent } from "./helpers.js";

describe("Excalidraw auto layout planning", () => {
  it("plans deterministic grid coordinates", () => {
    expect(
      planGridLayout(
        [
          { id: "a", x: 100, y: 200, width: 100, height: 30 },
          { id: "b", x: 300, y: 200, width: 60, height: 80 },
          { id: "c", x: 500, y: 200, width: 90, height: 40 },
        ],
        { columns: 2, gapX: 20, gapY: 10, originX: 5, originY: 7 },
      ),
    ).toEqual([
      { id: "a", x: 5, y: 7 },
      { id: "b", x: 125, y: 7 },
      { id: "c", x: 5, y: 97 },
    ]);
  });
});

describe("auto_layout_objects MCP tool", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("applies grid layout, skips locked objects, and keeps arrows bound", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const first = controller.createObject({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 120,
      height: 70,
    });
    const locked = controller.createObject({
      type: "ellipse",
      x: 200,
      y: 0,
      width: 120,
      height: 70,
    });
    const second = controller.createObject({
      type: "diamond",
      x: 400,
      y: 0,
      width: 120,
      height: 70,
    });
    const arrow = controller.createObject({
      type: "arrow",
      x: 0,
      y: 0,
      start: { elementId: first.id },
      end: { elementId: second.id },
    });
    controller.mutateScene((scene) => {
      const lockedElement = scene.elements.find((element) => element.id === locked.id);
      if (!lockedElement) {
        throw new Error("locked element missing");
      }
      lockedElement.locked = true;
    });
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{ mode: string; updated: string[]; warnings: string[] }>(
        await client.callTool({
          name: "auto_layout_objects",
          arguments: {
            mode: "grid",
            ids: [first.id, locked.id, second.id],
            columns: 1,
            gapY: 50,
            originX: 0,
            originY: 0,
          },
        }),
      );

      expect(result).toEqual({
        mode: "grid",
        updated: [first.id, second.id],
        warnings: [`${locked.id}: locked objects are skipped`],
      });
      expect(controller.getObject(locked.id)?.x).toBe(200);
      expect(controller.getObject(second.id)?.y).toBe(120);
      const routedArrow = controller.getObject(arrow.id);
      expect(routedArrow?.raw.startBinding?.elementId).toBe(first.id);
      expect(routedArrow?.raw.endBinding?.elementId).toBe(second.id);
    } finally {
      await close();
    }
  });

  it("returns a warning without mutation for unsupported modes", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const beforeVersion = controller.currentVersion();
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{ mode: string; updated: string[]; warnings: string[] }>(
        await client.callTool({
          name: "auto_layout_objects",
          arguments: { mode: "tree" },
        }),
      );

      expect(result).toEqual({
        mode: "tree",
        updated: [],
        warnings: ["mode 'tree' not yet implemented"],
      });
      expect(controller.currentVersion()).toBe(beforeVersion);
    } finally {
      await close();
    }
  });
});

function createServer(
  plugin: ReturnType<typeof createExcalidrawPlugin>,
  controller: CanvasController,
  workspace: Workspace,
) {
  return buildMcpServer({
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
}
