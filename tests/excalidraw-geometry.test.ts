import { describe, expect, it } from "vitest";
import { edgePoint } from "../src/plugins/excalidraw/geometry.js";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";

describe("Excalidraw geometry", () => {
  it("finds edge points for rectangles, ellipses, and diamonds", () => {
    expect(edgePoint({ type: "rectangle", x: 0, y: 0, width: 100, height: 50 }, 200, 25)).toEqual({
      x: 100,
      y: 25,
    });
    expect(edgePoint({ type: "ellipse", x: 0, y: 0, width: 100, height: 50 }, 200, 25)).toEqual({
      x: 100,
      y: 25,
    });

    const diamondPoint = edgePoint(
      { type: "diamond", x: 0, y: 0, width: 100, height: 100 },
      100,
      100,
    );
    expect(diamondPoint.x).toBeCloseTo(75);
    expect(diamondPoint.y).toBeCloseTo(75);
  });

  it("draws element-bound arrows from facing edges instead of centers", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();
    const left = plugin.createObject(scene, {
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 60,
    });
    const right = plugin.createObject(scene, {
      type: "rectangle",
      x: 300,
      y: 0,
      width: 100,
      height: 60,
    });

    const arrow = plugin.createObject(scene, {
      type: "arrow",
      x: 0,
      y: 0,
      start: { elementId: left.id },
      end: { elementId: right.id },
    });

    expect(arrow.raw.x).toBe(100);
    expect(arrow.raw.y).toBe(30);
    expect(arrow.raw.points?.at(-1)).toEqual([200, 0]);
    expect(arrow.raw.startBinding?.gap).toBe(0);
    expect(arrow.raw.endBinding?.gap).toBe(0);
  });
});
