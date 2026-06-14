import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../src/mcp/buildServer.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { planAlignDistribute } from "../src/plugins/excalidraw/layout.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { connectInMemory, jsonContent, textContent } from "./helpers.js";

describe("Excalidraw align and distribute planning", () => {
  it("plans exact alignment, distribution, and equalization updates", () => {
    expect(
      planAlignDistribute(
        [
          { id: "a", x: 10, y: 0, width: 20, height: 10 },
          { id: "b", x: 70, y: 30, width: 30, height: 20 },
        ],
        { align: "left" },
      ),
    ).toEqual([
      { id: "a", x: 10 },
      { id: "b", x: 10 },
    ]);

    expect(
      planAlignDistribute(
        [
          { id: "a", x: 0, y: 0, width: 20, height: 10 },
          { id: "b", x: 100, y: 0, width: 20, height: 10 },
          { id: "c", x: 250, y: 0, width: 50, height: 10 },
        ],
        { distribute: "horizontal" },
      ),
    ).toEqual([
      { id: "a", x: 0 },
      { id: "b", x: 125 },
      { id: "c", x: 250 },
    ]);

    expect(
      planAlignDistribute(
        [
          { id: "a", x: 0, y: 0, width: 20, height: 10 },
          { id: "b", x: 50, y: 0, width: 35, height: 30 },
        ],
        { equalizeWidth: true },
      ),
    ).toEqual([
      { id: "a", width: 35 },
      { id: "b", width: 35 },
    ]);
  });

  it("plans non-left alignment, vertical distribution, and grid snapping", () => {
    const objects = [
      { id: "a", x: 0, y: 10, width: 20, height: 20 },
      { id: "b", x: 100, y: 50, width: 40, height: 60 },
    ];

    expect(planAlignDistribute(objects, { align: "center" })).toEqual([
      { id: "a", x: 60 },
      { id: "b", x: 50 },
    ]);
    expect(planAlignDistribute(objects, { align: "right" })).toEqual([
      { id: "a", x: 120 },
      { id: "b", x: 100 },
    ]);
    expect(planAlignDistribute(objects, { align: "top" })).toEqual([
      { id: "a", y: 10 },
      { id: "b", y: 10 },
    ]);
    expect(planAlignDistribute(objects, { align: "middle" })).toEqual([
      { id: "a", y: 50 },
      { id: "b", y: 30 },
    ]);
    expect(planAlignDistribute(objects, { align: "bottom" })).toEqual([
      { id: "a", y: 90 },
      { id: "b", y: 50 },
    ]);

    expect(
      planAlignDistribute(
        [
          { id: "a", x: 0, y: 0, width: 20, height: 20 },
          { id: "b", x: 0, y: 80, width: 20, height: 20 },
          { id: "c", x: 0, y: 170, width: 20, height: 50 },
        ],
        { distribute: "vertical" },
      ),
    ).toEqual([
      { id: "a", y: 0 },
      { id: "b", y: 85 },
      { id: "c", y: 170 },
    ]);

    expect(
      planAlignDistribute(
        [
          { id: "a", x: 3, y: 4, width: 20, height: 20 },
          { id: "b", x: 31, y: 26, width: 20, height: 20 },
        ],
        { align: "left", snapToGrid: 10 },
      ),
    ).toEqual([
      { id: "a", x: 0 },
      { id: "b", x: 0 },
    ]);
  });
});

describe("align_distribute_objects MCP tool", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("updates unlocked objects and reports locked skips", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const left = controller.createObject({
      type: "rectangle",
      x: 50,
      y: 0,
      width: 100,
      height: 80,
    });
    const locked = controller.createObject({
      type: "ellipse",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const right = controller.createObject({
      type: "diamond",
      x: 140,
      y: 0,
      width: 100,
      height: 80,
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
      const result = jsonContent<{ updated: string[]; warnings: string[] }>(
        await client.callTool({
          name: "align_distribute_objects",
          arguments: { ids: [left.id, locked.id, right.id], align: "left" },
        }),
      );

      expect(result.updated).toEqual([left.id, right.id]);
      expect(result.warnings).toEqual([`${locked.id}: locked objects are skipped`]);
      expect(controller.getObject(locked.id)?.x).toBe(0);
      expect(controller.getObject(right.id)?.x).toBe(50);
    } finally {
      await close();
    }
  });

  it("returns the browser selection error when ids are omitted without a browser", async () => {
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
      requestSetSelection: async (selectedIds) => ({ selectedIds }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const result = await client.callTool({
        name: "align_distribute_objects",
        arguments: { align: "left" },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textContent(result)).toMatch(/No browser canvas client/);
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
