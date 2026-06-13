import { exportToBlob } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawElement } from "../core/scene.js";

export interface ExportSceneOptions {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  exportPadding?: number;
}

export async function exportSceneToBase64(options: ExportSceneOptions): Promise<{
  mimeType: string;
  base64: string;
}> {
  const blob = await exportToBlob({
    elements: options.elements as never,
    appState: {
      viewBackgroundColor: options.appState.viewBackgroundColor ?? "#ffffff",
      exportBackground: true,
    },
    files: options.files as never,
    mimeType: "image/png",
    exportPadding: options.exportPadding ?? 16,
  });

  return {
    mimeType: blob.type || "image/png",
    base64: await blobToBase64(blob),
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
