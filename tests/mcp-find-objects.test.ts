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

describe("find_objects MCP tool", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("filters objects with AND semantics", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const frame = controller.createObject({
      type: "frame",
      x: -20,
      y: -20,
      width: 260,
      height: 180,
      text: "Frame",
    });
    const rectangle = controller.createObject({
      type: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      text: "Alpha",
      style: { strokeColor: "blue", backgroundColor: "transparent" },
    });
    const ellipse = controller.createObject({
      type: "ellipse",
      x: 320,
      y: 20,
      width: 100,
      height: 80,
      text: "Beta",
    });
    controller.mutateScene((scene) => {
      const rectangleElement = (scene.native as { elements: ExcalidrawElement[] }).elements.find(
        (element) => element.id === rectangle.id,
      );
      if (!rectangleElement) {
        throw new Error("rectangle element missing");
      }
      rectangleElement.frameId = frame.id;
      rectangleElement.groupIds = ["group-a"];
      rectangleElement.link = "https://example.test/docs";
      rectangleElement.customData = { status: "ready", score: 5 };
    });

    const server = buildMcpServer({
      plugin,
      controller,
      workspace,
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("not used");
      },
      requestSelection: async () => ({ selectedIds: [rectangle.id] }),
      requestSetSelection: async (selectedIds) => ({ selectedIds }),
    });
    const { client, close } = await connectInMemory(server);

    try {
      const byTextAndType = jsonContent<{ ids: string[]; count: number }>(
        await client.callTool({
          name: "find_objects",
          arguments: { type: "rectangle", textContains: "Alpha" },
        }),
      );
      expect(byTextAndType).toMatchObject({ count: 1, ids: [rectangle.id] });

      const byRegex = jsonContent<{ ids: string[] }>(
        await client.callTool({
          name: "find_objects",
          arguments: { type: "ellipse", textRegex: "^Beta$" },
        }),
      );
      expect(byRegex.ids).toEqual([ellipse.id]);

      const byGeometry = jsonContent<{ ids: string[] }>(
        await client.callTool({
          name: "find_objects",
          arguments: {
            bbox: { x: 0, y: 0, width: 150, height: 150 },
            bboxMode: "contains",
          },
        }),
      );
      expect(byGeometry.ids).toContain(rectangle.id);
      expect(byGeometry.ids).not.toContain(ellipse.id);

      const byIntersection = jsonContent<{ ids: string[] }>(
        await client.callTool({
          name: "find_objects",
          arguments: {
            type: "rectangle",
            bbox: { x: 100, y: 90, width: 20, height: 20 },
            bboxMode: "intersects",
          },
        }),
      );
      expect(byIntersection.ids).toEqual([rectangle.id]);

      const byMetadata = jsonContent<{ ids: string[] }>(
        await client.callTool({
          name: "find_objects",
          arguments: {
            frameId: frame.id,
            groupId: "group-a",
            style: { strokeColor: "blue" },
            link: "/docs",
            metadata: { key: "status", value: "ready" },
            selectedOnly: true,
          },
        }),
      );
      expect(byMetadata.ids).toEqual([rectangle.id]);

      const empty = jsonContent<{ count: number; ids: string[]; objects: unknown[] }>(
        await client.callTool({
          name: "find_objects",
          arguments: { type: "diamond", textContains: "Alpha" },
        }),
      );
      expect(empty).toEqual({ count: 0, ids: [], objects: [] });
    } finally {
      await close();
    }
  });

  it("returns errors for invalid regex and unavailable browser selection", async () => {
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
      const badRegex = await client.callTool({
        name: "find_objects",
        arguments: { textRegex: "(" },
      });
      expect((badRegex as { isError?: boolean }).isError).toBe(true);
      expect(textContent(badRegex)).toMatch(/Invalid regular expression/);

      const selectedOnly = await client.callTool({
        name: "find_objects",
        arguments: { selectedOnly: true },
      });
      expect((selectedOnly as { isError?: boolean }).isError).toBe(true);
      expect(textContent(selectedOnly)).toMatch(/No browser canvas client/);
    } finally {
      await close();
    }
  });
});
