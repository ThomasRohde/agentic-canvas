import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExcalidrawElement } from "../src/core/scene.js";
import { buildMcpServer } from "../src/mcp/buildServer.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { connectInMemory, jsonContent, textContent } from "./helpers.js";

describe("connect_objects MCP tool", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("creates labeled bound arrows for several edges", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const first = controller.createObject({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 120,
      height: 70,
    });
    const second = controller.createObject({
      type: "ellipse",
      x: 220,
      y: 0,
      width: 120,
      height: 70,
    });
    const third = controller.createObject({
      type: "diamond",
      x: 440,
      y: 0,
      width: 120,
      height: 70,
    });
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{ arrowIds: string[] }>(
        await client.callTool({
          name: "connect_objects",
          arguments: {
            edges: [
              { fromId: first.id, toId: second.id, label: "one", style: { strokeColor: "red" } },
              { fromId: second.id, toId: third.id, label: "two" },
            ],
          },
        }),
      );

      expect(result.arrowIds).toHaveLength(2);
      const arrow = controller.getObject(result.arrowIds[0]);
      expect(rawElement(arrow)?.startBinding?.elementId).toBe(first.id);
      expect(rawElement(arrow)?.endBinding?.elementId).toBe(second.id);
      expect(arrow?.style?.strokeColor).toBe("red");
      const labels = controller
        .listObjects("text")
        .filter((object) => ["one", "two"].includes(object.text ?? ""));
      expect(labels.map((object) => object.text).sort()).toEqual(["one", "two"]);
    } finally {
      await close();
    }
  });

  it("rejects missing endpoints without partial arrows", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const first = controller.createObject({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 120,
      height: 70,
    });
    const second = controller.createObject({
      type: "ellipse",
      x: 220,
      y: 0,
      width: 120,
      height: 70,
    });
    const beforeCount = controller.listObjects().length;
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = await client.callTool({
        name: "connect_objects",
        arguments: {
          edges: [
            { fromId: first.id, toId: second.id },
            { fromId: first.id, toId: "missing" },
          ],
        },
      });

      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textContent(result)).toMatch(/Object not found: missing/);
      expect(controller.listObjects()).toHaveLength(beforeCount);
    } finally {
      await close();
    }
  });

  it("rejects self-loop edges without creating arrows", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const first = controller.createObject({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 120,
      height: 70,
    });
    const beforeCount = controller.listObjects().length;
    const server = createServer(plugin, controller, workspace);
    const { client, close } = await connectInMemory(server);

    try {
      const result = await client.callTool({
        name: "connect_objects",
        arguments: {
          edges: [{ fromId: first.id, toId: first.id }],
        },
      });

      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textContent(result)).toMatch(/Arrow self-loops are not supported/);
      expect(controller.listObjects()).toHaveLength(beforeCount);
      expect(controller.listObjects("arrow")).toEqual([]);
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

function rawElement(object: { raw: unknown } | undefined): ExcalidrawElement | undefined {
  return object?.raw as ExcalidrawElement | undefined;
}
