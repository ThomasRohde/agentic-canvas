import type { ExcalidrawNative, Scene, SerializedExcalidrawScene } from "../../core/scene.js";

export function serializeScene(scene: Scene): SerializedExcalidrawScene {
  const native = scene.native as ExcalidrawNative;
  return {
    type: "excalidraw",
    version: 2,
    source: "agentic-canvas",
    elements: native.elements,
    appState: {
      viewBackgroundColor:
        (scene.appState as { viewBackgroundColor?: string }).viewBackgroundColor ?? "#ffffff",
    },
    files: native.files,
  };
}

export function deserializeScene(raw: string): Scene {
  const parsed = JSON.parse(raw) as Partial<SerializedExcalidrawScene>;
  if (parsed.type !== "excalidraw" || !Array.isArray(parsed.elements)) {
    throw new Error("Invalid .excalidraw file");
  }

  return {
    native: {
      elements: parsed.elements,
      files: parsed.files ?? {},
    },
    appState: {
      viewBackgroundColor: parsed.appState?.viewBackgroundColor ?? "#ffffff",
    },
    version: 0,
  };
}
