import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deserializeJsonCanvasDocument,
  normalizeJsonCanvasPath,
  serializeJsonCanvasDocument,
} from "../../src/plugins/jsoncanvas/format.js";

describe("JSON Canvas format", () => {
  it("serializes stable pretty JSON with a trailing newline", () => {
    const serialized = serializeJsonCanvasDocument({
      nodes: [
        {
          id: "card_a",
          type: "text",
          x: 0,
          y: 0,
          width: 360,
          height: 180,
          text: "A",
        },
      ],
      edges: [],
    });

    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual({
      nodes: [
        {
          id: "card_a",
          type: "text",
          x: 0,
          y: 0,
          width: 360,
          height: 180,
          text: "A",
        },
      ],
      edges: [],
    });
  });

  it("deserializes fixtures and preserves node order", async () => {
    const fixture = await readFile(
      path.join("tests", "fixtures", "jsoncanvas", "text-file-link-group.canvas"),
      "utf8",
    );

    const { document } = deserializeJsonCanvasDocument(fixture);

    expect(document.nodes?.map((node) => node.id)).toEqual([
      "card_context",
      "file_plan",
      "link_spec",
      "group_sources",
    ]);
  });

  it("defaults missing arrays to empty arrays", () => {
    const { document } = deserializeJsonCanvasDocument("{}");

    expect(document).toEqual({ nodes: [], edges: [] });
  });

  it("normalizes .canvas paths", () => {
    expect(normalizeJsonCanvasPath("demo")).toBe("demo.canvas");
    expect(normalizeJsonCanvasPath("demo.canvas")).toBe("demo.canvas");
    expect(() => normalizeJsonCanvasPath("demo.txt")).toThrow(/Expected \.canvas/);
  });
});
