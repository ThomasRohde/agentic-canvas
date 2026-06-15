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

describe("Excalidraw-specific MCP tools", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("draws shapes, binds arrows, creates frames and groups", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("No browser canvas client is connected");
      },
      requestSelection: async () => ({ selectedIds: [] }),
      requestSetSelection: async (selectedIds) => ({ selectedIds }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const rectangle = jsonContent<{ id: string }>(
        await client.callTool({
          name: "draw_rectangle",
          arguments: { x: 0, y: 0, width: 160, height: 80, text: "A" },
        }),
      );
      const ellipse = jsonContent<{ id: string }>(
        await client.callTool({
          name: "draw_ellipse",
          arguments: { x: 260, y: 0, width: 140, height: 80, text: "B" },
        }),
      );
      const arrow = jsonContent<{ id: string }>(
        await client.callTool({
          name: "draw_arrow",
          arguments: {
            start: { elementId: rectangle.id },
            end: { elementId: ellipse.id },
            text: "to",
          },
        }),
      );

      const arrowObject = controller.getObject(arrow.id);
      expect(rawElement(arrowObject)?.startBinding?.elementId).toBe(rectangle.id);
      expect(rawElement(arrowObject)?.endBinding?.elementId).toBe(ellipse.id);
      expect(rawElement(controller.getObject(rectangle.id))?.boundElements).toContainEqual({
        id: arrow.id,
        type: "arrow",
      });
      const arrowLabelSummary = controller
        .listObjects("text")
        .find((object) => object.text === "to");
      expect(arrowLabelSummary).toBeDefined();
      const arrowLabel = controller.getObject(arrowLabelSummary?.id ?? "");
      expect(arrowLabel?.containerId).toBe(arrow.id);
      expect(rawElement(arrowObject)?.boundElements).toContainEqual({
        id: arrowLabel?.id,
        type: "text",
      });
      expect(rawElement(arrowLabel)?.textAlign).toBe("center");
      expect(rawElement(arrowLabel)?.verticalAlign).toBe("middle");

      const frame = jsonContent<{ id: string; childIds: string[] }>(
        await client.callTool({
          name: "create_frame",
          arguments: {
            x: -20,
            y: -20,
            width: 460,
            height: 180,
            childIds: [rectangle.id, ellipse.id],
          },
        }),
      );
      expect(frame.childIds).toEqual([rectangle.id, ellipse.id]);
      expect(rawElement(controller.getObject(rectangle.id))?.frameId).toBe(frame.id);

      const group = jsonContent<{ groupId: string; ids: string[] }>(
        await client.callTool({
          name: "group_objects",
          arguments: { ids: [rectangle.id, ellipse.id] },
        }),
      );
      expect(group.ids).toEqual([rectangle.id, ellipse.id]);
      expect(controller.getObject(rectangle.id)?.groupIds).toContain(group.groupId);

      const ungroup = jsonContent<{ ids: string[]; groupId: string }>(
        await client.callTool({
          name: "ungroup_objects",
          arguments: { ids: [rectangle.id, ellipse.id], groupId: group.groupId },
        }),
      );
      expect(ungroup.ids).toEqual([rectangle.id, ellipse.id]);
      expect(controller.getObject(rectangle.id)?.groupIds).not.toContain(group.groupId);

      const removed = jsonContent<{ ids: string[] }>(
        await client.callTool({
          name: "remove_from_frame",
          arguments: { ids: [rectangle.id] },
        }),
      );
      expect(removed.ids).toEqual([rectangle.id]);
      expect(controller.getObject(rectangle.id)?.frameId).toBeNull();
    } finally {
      await close();
    }
  });

  it("creates deterministic flowcharts with bound edges", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("No browser canvas client is connected");
      },
      requestSelection: async () => ({ selectedIds: [] }),
      requestSetSelection: async (selectedIds) => ({ selectedIds }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{ nodeIds: Record<string, string>; arrowIds: string[] }>(
        await client.callTool({
          name: "create_flowchart",
          arguments: {
            direction: "LR",
            nodes: [
              { id: "start", label: "Start" },
              { id: "validate", label: "Validate", shape: "diamond" },
              { id: "success", label: "Success" },
              { id: "failure", label: "Failure" },
            ],
            edges: [
              { from: "start", to: "validate", label: "parse" },
              { from: "validate", to: "success", label: "valid" },
              { from: "validate", to: "failure", label: "invalid" },
            ],
          },
        }),
      );

      expect(Object.keys(result.nodeIds)).toEqual(["start", "validate", "success", "failure"]);
      expect(result.arrowIds).toHaveLength(3);
      const arrow = controller.getObject(result.arrowIds[0]);
      expect(rawElement(arrow)?.startBinding?.elementId).toBe(result.nodeIds.start);
      expect(rawElement(arrow)?.endBinding?.elementId).toBe(result.nodeIds.validate);
      const edgeLabels = controller
        .listObjects("text")
        .filter((object) => ["parse", "valid", "invalid"].includes(object.text ?? ""));
      expect(edgeLabels.map((object) => object.text).sort()).toEqual(["invalid", "parse", "valid"]);
      for (const label of edgeLabels) {
        const labelObject = controller.getObject(label.id);
        expect(result.arrowIds).toContain(labelObject?.containerId);
        const connector = controller.getObject(labelObject?.containerId ?? "");
        expect(rawElement(connector)?.boundElements).toContainEqual({ id: label.id, type: "text" });
      }
    } finally {
      await close();
    }
  });

  it("rejects draw_arrow self-loops without mutating the scene", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const rectangle = controller.createObject({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 160,
      height: 80,
    });
    const beforeCount = controller.listObjects().length;
    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("No browser canvas client is connected");
      },
      requestSelection: async () => ({ selectedIds: [] }),
      requestSetSelection: async (selectedIds) => ({ selectedIds }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const result = await client.callTool({
        name: "draw_arrow",
        arguments: {
          start: { elementId: rectangle.id },
          end: { elementId: rectangle.id },
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

  it("keeps cyclic flowcharts compact and rejects bad edges atomically", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("No browser canvas client is connected");
      },
      requestSelection: async () => ({ selectedIds: [] }),
      requestSetSelection: async (selectedIds) => ({ selectedIds }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const result = jsonContent<{ nodeIds: Record<string, string>; arrowIds: string[] }>(
        await client.callTool({
          name: "create_flowchart",
          arguments: {
            direction: "TB",
            nodes: [
              { id: "start", label: "Start" },
              { id: "work", label: "Work" },
              { id: "ok", label: "OK", shape: "diamond" },
              { id: "done", label: "Done" },
            ],
            edges: [
              { from: "start", to: "work" },
              { from: "work", to: "ok" },
              { from: "ok", to: "done" },
              { from: "ok", to: "work", label: "retry" },
            ],
          },
        }),
      );

      expect(result.arrowIds).toHaveLength(4);
      const start = controller.getObject(result.nodeIds.start);
      const work = controller.getObject(result.nodeIds.work);
      const ok = controller.getObject(result.nodeIds.ok);
      const done = controller.getObject(result.nodeIds.done);
      expect(start?.y).toBe(0);
      expect(work?.y).toBe(140);
      expect(ok?.y).toBe(280);
      expect(done?.y).toBe(420);

      const beforeBadCall = controller.listObjects().length;
      const bad = await client.callTool({
        name: "create_flowchart",
        arguments: {
          nodes: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "a", to: "ghost" },
          ],
        },
      });

      expect((bad as { isError?: boolean }).isError).toBe(true);
      expect(textContent(bad)).toMatch(/Flowchart edge references missing node/);
      expect(controller.listObjects()).toHaveLength(beforeBadCall);
    } finally {
      await close();
    }
  });

  it("rejects invalid group requests without mutating objects", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("No browser canvas client is connected");
      },
      requestSelection: async () => ({ selectedIds: [] }),
      requestSetSelection: async (selectedIds) => ({ selectedIds }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const rectangle = jsonContent<{ id: string }>(
        await client.callTool({
          name: "draw_rectangle",
          arguments: { x: 0, y: 0, width: 160, height: 80 },
        }),
      );

      const missing = await client.callTool({
        name: "group_objects",
        arguments: { ids: [rectangle.id, "missing"] },
      });

      expect((missing as { isError?: boolean }).isError).toBe(true);
      expect(textContent(missing)).toMatch(/Object not found: missing/);
      expect(controller.getObject(rectangle.id)?.groupIds).toEqual([]);
    } finally {
      await close();
    }
  });
});

function rawElement(object: { raw: unknown } | undefined): ExcalidrawElement | undefined {
  return object?.raw as ExcalidrawElement | undefined;
}
