import { describe, expect, it } from "vitest";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { CanvasController, type SceneSnapshot } from "../src/server/canvasController.js";

describe("CanvasController", () => {
  it("commits transactions with one final notification", () => {
    const controller = new CanvasController(createExcalidrawPlugin());
    const snapshots: SceneSnapshot[] = [];
    controller.setChangeListener((snapshot) => {
      snapshots.push(snapshot);
    });

    controller.transaction(() => {
      controller.createObject({ type: "rectangle", x: 0, y: 0 });
      controller.createObject({ type: "ellipse", x: 200, y: 0 });
      controller.createObject({
        type: "arrow",
        x: 0,
        y: 0,
        start: { x: 160, y: 40 },
        end: { x: 200, y: 40 },
      });
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.version).toBe(1);
    expect((snapshots[0]?.native as { elements?: unknown[] }).elements).toHaveLength(3);
  });

  it("keeps scene versions monotonic when opening serialized scenes", () => {
    const controller = new CanvasController(createExcalidrawPlugin());
    controller.createObject({ type: "rectangle", x: 0, y: 0 });
    const serialized = controller.serialize();
    controller.createObject({ type: "ellipse", x: 200, y: 0 });
    const versionBeforeOpen = controller.currentVersion();

    controller.deserialize(serialized);

    expect(controller.currentVersion()).toBe(versionBeforeOpen + 1);
    expect(controller.listObjects()).toHaveLength(1);
  });

  it("rolls back failed transactions without notifying", () => {
    const controller = new CanvasController(createExcalidrawPlugin());
    const snapshots: SceneSnapshot[] = [];
    controller.setChangeListener((snapshot) => {
      snapshots.push(snapshot);
    });

    expect(() =>
      controller.transaction(() => {
        controller.createObject({ type: "rectangle", x: 0, y: 0 });
        throw new Error("stop");
      }),
    ).toThrow(/stop/);

    expect(controller.listObjects()).toEqual([]);
    expect(snapshots).toEqual([]);
    expect(controller.currentVersion()).toBe(0);
  });

  it("supports bounded in-memory undo and redo", () => {
    const controller = new CanvasController(createExcalidrawPlugin());
    const rectangle = controller.createObject({ type: "rectangle", x: 0, y: 0 });
    controller.updateObject(rectangle.id, { x: 100 });

    expect(controller.undo()).toBe(true);
    expect(controller.getObject(rectangle.id)?.x).toBe(0);
    expect(controller.redo()).toBe(true);
    expect(controller.getObject(rectangle.id)?.x).toBe(100);
  });
});
