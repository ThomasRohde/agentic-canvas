import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CanvasPlugin } from "../core/plugin.js";
import type { CanvasController } from "../server/canvasController.js";
import type { Workspace } from "../server/workspace.js";
import { MCP_SERVER_NAME, readPackageInfo } from "../shared/packageInfo.js";
import type { ExportResult, SelectionResult, SelectionSetResult } from "./baselineTools.js";
import { registerBaselineTools } from "./baselineTools.js";

export interface BuildMcpServerOptions {
  plugin: CanvasPlugin;
  controller: CanvasController;
  workspace: Workspace;
  clientsConnected(): number;
  requestExport(options: { exportPadding?: number }): Promise<ExportResult>;
  requestSelection(options?: { timeoutMs?: number }): Promise<SelectionResult>;
  requestSetSelection(
    selectedIds: string[],
    options?: { timeoutMs?: number },
  ): Promise<SelectionSetResult>;
}

export function buildMcpServer(options: BuildMcpServerOptions): McpServer {
  const packageInfo = readPackageInfo();
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: packageInfo.version,
  });

  registerBaselineTools(server, {
    controller: options.controller,
    workspace: options.workspace,
    clientsConnected: options.clientsConnected,
    requestExport: options.requestExport,
    requestSelection: options.requestSelection,
    requestSetSelection: options.requestSetSelection,
  });

  options.plugin.registerTools(server, {
    controller: options.controller,
  });

  return server;
}
