import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../src/mcp/buildServer.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { createJsonCanvasPlugin } from "../src/plugins/jsoncanvas/index.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { connectInMemory, jsonContent } from "./helpers.js";

interface CapabilitiesResponse {
  canvas: string;
  fileExtension: string;
  baselineTools: string[];
  genericObjectTools: string[];
  pluginTools: string[];
  destructiveTools: string[];
  preferredTools: {
    inspect: string[];
    create: string[];
    update: string[];
    connect: string[];
    layout: string[];
    file: string[];
  };
  usageGuidance: string[];
}

describe("MCP canvas capabilities", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-capabilities-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("advertises Excalidraw shape workflows without JSON Canvas card tools", async () => {
    const capabilities = await getCapabilities(createExcalidrawPlugin());

    expect(capabilities.canvas).toBe("excalidraw");
    expect(capabilities.fileExtension).toBe(".excalidraw");
    expect(capabilities.baselineTools).toContain("get_canvas_state");
    expect(capabilities.baselineTools).toContain("get_canvas_capabilities");
    expect(capabilities.genericObjectTools).toContain("apply_canvas_patch");
    expect(capabilities.pluginTools).toContain("draw_rectangle");
    expect(capabilities.pluginTools).toContain("connect_objects");
    expect(capabilities.pluginTools).not.toContain("add_text_card");
    expect(capabilities.preferredTools.create).toContain("apply_canvas_patch");
    expect(capabilities.preferredTools.connect).toContain("connect_objects");
    expect(capabilities.destructiveTools).toEqual(["delete_object", "clear_canvas", "open_canvas"]);
  });

  it("advertises JSON Canvas card workflows without Excalidraw shape tools", async () => {
    const capabilities = await getCapabilities(createJsonCanvasPlugin());

    expect(capabilities.canvas).toBe("jsoncanvas");
    expect(capabilities.fileExtension).toBe(".canvas");
    expect(capabilities.baselineTools).toContain("get_canvas_state");
    expect(capabilities.baselineTools).toContain("get_canvas_capabilities");
    expect(capabilities.genericObjectTools).toEqual([]);
    expect(capabilities.pluginTools).toContain("add_text_card");
    expect(capabilities.pluginTools).toContain("connect_cards");
    expect(capabilities.pluginTools).not.toContain("draw_rectangle");
    expect(capabilities.preferredTools.create).toContain("add_text_card");
    expect(capabilities.preferredTools.connect).toEqual(["connect_cards"]);
    expect(capabilities.destructiveTools).toEqual(["delete_object", "clear_canvas", "open_canvas"]);
  });

  async function getCapabilities(
    plugin: ReturnType<typeof createExcalidrawPlugin> | ReturnType<typeof createJsonCanvasPlugin>,
  ): Promise<CapabilitiesResponse> {
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

    try {
      return jsonContent<CapabilitiesResponse>(
        await client.callTool({ name: "get_canvas_capabilities", arguments: {} }),
      );
    } finally {
      await close();
    }
  }
});
