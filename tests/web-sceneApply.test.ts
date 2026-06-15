import { describe, expect, it, vi } from "vitest";
import type { SceneSetMessage } from "../src/shared/protocol.js";
import { applyRemoteSceneToCanvas } from "../src/web/sceneApply.js";

const message: SceneSetMessage = {
  type: "scene:set",
  canvas: "excalidraw",
  version: 7,
  scene: {
    elements: [
      {
        id: "A",
        index: "a1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        angle: 0,
        strokeColor: "#000",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
      },
    ],
    files: {},
  },
  appState: { viewBackgroundColor: "#ffffff" },
};

describe("applyRemoteSceneToCanvas", () => {
  it("falls back to raw elements and requests a full scene when restore fails", () => {
    const updateScene = vi.fn();
    const rememberAppliedScene = vi.fn();
    const setAppliedVersion = vi.fn();
    const setVisibleVersion = vi.fn();
    const requestFullScene = vi.fn();
    const onError = vi.fn();

    const result = applyRemoteSceneToCanvas({
      api: { updateScene },
      message,
      captureUpdate: "immediately",
      restoreElements: () => {
        throw new Error("restore failed");
      },
      rememberAppliedScene,
      setAppliedVersion,
      setVisibleVersion,
      requestFullScene,
      shouldRequestFullScene: () => true,
      onError,
    });

    expect(result).toEqual({ applied: "raw", requestedFullScene: true });
    expect(updateScene).toHaveBeenCalledWith({
      elements: sceneElements(message),
      appState: message.appState,
      files: {},
      captureUpdate: "immediately",
    });
    expect(rememberAppliedScene).toHaveBeenCalledWith(sceneElements(message));
    expect(setAppliedVersion).toHaveBeenCalledWith(7);
    expect(setVisibleVersion).toHaveBeenCalledWith(7);
    expect(requestFullScene).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "restore");
  });

  it("does not repeatedly request the same failed scene version", () => {
    const result = applyRemoteSceneToCanvas({
      api: { updateScene: vi.fn() },
      message,
      captureUpdate: "immediately",
      restoreElements: () => {
        throw new Error("restore failed");
      },
      rememberAppliedScene: vi.fn(),
      setAppliedVersion: vi.fn(),
      setVisibleVersion: vi.fn(),
      requestFullScene: vi.fn(),
      shouldRequestFullScene: () => false,
    });

    expect(result).toEqual({ applied: "raw", requestedFullScene: false });
  });
});

function sceneElements(message: SceneSetMessage): unknown[] {
  return (message.scene as { elements: unknown[] }).elements;
}
