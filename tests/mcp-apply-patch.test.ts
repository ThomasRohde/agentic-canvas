import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../src/mcp/buildServer.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { connectInMemory, jsonContent, textContent } from "./helpers.js";

describe("apply_canvas_patch MCP tool", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("creates related objects atomically and resolves intra-patch keys", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{
        version: number;
        idMap: Record<string, string>;
        created: string[];
        updated: string[];
        deleted: string[];
        warnings: string[];
        objects: Array<{ id: string }>;
      }>(
        await client.callTool({
          name: "apply_canvas_patch",
          arguments: {
            returnObjects: true,
            operations: [
              {
                op: "create",
                key: "source",
                spec: {
                  type: "rectangle",
                  x: 0,
                  y: 0,
                  width: 120,
                  height: 70,
                  text: "Source",
                },
              },
              {
                op: "create",
                key: "target",
                spec: {
                  type: "ellipse",
                  x: 240,
                  y: 0,
                  width: 120,
                  height: 70,
                  text: "Target",
                },
              },
              {
                op: "create",
                key: "edge",
                spec: {
                  type: "arrow",
                  x: 0,
                  y: 0,
                  start: { elementId: "source" },
                  end: { elementId: "target" },
                  text: "next",
                },
              },
            ],
          },
        }),
      );

      expect(result.version).toBe(1);
      expect(Object.keys(result.idMap)).toEqual(["source", "target", "edge"]);
      expect(result.created).toEqual([result.idMap.source, result.idMap.target, result.idMap.edge]);
      expect(result.updated).toEqual([]);
      expect(result.deleted).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.objects.map((object) => object.id)).toEqual(result.created);
      expect(controller.currentVersion()).toBe(1);

      const arrow = controller.getObject(result.idMap.edge);
      expect(arrow?.raw.startBinding?.elementId).toBe(result.idMap.source);
      expect(arrow?.raw.endBinding?.elementId).toBe(result.idMap.target);
    } finally {
      await close();
    }
  });

  it("updates and deletes in one committed transaction", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const keep = controller.createObject({
      type: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    });
    const remove = controller.createObject({
      type: "diamond",
      x: 200,
      y: 20,
      width: 100,
      height: 80,
    });
    const beforeVersion = controller.currentVersion();
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{
        version: number;
        updated: string[];
        deleted: string[];
      }>(
        await client.callTool({
          name: "apply_canvas_patch",
          arguments: {
            operations: [
              { op: "update", id: keep.id, patch: { x: 40, text: "Kept" } },
              { op: "delete", ids: [remove.id] },
            ],
          },
        }),
      );

      expect(result.version).toBe(beforeVersion + 1);
      expect(result.updated).toEqual([keep.id]);
      expect(result.deleted).toEqual([remove.id]);
      expect(controller.getObject(keep.id)?.x).toBe(40);
      expect(controller.getObject(remove.id)).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("updates an object created earlier in the same patch without returning objects by default", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{
        idMap: Record<string, string>;
        created: string[];
        updated: string[];
        objects?: unknown[];
      }>(
        await client.callTool({
          name: "apply_canvas_patch",
          arguments: {
            operations: [
              {
                op: "create",
                key: "node",
                spec: { type: "rectangle", x: 0, y: 0, width: 100, height: 80 },
              },
              { op: "update", id: "node", patch: { x: 40, text: "Updated" } },
            ],
          },
        }),
      );

      expect(result.created).toEqual([result.idMap.node]);
      expect(result.updated).toEqual([result.idMap.node]);
      expect(result.objects).toBeUndefined();
      expect(controller.getObject(result.idMap.node)?.x).toBe(40);
      expect(controller.getObject(result.idMap.node)?.raw.boundElements).toContainEqual({
        id: expect.any(String),
        type: "text",
      });
    } finally {
      await close();
    }
  });

  it("previews dry runs without mutating the scene", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const beforeVersion = controller.currentVersion();
    const beforeCount = controller.listObjects().length;
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{
        dryRun: boolean;
        version: number;
        idMap: Record<string, string>;
        created: string[];
      }>(
        await client.callTool({
          name: "apply_canvas_patch",
          arguments: {
            dryRun: true,
            operations: [
              {
                op: "create",
                key: "preview",
                spec: { type: "rectangle", x: 0, y: 0, width: 100, height: 80 },
              },
            ],
          },
        }),
      );

      expect(result.dryRun).toBe(true);
      expect(result.version).toBe(beforeVersion);
      expect(result.created).toEqual([result.idMap.preview]);
      expect(controller.currentVersion()).toBe(beforeVersion);
      expect(controller.listObjects()).toHaveLength(beforeCount);
    } finally {
      await close();
    }
  });

  it("rolls back the whole patch when one operation fails", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const beforeVersion = controller.currentVersion();
    const beforeCount = controller.listObjects().length;
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = await client.callTool({
        name: "apply_canvas_patch",
        arguments: {
          operations: [
            {
              op: "create",
              key: "temp",
              spec: { type: "rectangle", x: 0, y: 0, width: 100, height: 80 },
            },
            { op: "update", id: "missing", patch: { x: 50 } },
          ],
        },
      });

      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textContent(result)).toMatch(/Object not found: missing/);
      expect(controller.currentVersion()).toBe(beforeVersion);
      expect(controller.listObjects()).toHaveLength(beforeCount);
    } finally {
      await close();
    }
  });

  it("rejects duplicate patch keys and rolls back created objects", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const beforeVersion = controller.currentVersion();
    const beforeCount = controller.listObjects().length;
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = await client.callTool({
        name: "apply_canvas_patch",
        arguments: {
          operations: [
            {
              op: "create",
              key: "duplicate",
              spec: { type: "rectangle", x: 0, y: 0, width: 100, height: 80 },
            },
            {
              op: "create",
              key: "duplicate",
              spec: { type: "ellipse", x: 120, y: 0, width: 100, height: 80 },
            },
          ],
        },
      });

      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textContent(result)).toBe("Duplicate patch key: duplicate");
      expect(controller.currentVersion()).toBe(beforeVersion);
      expect(controller.listObjects()).toHaveLength(beforeCount);
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
