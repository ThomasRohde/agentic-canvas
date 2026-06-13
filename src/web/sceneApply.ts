import type { SceneSetMessage } from "../shared/protocol.js";

export interface RemoteSceneApi {
  updateScene(scene: Record<string, unknown>): void;
}

export interface ApplyRemoteSceneOptions {
  api: RemoteSceneApi;
  message: SceneSetMessage;
  captureUpdate: unknown;
  restoreElements(elements: SceneSetMessage["elements"]): readonly unknown[];
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
  const applyElements = (elements: readonly unknown[]) => {
    rememberAppliedScene(elements);
    setAppliedVersion(message.version);
    api.updateScene({
      elements,
      appState: message.appState,
      files: message.files ?? {},
      captureUpdate,
    });
    setVisibleVersion(message.version);
  };

  try {
    applyElements(restoreElements(message.elements));
    return { applied: "restored", requestedFullScene: false };
  } catch (error) {
    onError?.(error, "restore");
  }

  try {
    applyElements(message.elements);
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
