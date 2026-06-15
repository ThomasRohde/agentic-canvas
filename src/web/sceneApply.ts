import type { SceneSetMessage } from "../shared/protocol.js";

export interface RemoteSceneApi {
  updateScene(scene: Record<string, unknown>): void;
}

export interface ApplyRemoteSceneOptions {
  api: RemoteSceneApi;
  message: SceneSetMessage;
  captureUpdate: unknown;
  restoreElements(elements: readonly unknown[]): readonly unknown[];
  rememberAppliedScene(elements: readonly unknown[]): void;
  setAppliedVersion(version: number): void;
  setVisibleVersion(version: number): void;
  requestFullScene(): void;
  shouldRequestFullScene(version: number): boolean;
  onError?(error: unknown, phase: "restore" | "fallback"): void;
}

export interface ApplyRemoteSceneResult {
  applied: "restored" | "raw" | "none";
  requestedFullScene: boolean;
}

export function applyRemoteSceneToCanvas({
  api,
  message,
  captureUpdate,
  restoreElements,
  rememberAppliedScene,
  setAppliedVersion,
  setVisibleVersion,
  requestFullScene,
  shouldRequestFullScene,
  onError,
}: ApplyRemoteSceneOptions): ApplyRemoteSceneResult {
  const payload = excalidrawPayload(message.scene);
  const applyElements = (elements: readonly unknown[]) => {
    rememberAppliedScene(elements);
    setAppliedVersion(message.version);
    api.updateScene({
      elements,
      appState: message.appState,
      files: payload.files,
      captureUpdate,
    });
    setVisibleVersion(message.version);
  };

  try {
    applyElements(restoreElements(payload.elements));
    return { applied: "restored", requestedFullScene: false };
  } catch (error) {
    onError?.(error, "restore");
  }

  try {
    applyElements(payload.elements);
    const requestedFullScene = requestFullSceneOnce(message.version, {
      requestFullScene,
      shouldRequestFullScene,
    });
    return { applied: "raw", requestedFullScene };
  } catch (error) {
    onError?.(error, "fallback");
  }

  return {
    applied: "none",
    requestedFullScene: requestFullSceneOnce(message.version, {
      requestFullScene,
      shouldRequestFullScene,
    }),
  };
}

function excalidrawPayload(scene: unknown): {
  elements: readonly unknown[];
  files: Record<string, unknown>;
} {
  if (
    typeof scene === "object" &&
    scene !== null &&
    "elements" in scene &&
    Array.isArray((scene as { elements?: unknown }).elements)
  ) {
    const payload = scene as { elements: readonly unknown[]; files?: Record<string, unknown> };
    return {
      elements: payload.elements,
      files: payload.files ?? {},
    };
  }

  return { elements: [], files: {} };
}

function requestFullSceneOnce(
  version: number,
  options: Pick<ApplyRemoteSceneOptions, "requestFullScene" | "shouldRequestFullScene">,
): boolean {
  if (!options.shouldRequestFullScene(version)) {
    return false;
  }

  options.requestFullScene();
  return true;
}
