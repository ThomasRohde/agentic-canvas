import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { ExcalidrawElement } from "../core/scene.js";
import {
  type ExportRequestMessage,
  type ServerToBrowserMessage,
  parseBrowserMessage,
} from "../shared/protocol.js";
import type { CanvasController, SceneSnapshot } from "./canvasController.js";

export interface ExportOptions {
  exportPadding?: number;
  timeoutMs?: number;
}

export interface BrowserExport {
  mimeType: string;
  base64: string;
}

interface PendingExport {
  resolve(value: BrowserExport): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface ClientState {
  socket: WebSocket;
  lastSyncedOrder: number;
  lastSyncedVersion: number;
}

export class WsBridge {
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly pending = new Map<string, PendingExport>();
  private syncOrder = 0;
  private wss?: WebSocketServer;

  constructor(private readonly controller: CanvasController) {}

  attach(server: Server, path = "/ws"): void {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (socket) => this.handleConnection(socket));

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== path || !this.wss) {
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss?.emit("connection", ws, request);
      });
    });
  }

  connectedClientCount(): number {
    return this.clients.size;
  }

  broadcastScene(snapshot: SceneSnapshot, origin?: unknown): void {
    for (const { socket } of this.clients.values()) {
      if (socket !== origin) {
        this.sendScene(socket, snapshot);
      }
    }

    if (origin instanceof WebSocket) {
      this.markClientSynced(origin, snapshot.version);
    }
  }

  requestExport(options: ExportOptions = {}): Promise<BrowserExport> {
    const client = [...this.clients.values()]
      .filter((candidate) => candidate.socket.readyState === WebSocket.OPEN)
      .sort((left, right) => right.lastSyncedOrder - left.lastSyncedOrder)[0];
    if (!client) {
      return Promise.reject(new Error("No browser canvas client is connected"));
    }

    const id = randomUUID();
    const request: ExportRequestMessage = {
      type: "export:request",
      id,
      mimeType: "image/png",
      exportPadding: options.exportPadding,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Screenshot export timed out"));
      }, options.timeoutMs ?? 5000);

      this.pending.set(id, { resolve, reject, timer });
      client.socket.send(JSON.stringify(request));
    });
  }

  close(): void {
    for (const { socket } of this.clients.values()) {
      socket.close();
    }
    this.wss?.close();
  }

  private handleConnection(socket: WebSocket): void {
    this.clients.set(socket, {
      socket,
      lastSyncedOrder: 0,
      lastSyncedVersion: -1,
    });
    socket.on("message", (data) => this.handleMessage(socket, data.toString()));
    socket.on("close", () => {
      this.clients.delete(socket);
    });
    this.sendScene(socket, this.controller.getSnapshot());
  }

  private handleMessage(socket: WebSocket, data: string): void {
    const message = parseBrowserMessage(data);
    if (!message) {
      return;
    }

    if (message.type === "hello") {
      this.sendScene(socket, this.controller.getSnapshot());
      return;
    }

    if (message.type === "scene:changed") {
      if (message.baseVersion < this.controller.currentVersion()) {
        this.sendScene(socket, this.controller.getSnapshot());
        return;
      }

      this.controller.replaceFromBrowser(
        message.elements as ExcalidrawElement[],
        message.appState,
        message.files,
        socket,
      );
      this.markClientSynced(socket, this.controller.currentVersion());
      return;
    }

    if (message.type === "export:result" || message.type === "export:error") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.type === "export:result") {
        pending.resolve({ mimeType: message.mimeType, base64: message.base64 });
      } else {
        pending.reject(new Error(message.message));
      }
    }
  }

  private sendScene(socket: WebSocket, snapshot: SceneSnapshot): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: "scene:set",
        version: snapshot.version,
        elements: snapshot.elements,
        appState: snapshot.appState,
        files: snapshot.files,
      } satisfies ServerToBrowserMessage),
    );
    this.markClientSynced(socket, snapshot.version);
  }

  private markClientSynced(socket: WebSocket, version: number): void {
    const client = this.clients.get(socket);
    if (!client) {
      return;
    }

    client.lastSyncedOrder = ++this.syncOrder;
    client.lastSyncedVersion = version;
  }
}
