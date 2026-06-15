import { existsSync } from "node:fs";
import { type Server, createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvasPlugin } from "../plugins/registry.js";
import { createApp } from "./app.js";
import { CanvasController } from "./canvasController.js";
import { Workspace } from "./workspace.js";
import { WsBridge } from "./wsBridge.js";

export interface StartServerOptions {
  host: string;
  port: number;
  workspace: string;
  canvas: string;
}

export interface RunningServer {
  host: string;
  port: number;
  canvasUrl: string;
  mcpUrl: string;
  server: Server;
  controller: CanvasController;
  bridge: WsBridge;
  close(): Promise<void>;
}

export async function startHttpServer(options: StartServerOptions): Promise<RunningServer> {
  const port = await findFreePort(options.host, options.port);
  const workspace = new Workspace(options.workspace);
  await workspace.ensure();

  const plugin = createCanvasPlugin(options.canvas);
  const controller = new CanvasController(plugin);
  const bridge = new WsBridge(controller);
  controller.setChangeListener((snapshot, origin) => bridge.broadcastScene(snapshot, origin));

  const app = createApp({
    plugin,
    controller,
    workspace,
    webDistDir: findWebDistDir(),
    allowedHosts: allowedHostsFor(options.host, port),
    clientsConnected: () => bridge.connectedClientCount(),
    requestExport: (exportOptions) => bridge.requestExport(exportOptions),
    requestSelection: (selectionOptions) => bridge.requestSelection(selectionOptions),
    requestSetSelection: (selectedIds, selectionOptions) =>
      bridge.requestSetSelection(selectedIds, selectionOptions),
  });

  const server = createServer(app);
  bridge.attach(server);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    host: options.host,
    port,
    canvasUrl: `http://${options.host}:${port}`,
    mcpUrl: `http://${options.host}:${port}/mcp`,
    server,
    controller,
    bridge,
    close: () =>
      new Promise((resolve, reject) => {
        bridge.close();
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

export async function findFreePort(host: string, requestedPort: number): Promise<number> {
  for (let port = requestedPort; port < requestedPort + 20; port += 1) {
    if (await canListen(host, port)) {
      return port;
    }
  }

  throw new Error(`No free port found starting at ${requestedPort}`);
}

function canListen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

function allowedHostsFor(host: string, port: number): string[] {
  const hosts = new Set(["127.0.0.1", "localhost", host]);
  for (const hostname of [...hosts]) {
    hosts.add(`${hostname}:${port}`);
  }
  return [...hosts];
}

function findWebDistDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../web"),
    path.resolve(here, "../../dist/web"),
    path.resolve(process.cwd(), "dist/web"),
  ];
  return (
    candidates.find((candidate) => existsSync(path.join(candidate, "index.html"))) ?? candidates[2]
  );
}
