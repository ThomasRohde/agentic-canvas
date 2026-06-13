#!/usr/bin/env node
import { parseArgs } from "node:util";
import open from "open";
import { startHttpServer } from "../server/httpServer.js";
import { createLogger } from "../shared/logger.js";
import { CLI_NAME, PACKAGE_NAME, readPackageInfo } from "../shared/packageInfo.js";

const logger = createLogger("info");

async function main(): Promise<void> {
  const packageInfo = readPackageInfo();
  const args = parseArgs({
    allowPositionals: false,
    allowNegative: true,
    options: {
      canvas: { type: "string", default: "excalidraw" },
      port: { type: "string", default: process.env.AGENTIC_CANVAS_PORT ?? "3333" },
      host: { type: "string", default: process.env.AGENTIC_CANVAS_HOST ?? "127.0.0.1" },
      workspace: { type: "string", default: process.env.AGENTIC_CANVAS_WORKSPACE ?? process.cwd() },
      open: { type: "boolean", default: true },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (args.values.help) {
    printHelp();
    return;
  }

  if (args.values.version) {
    console.log(packageInfo.version);
    return;
  }

  if (args.values.canvas !== "excalidraw") {
    throw new Error(`Unknown canvas "${args.values.canvas}". Available canvases: excalidraw`);
  }

  const requestedPort = Number(args.values.port);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error(`Invalid port: ${args.values.port}`);
  }

  const running = await startHttpServer({
    canvas: "excalidraw",
    host: String(args.values.host),
    port: requestedPort,
    workspace: String(args.values.workspace),
  });

  console.log(`Canvas: ${running.canvasUrl}`);
  console.log(`MCP: ${running.mcpUrl}`);

  if (args.values.open) {
    await open(running.canvasUrl);
  }
}

function printHelp(): void {
  console.log(`${CLI_NAME}

Start a local Excalidraw canvas with an MCP Streamable HTTP endpoint.

Usage:
  npx ${PACKAGE_NAME} --canvas excalidraw
  ${CLI_NAME} --canvas excalidraw

Options:
  --canvas <name>      Canvas plugin, currently excalidraw (default: excalidraw)
  --port <n>           Port (default: 3333 or AGENTIC_CANVAS_PORT)
  --host <host>        Bind host (default: 127.0.0.1 or AGENTIC_CANVAS_HOST)
  --workspace <dir>    Save/open/screenshot workspace (default: cwd)
  --open, --no-open    Open browser on startup (default: open)
  -h, --help           Show help
  -v, --version        Show version`);
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
