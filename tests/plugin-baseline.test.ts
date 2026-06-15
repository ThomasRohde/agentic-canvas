import { describe, expect, it } from "vitest";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";

describe("Excalidraw plugin baseline ops", () => {
  it("creates, lists, gets, updates, deletes, clears, and serializes objects", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();
    const created = plugin.createObject(scene, {
      type: "rectangle",
      x: 10,
      y: 20,
      width: 120,
      height: 60,
      text: "Box",
    });

    expect(plugin.listObjects(scene).map((object) => object.type)).toEqual(["rectangle", "text"]);
    expect(plugin.getObject(scene, created.id)?.text).toBeUndefined();
    const label = plugin.listObjects(scene, "text")[0];
    expect(label?.text).toBe("Box");
    expect(plugin.getObject(scene, label?.id ?? "")?.raw.textAlign).toBe("center");
    expect(plugin.getObject(scene, label?.id ?? "")?.raw.verticalAlign).toBe("middle");
    expect(plugin.getObject(scene, label?.id ?? "")?.raw.autoResize).toBe(false);
    expect(plugin.getObject(scene, label?.id ?? "")?.raw.y).toBeCloseTo(37.5);
    expect(plugin.getObject(scene, label?.id ?? "")?.containerId).toBe(created.id);
    expect(created.raw.boundElements).toContainEqual({ id: label?.id, type: "text" });

    plugin.updateObject(scene, created.id, { x: 30, text: "Updated" });
    expect(plugin.getObject(scene, created.id)?.x).toBe(30);
    const updatedLabel = plugin.listObjects(scene, "text")[0];
    expect(updatedLabel?.text).toBe("Updated");
    expect(updatedLabel?.x).toBe(30);

    const serialized = plugin.serialize(scene);
    const reopened = plugin.deserialize(JSON.stringify(serialized));
    expect(plugin.listObjects(reopened).length).toBe(2);

    expect(plugin.deleteObjects(scene, [created.id])).toEqual([created.id, label?.id]);
    expect(plugin.listObjects(scene).map((object) => object.type)).toEqual([]);

    plugin.createObject(scene, { type: "ellipse", x: 0, y: 0 });
    plugin.clear(scene);
    expect(plugin.listObjects(scene)).toEqual([]);
  });

  it("uses frame names without creating redundant bound text labels", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();

    const frame = plugin.createObject(scene, {
      type: "frame",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      text: "Group",
    });

    expect(frame.raw.name).toBe("Group");
    expect(plugin.listObjects(scene).map((object) => object.type)).toEqual(["frame"]);
    expect(plugin.listObjects(scene, "text")).toEqual([]);
  });

  it("recomputes bound labels and arrows after updates", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();
    const rectangle = plugin.createObject(scene, {
      type: "rectangle",
      x: 100,
      y: 100,
      width: 160,
      height: 80,
      text: "Label",
    });
    const label = plugin.listObjects(scene, "text")[0];

    plugin.updateObject(scene, rectangle.id, { x: 400, y: 400, width: 200, height: 100 });
    const movedLabel = plugin.getObject(scene, label.id);
    expect(movedLabel?.x).toBe(400);
    expect(movedLabel?.y).toBeCloseTo(437.5);
    expect(movedLabel?.width).toBe(200);

    const left = plugin.createObject(scene, {
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const right = plugin.createObject(scene, {
      type: "rectangle",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
    });
    const arrow = plugin.createObject(scene, {
      type: "arrow",
      x: 0,
      y: 0,
      start: { elementId: left.id },
      end: { elementId: right.id },
      text: "to",
    });
    const originalArrow = plugin.getObject(scene, arrow.id);

    plugin.updateObject(scene, left.id, { y: 300 });
    const movedArrow = plugin.getObject(scene, arrow.id);
    expect(movedArrow?.raw.startBinding?.elementId).toBe(left.id);
    expect(movedArrow?.raw.endBinding?.elementId).toBe(right.id);
    expect(movedArrow?.y).not.toBe(originalArrow?.y);
    expect(movedArrow?.points).not.toEqual(originalArrow?.points);
    const arrowLabel = plugin.listObjects(scene, "text").find((object) => object.text === "to");
    expect(plugin.getObject(scene, arrowLabel?.id ?? "")?.containerId).toBe(arrow.id);
    expect(arrowLabel?.x).not.toBe(originalArrow?.x);
  });

  it("measures standalone text using font size and multiline height", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();
    const small = plugin.createObject(scene, {
      type: "text",
      x: 0,
      y: 0,
      text: "WWWWWWWWWW",
      style: { fontSize: 20 },
    });
    const large = plugin.createObject(scene, {
      type: "text",
      x: 0,
      y: 80,
      text: "WWWWWWWWWW",
      style: { fontSize: 40 },
    });
    const multiline = plugin.createObject(scene, {
      type: "text",
      x: 0,
      y: 160,
      text: "line one\nline two longer\nl3",
    });

    expect(large.width).toBeGreaterThan(small.width);
    expect(multiline.height).toBe(75);
  });

  it("rejects invalid text, color, and degenerate geometry", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();

    expect(() => plugin.createObject(scene, { type: "text", x: 0, y: 0, text: "" })).toThrow(
      /Text must not be empty/,
    );
    expect(() => plugin.createObject(scene, { type: "text", x: 0, y: 0 })).toThrow(
      /Text must not be empty/,
    );
    expect(() =>
      plugin.createObject(scene, {
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        style: { strokeColor: "banana" },
      }),
    ).toThrow(/Invalid strokeColor/);
    expect(() =>
      plugin.createObject(scene, { type: "line", x: 0, y: 0, points: [[0, 0]] }),
    ).toThrow(/at least two points/);
    expect(() =>
      plugin.createObject(scene, { type: "rectangle", x: 0, y: 0, width: 0, height: 80 }),
    ).toThrow(/Width must be greater than zero/);
  });

  it("rejects type-incompatible updates before mutating geometry", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();
    const rectangle = plugin.createObject(scene, {
      type: "rectangle",
      x: 10,
      y: 20,
      width: 120,
      height: 60,
    });

    expect(() =>
      plugin.updateObject(scene, rectangle.id, {
        points: [
          [0, 0],
          [10, 10],
        ],
      }),
    ).toThrow(/Points can only update line or arrow objects/);
    expect(() => plugin.updateObject(scene, rectangle.id, { start: { x: 0, y: 0 } })).toThrow(
      /Arrow endpoints cannot be updated/,
    );
    expect(() => plugin.updateObject(scene, rectangle.id, { end: { x: 10, y: 10 } })).toThrow(
      /Arrow endpoints cannot be updated/,
    );
    expect(() => plugin.updateObject(scene, rectangle.id, { containerId: "container" })).toThrow(
      /containerId can only be updated on text objects/,
    );

    expect(plugin.getObject(scene, rectangle.id)).toMatchObject({
      x: 10,
      y: 20,
      width: 120,
      height: 60,
    });

    const line = plugin.createObject(scene, {
      type: "line",
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 0],
      ],
    });
    const arrow = plugin.createObject(scene, {
      type: "arrow",
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 0],
      ],
    });

    expect(() => plugin.updateObject(scene, line.id, { width: 200 })).toThrow(
      /Line and arrow dimensions cannot be updated directly/,
    );
    expect(() => plugin.updateObject(scene, arrow.id, { height: 200 })).toThrow(
      /Line and arrow dimensions cannot be updated directly/,
    );
  });

  it("rejects bound arrow self-loops", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();
    const rectangle = plugin.createObject(scene, {
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });

    expect(() =>
      plugin.createObject(scene, {
        type: "arrow",
        x: 0,
        y: 0,
        start: { elementId: rectangle.id },
        end: { elementId: rectangle.id },
      }),
    ).toThrow(/Arrow self-loops are not supported/);
    expect(plugin.listObjects(scene, "arrow")).toEqual([]);
  });
});
