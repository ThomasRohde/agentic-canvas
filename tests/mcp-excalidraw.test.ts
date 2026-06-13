import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../src/mcp/buildServer.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { connectInMemory, jsonContent } from "./helpers.js";

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
      expect(arrowObject?.raw.startBinding?.elementId).toBe(rectangle.id);
      expect(arrowObject?.raw.endBinding?.elementId).toBe(ellipse.id);
      expect(controller.getObject(rectangle.id)?.raw.boundElements).toContainEqual({
        id: arrow.id,
        type: "arrow",
      });
      const arrowLabelSummary = controller
        .listObjects("text")
        .find((object) => object.text === "to");
      expect(arrowLabelSummary).toBeDefined();
      const arrowLabel = controller.getObject(arrowLabelSummary?.id ?? "");
      expect(arrowLabel?.containerId).toBe(arrow.id);
      expect(arrowObject?.raw.boundElements).toContainEqual({
        id: arrowLabel?.id,
        type: "text",
      });
      expect(arrowLabel?.raw.textAlign).toBe("center");
      expect(arrowLabel?.raw.verticalAlign).toBe("middle");

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
      expect(controller.getObject(rectangle.id)?.raw.frameId).toBe(frame.id);

      const group = jsonContent<{ groupId: string }>(
        await client.callTool({
          name: "group_objects",
          arguments: { ids: [rectangle.id, ellipse.id] },
        }),
      );
      expect(controller.getObject(rectangle.id)?.groupIds).toContain(group.groupId);
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
      expect(arrow?.raw.startBinding?.elementId).toBe(result.nodeIds.start);
      expect(arrow?.raw.endBinding?.elementId).toBe(result.nodeIds.validate);
      const edgeLabels = controller
        .listObjects("text")
        .filter((object) => ["parse", "valid", "invalid"].includes(object.text ?? ""));
      expect(edgeLabels.map((object) => object.text).sort()).toEqual(["invalid", "parse", "valid"]);
      for (const label of edgeLabels) {
        const labelObject = controller.getObject(label.id);
        expect(result.arrowIds).toContain(labelObject?.containerId);
        const connector = controller.getObject(labelObject?.containerId ?? "");
        expect(connector?.raw.boundElements).toContainEqual({ id: label.id, type: "text" });
      }
    } finally {
      await close();
    }
  });
});
