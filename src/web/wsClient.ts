import type { AppState, BinaryFiles, ExcalidrawElement } from "../core/scene.js";
import type {
  BrowserToServerMessage,
  ExportRequestMessage,
  SceneSetMessage,
  SelectionRequestMessage,
  SelectionSetRequestMessage,
  ServerToBrowserMessage,
} from "../shared/protocol.js";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export interface CanvasWsClientHandlers {
  onStateChange(state: ConnectionState): void;
  onSceneSet(message: SceneSetMessage): void;
  onExportRequest(message: ExportRequestMessage): void;
  onSelectionRequest(message: SelectionRequestMessage): void;
  onSelectionSetRequest(message: SelectionSetRequestMessage): void;
}

export class CanvasWsClient {
  private socket?: WebSocket;
  private closed = false;
  private reconnectTimer?: number;

  constructor(private readonly handlers: CanvasWsClientHandlers) {}

  connect(): void {
    this.closed = false;
    this.handlers.onStateChange("connecting");
    const url = new URL("/ws", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(url);

    this.socket.addEventListener("open", () => {
      this.handlers.onStateChange("connected");
      this.requestFullScene();
    });

    this.socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);
      if (!message) {
        return;
      }

      if (message.type === "scene:set") {
        this.handlers.onSceneSet(message);
      } else if (message.type === "export:request") {
        this.handlers.onExportRequest(message);
      } else if (message.type === "selection:request") {
        this.handlers.onSelectionRequest(message);
      } else {
        this.handlers.onSelectionSetRequest(message);
      }
    });

    this.socket.addEventListener("close", () => {
      this.handlers.onStateChange("disconnected");
      if (!this.closed) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1000);
      }
    });
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.socket?.close();
  }

  sendSceneChanged(
    baseVersion: number,
    elements: ExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ): void {
    this.send({ type: "scene:changed", baseVersion, elements, appState, files });
  }

  sendExportResult(id: string, mimeType: string, base64: string): void {
    this.send({ type: "export:result", id, mimeType, base64 });
  }

  sendExportError(id: string, message: string): void {
    this.send({ type: "export:error", id, message });
  }

  sendSelectionResult(id: string, selectedIds: string[]): void {
    this.send({ type: "selection:result", id, selectedIds });
  }

  sendSelectionError(id: string, message: string): void {
    this.send({ type: "selection:error", id, message });
  }

  sendSelectionSetResult(id: string, selectedIds: string[]): void {
    this.send({ type: "selection:set:result", id, selectedIds });
  }

  sendSelectionSetError(id: string, message: string): void {
    this.send({ type: "selection:set:error", id, message });
  }

  requestFullScene(): void {
    this.send({ type: "hello", capabilities: { selectionSet: true } });
  }

  private send(message: BrowserToServerMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}

function parseServerMessage(data: unknown): ServerToBrowserMessage | undefined {
  if (typeof data !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(data) as ServerToBrowserMessage;
    if (
      parsed.type === "scene:set" ||
      parsed.type === "export:request" ||
      parsed.type === "selection:request" ||
      parsed.type === "selection:set"
    ) {
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
