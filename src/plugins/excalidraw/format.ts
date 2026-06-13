import type { Scene, SerializedScene } from "../../core/scene.js";

export function serializeScene(scene: Scene): SerializedScene {
  return {
    type: "excalidraw",
    version: 2,
    source: "agentic-canvas",
    elements: scene.elements,
    appState: {
      viewBackgroundColor: scene.appState.viewBackgroundColor,
    },
    files: scene.files,
  };
}

export function deserializeScene(raw: string): Scene {
  const parsed = JSON.parse(raw) as Partial<SerializedScene>;
  if (parsed.type !== "excalidraw" || !Array.isArray(parsed.elements)) {
    throw new Error("Invalid .excalidraw file");
  }

  return {
    elements: parsed.elements,
    appState: {
      viewBackgroundColor: parsed.appState?.viewBackgroundColor ?? "#ffffff",
    },
    files: parsed.files ?? {},
    version: 0,
  };
}
