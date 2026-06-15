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

  it("reports duplicate edge ids even when the duplicate edge is dangling", () => {
    try {
      validateJsonCanvasDocument({
        nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 360, height: 180, text: "A" }],
        edges: [
          { id: "e", fromNode: "a", toNode: "a" },
          { id: "e", fromNode: "a", toNode: "missing" },
        ],
      });
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonCanvasValidationError);
      expect((error as JsonCanvasValidationError).issues).toEqual(
        expect.arrayContaining(["Duplicate edge id: e", "Edge e references missing node"]),
      );
    }
  });

  it("rejects ids shared between nodes and edges", () => {
    expect(() =>
      validateJsonCanvasDocument({
        nodes: [{ id: "shared", type: "text", x: 0, y: 0, width: 360, height: 180, text: "A" }],
        edges: [{ id: "shared", fromNode: "shared", toNode: "shared" }],
      }),
    ).toThrow(/Duplicate id: shared/);
  });

  it("repairs duplicate ids into a globally unique id set", () => {
    const result = validateJsonCanvasDocument(
      {
        nodes: [
          { id: "a", type: "text", x: 0, y: 0, width: 360, height: 180, text: "A" },
          { id: "a", type: "text", x: 0, y: 240, width: 360, height: 180, text: "B" },
        ],
        edges: [
          { id: "a", fromNode: "a", toNode: "a" },
          { id: "e", fromNode: "a", toNode: "a" },
          { id: "e", fromNode: "a", toNode: "a" },
        ],
      },
      { repair: true },
    );

    const ids = [
      ...(result.document.nodes ?? []).map((node) => node.id),
      ...(result.document.edges ?? []).map((edge) => edge.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.warnings.join("\n")).toMatch(/Duplicate node id: a/);
    expect(result.warnings.join("\n")).toMatch(/Duplicate id: a/);
    expect(result.warnings.join("\n")).toMatch(/Duplicate edge id: e/);
  });
});
