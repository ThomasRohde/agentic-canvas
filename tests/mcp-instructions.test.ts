import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServer } from "../src/mcp/buildServer.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { connectInMemory } from "./helpers.js";

describe("MCP server instructions", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("returns canvas operation instructions during initialization", async () => {
    const plugin = createExcalidrawPlugin();
    const server = buildMcpServer({
      plugin,
      controller: new CanvasController(plugin),
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
      expect(client.getInstructions()).toContain("get_canvas_capabilities");
      expect(client.getInstructions()).toContain("clear_canvas");
    } finally {
      await close();
    }
  });
});
