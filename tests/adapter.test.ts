import { describe, expect, it } from "vitest";
import { toCanvasObject, toCanvasObjectSummary } from "../src/plugins/excalidraw/adapter.js";
import { buildElement } from "../src/plugins/excalidraw/elements.js";

describe("Excalidraw adapter", () => {
  it("maps native elements to normalized objects", () => {
    const element = buildElement({
      type: "text",
      x: 5,
      y: 8,
      text: "Note",
      style: { strokeColor: "#123456", fontSize: 30 },
    });

    expect(toCanvasObjectSummary(element)).toMatchObject({
      id: element.id,
      type: "text",
      x: 5,
      y: 8,
      text: "Note",
    });
    expect(toCanvasObject(element)?.style).toMatchObject({
      strokeColor: "#123456",
      fontSize: 30,
    });
  });

  it("ignores deleted or unsupported elements", () => {
    const element = buildElement({ type: "rectangle", x: 0, y: 0 });
    element.isDeleted = true;

    expect(toCanvasObject(element)).toBeUndefined();
    expect(toCanvasObject({ ...element, isDeleted: false, type: "image" })).toBeUndefined();
  });
});
