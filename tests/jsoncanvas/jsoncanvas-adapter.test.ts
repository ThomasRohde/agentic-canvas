import { describe, expect, it } from "vitest";
import {
  getJsonCanvasObject,
  listJsonCanvasObjects,
} from "../../src/plugins/jsoncanvas/adapter.js";
import type { JsonCanvasDocument } from "../../src/plugins/jsoncanvas/model.js";

describe("JSON Canvas adapter", () => {
  const document: JsonCanvasDocument = {
    nodes: [
      {
        id: "group",
        type: "group",
        x: -20,
        y: -20,
        width: 500,
        height: 240,
        label: "Group",
      },
      {
        id: "text",
        type: "text",
        x: 0,
        y: 0,
        width: 360,
        height: 180,
        text: "# Heading\nBody",
      },
      {
        id: "link",
        type: "link",
        x: 420,
        y: 0,
        width: 360,
        height: 120,
        url: "https://example.test/path",
      },
    ],
    edges: [{ id: "edge", fromNode: "text", toNode: "link", label: "refers to" }],
  };

  it("maps nodes and edges to neutral summaries", () => {
    expect(listJsonCanvasObjects(document).map((object) => object.pluginType)).toEqual([
      "jsoncanvas.group",
      "jsoncanvas.text",
      "jsoncanvas.link",
      "jsoncanvas.edge",
    ]);
    expect(listJsonCanvasObjects(document, "jsoncanvas.text")).toHaveLength(1);
    expect(listJsonCanvasObjects(document, "edge")[0]?.text).toBe("refers to");
  });

  it("computes node references and group containment", () => {
    expect(getJsonCanvasObject(document, "text")?.references).toMatchObject({
      outgoingEdgeIds: ["edge"],
    });
    expect(getJsonCanvasObject(document, "group")?.references).toMatchObject({
      containedNodeIds: ["text"],
    });
    expect(getJsonCanvasObject(document, "edge")?.references).toMatchObject({
      sourceNodeId: "text",
      targetNodeId: "link",
    });
  });
});
