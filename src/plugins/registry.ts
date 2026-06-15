import type { CanvasPlugin } from "../core/plugin.js";
import { createExcalidrawPlugin } from "./excalidraw/index.js";
import { createJsonCanvasPlugin } from "./jsoncanvas/index.js";

export const canvasPlugins = {
  excalidraw: createExcalidrawPlugin,
  jsoncanvas: createJsonCanvasPlugin,
} satisfies Record<string, () => CanvasPlugin>;

export type CanvasPluginKey = keyof typeof canvasPlugins;

export function availableCanvasNames(): string[] {
  return Object.keys(canvasPlugins);
}

export function createCanvasPlugin(name: string): CanvasPlugin {
  const createPlugin = canvasPlugins[name as CanvasPluginKey];
  if (!createPlugin) {
    throw new Error(
      `Unknown canvas "${name}". Available canvases: ${availableCanvasNames().join(", ")}`,
    );
  }

  return createPlugin();
}
