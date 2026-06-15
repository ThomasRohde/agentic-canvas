export type BrowserToServerMessage =
  | HelloMessage
  | SceneChangedMessage
  | ExportResultMessage
  | ExportErrorMessage
  | SelectionResultMessage
  | SelectionErrorMessage
  | SelectionSetResultMessage
  | SelectionSetErrorMessage;

export type ServerToBrowserMessage =
  | SceneSetMessage
  | ExportRequestMessage
  | SelectionRequestMessage
  | SelectionSetRequestMessage;

export interface HelloMessage {
  type: "hello";
  capabilities?: {
    selectionSet?: boolean;
  };
}

export interface SceneChangedMessage {
  type: "scene:changed";
  canvas: string;
  baseVersion: number;
  scene: unknown;
  appState?: unknown;
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

export interface SelectionResultMessage {
  type: "selection:result";
  id: string;
  selectedIds: string[];
}

export interface SelectionErrorMessage {
  type: "selection:error";
  id: string;
  message: string;
}

export interface SelectionSetResultMessage {
  type: "selection:set:result";
  id: string;
  selectedIds: string[];
}

export interface SelectionSetErrorMessage {
  type: "selection:set:error";
  id: string;
  message: string;
}

export interface SceneSetMessage {
  type: "scene:set";
  canvas: string;
  version: number;
  scene: unknown;
  appState?: unknown;
}

export interface ExportRequestMessage {
  type: "export:request";
  id: string;
  mimeType?: "image/png";
  exportPadding?: number;
}

export interface SelectionRequestMessage {
  type: "selection:request";
  id: string;
}

export interface SelectionSetRequestMessage {
  type: "selection:set";
  id: string;
  selectedIds: string[];
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
