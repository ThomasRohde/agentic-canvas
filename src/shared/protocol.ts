import type { AppState, BinaryFiles, ExcalidrawElement } from "../core/scene.js";

export type BrowserToServerMessage =
  | HelloMessage
  | SceneChangedMessage
  | ExportResultMessage
  | ExportErrorMessage;

export type ServerToBrowserMessage = SceneSetMessage | ExportRequestMessage;

export interface HelloMessage {
  type: "hello";
}

export interface SceneChangedMessage {
  type: "scene:changed";
  baseVersion: number;
  elements: ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
}

export interface ExportResultMessage {
  type: "export:result";
  id: string;
  mimeType: string;
  base64: string;
}

export interface ExportErrorMessage {
  type: "export:error";
  id: string;
  message: string;
}

export interface SceneSetMessage {
  type: "scene:set";
  version: number;
  elements: ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
}

export interface ExportRequestMessage {
  type: "export:request";
  id: string;
  mimeType?: "image/png";
  exportPadding?: number;
}

export function parseBrowserMessage(data: string): BrowserToServerMessage | undefined {
  try {
    const parsed = JSON.parse(data) as BrowserToServerMessage;
    if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
