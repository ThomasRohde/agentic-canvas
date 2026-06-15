import { describe, expect, it } from "vitest";
import {
  JsonCanvasValidationError,
  validateJsonCanvasDocument,
} from "../../src/plugins/jsoncanvas/validation.js";

describe("JSON Canvas validation", () => {
  it("rejects duplicate node ids and dangling edges", () => {
    expect(() =>
      validateJsonCanvasDocument({
        nodes: [
          { id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, text: "A" },
          { id: "a", type: "text", x: 0, y: 20, width: 10, height: 10, text: "B" },
        ],
        edges: [{ id: "e", fromNode: "a", toNode: "missing" }],
      }),
    ).toThrow(JsonCanvasValidationError);
  });

  it("rejects invalid sides, endpoint types, and colors", () => {
    expect(() =>
      validateJsonCanvasDocument({
        nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, text: "A" }],
        edges: [
          {
            id: "e",
            fromNode: "a",
            fromSide: "center",
            toNode: "a",
            toEnd: "circle",
            color: "banana",
          },
        ],
      }),
    ).toThrow(/Invalid fromSide/);
  });

  it("repairs floats, dimensions, invalid colors, and dangling edges", () => {
    const result = validateJsonCanvasDocument(
      {
        nodes: [
          {
            id: "a",
            type: "text",
            x: 0.4,
            y: 1.6,
            width: -1,
            height: 10,
            color: "banana",
            text: "A",
          },
        ],
        edges: [{ id: "e", fromNode: "a", toNode: "missing" }],
      },
      { repair: true },
    );

    expect(result.document.nodes?.[0]).toMatchObject({ x: 0, y: 2, width: 360 });
    expect(result.document.edges).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
