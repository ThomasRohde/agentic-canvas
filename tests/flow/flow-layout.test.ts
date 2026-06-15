import { describe, expect, it } from "vitest";
import { layoutFlowDocument } from "../../src/plugins/flow/layout.js";
import type { FlowDocument } from "../../src/plugins/flow/model.js";

describe("Flow layout", () => {
  it("places roots in the first layer and lays out deterministically", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "a", type: "service", label: "A", x: 50, y: 50, width: 100, height: 80 },
        { id: "b", type: "service", label: "B", x: 0, y: 0, width: 100, height: 80 },
        { id: "c", type: "database", label: "C", x: 0, y: 0, width: 100, height: 80 },
      ],
      edges: [
        { id: "ab", type: "calls", source: "a", target: "b" },
        { id: "bc", type: "writes", source: "b", target: "c" },
      ],
    };

    const result = layoutFlowDocument(document, {
      direction: "LR",
      layerSpacing: 100,
      nodeSpacing: 40,
    });

    expect(result.movedIds).toEqual(["a", "b", "c"]);
    expect(document.nodes.map((node) => [node.id, node.x, node.y])).toEqual([
      ["a", 0, 0],
      ["b", 200, 0],
      ["c", 400, 0],
    ]);
  });

  it("handles cycles without infinite recursion", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "a", type: "service", label: "A", x: 0, y: 0, width: 100, height: 80 },
        { id: "b", type: "service", label: "B", x: 0, y: 0, width: 100, height: 80 },
      ],
      edges: [
        { id: "ab", type: "calls", source: "a", target: "b" },
        { id: "ba", type: "calls", source: "b", target: "a" },
      ],
    };

    layoutFlowDocument(document, { direction: "TB", layerSpacing: 50, nodeSpacing: 25 });
    expect(
      document.nodes.every((node) => Number.isInteger(node.x) && Number.isInteger(node.y)),
    ).toBe(true);
  });

  it("expands boundary nodes around children", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "boundary", type: "boundary", label: "Boundary", x: 0, y: 0 },
        { id: "a", type: "service", label: "A", x: 200, y: 200, parentId: "boundary" },
      ],
      edges: [],
    };

    layoutFlowDocument(document);
    const boundary = document.nodes.find((node) => node.id === "boundary");
    expect(boundary).toMatchObject({ x: -80, y: -80 });
    expect(boundary?.width).toBeGreaterThan(220);
    expect(boundary?.height).toBeGreaterThan(90);
  });
});
