import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  type ExportRequestMessage,
  type SelectionRequestMessage,
  type SelectionSetRequestMessage,
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

export interface SelectionOptions {
  timeoutMs?: number;
}

export interface BrowserSelection {
  selectedIds: string[];
}

export interface BrowserSelectionSet {
  selectedIds: string[];
}

interface PendingExport {
  resolve(value: BrowserExport): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface PendingSelection {
  resolve(value: BrowserSelection): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface PendingSelectionSet {
  resolve(value: BrowserSelectionSet): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface ClientState {
  socket: WebSocket;
  lastSyncedOrder: number;
  lastSyncedVersion: number;
  supportsSelectionSet: boolean;
}

export class WsBridge {
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly pendingExports = new Map<string, PendingExport>();
  private readonly pendingSelections = new Map<string, PendingSelection>();
  private readonly pendingSelectionSets = new Map<string, PendingSelectionSet>();
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
    const client = this.mostRecentlySyncedClient();
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
        this.pendingExports.delete(id);
        reject(new Error("Screenshot export timed out"));
      }, options.timeoutMs ?? 5000);

      this.pendingExports.set(id, { resolve, reject, timer });
      client.socket.send(JSON.stringify(request));
    });
  }

  requestSelection(options: SelectionOptions = {}): Promise<BrowserSelection> {
    const client = this.mostRecentlySyncedClient();
    if (!client) {
      return Promise.reject(new Error("No browser canvas client is connected"));
    }

    const id = randomUUID();
    const request: SelectionRequestMessage = {
      type: "selection:request",
      id,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSelections.delete(id);
        reject(new Error("Selection request timed out"));
      }, options.timeoutMs ?? 5000);

      this.pendingSelections.set(id, { resolve, reject, timer });
      client.socket.send(JSON.stringify(request));
    });
  }

  requestSetSelection(
    selectedIds: string[],
    options: SelectionOptions = {},
  ): Promise<BrowserSelectionSet> {
    const client = this.mostRecentlySyncedClient((candidate) => candidate.supportsSelectionSet);
    if (!client) {
      if (this.connectedClientCount() > 0) {
        return Promise.reject(
          new Error("No browser canvas client supports programmatic selection"),
        );
      }
      return Promise.reject(new Error("No browser canvas client is connected"));
    }

    const id = randomUUID();
    const request: SelectionSetRequestMessage = {
      type: "selection:set",
      id,
      selectedIds,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSelectionSets.delete(id);
        reject(new Error("Selection set timed out"));
      }, options.timeoutMs ?? 5000);

      this.pendingSelectionSets.set(id, { resolve, reject, timer });
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
      supportsSelectionSet: false,
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
      const client = this.clients.get(socket);
      if (client) {
        client.supportsSelectionSet = Boolean(message.capabilities?.selectionSet);
      }
      this.sendScene(socket, this.controller.getSnapshot());
      return;
    }

    if (message.type === "scene:changed") {
      if (
        message.canvas !== this.controller.canvasName ||
        message.baseVersion < this.controller.currentVersion()
      ) {
        this.sendScene(socket, this.controller.getSnapshot());
        return;
      }

      try {
        this.controller.replaceFromBrowser(message.scene, message.appState, socket);
        this.markClientSynced(socket, this.controller.currentVersion());
      } catch {
        this.sendScene(socket, this.controller.getSnapshot());
      }
      return;
    }

    if (message.type === "export:result" || message.type === "export:error") {
      const pending = this.pendingExports.get(message.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingExports.delete(message.id);
      if (message.type === "export:result") {
        pending.resolve({ mimeType: message.mimeType, base64: message.base64 });
      } else {
        pending.reject(new Error(message.message));
      }
      return;
    }

    if (message.type === "selection:result" || message.type === "selection:error") {
      const pending = this.pendingSelections.get(message.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingSelections.delete(message.id);
      if (message.type === "selection:result") {
        pending.resolve({ selectedIds: message.selectedIds });
      } else {
        pending.reject(new Error(message.message));
      }
      return;
    }

    if (message.type === "selection:set:result" || message.type === "selection:set:error") {
      const pending = this.pendingSelectionSets.get(message.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingSelectionSets.delete(message.id);
      if (message.type === "selection:set:result") {
        pending.resolve({ selectedIds: message.selectedIds });
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
        canvas: snapshot.canvas,
        version: snapshot.version,
        scene: snapshot.native,
        appState: snapshot.appState,
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

  private mostRecentlySyncedClient(
    predicate: (client: ClientState) => boolean = () => true,
  ): ClientState | undefined {
    return [...this.clients.values()]
      .filter((candidate) => candidate.socket.readyState === WebSocket.OPEN && predicate(candidate))
      .sort((left, right) => right.lastSyncedOrder - left.lastSyncedOrder)[0];
  }
}
