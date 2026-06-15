import { buildMcpServer } from "../../src/mcp/buildServer.js";
import { createFlowPlugin } from "../../src/plugins/flow/index.js";
import { CanvasController } from "../../src/server/canvasController.js";
import type { Workspace } from "../../src/server/workspace.js";
import { connectInMemory } from "../helpers.js";

export async function connectFlow(workspace: Workspace) {
  const plugin = createFlowPlugin();
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
  return { client, close, controller, plugin };
}
