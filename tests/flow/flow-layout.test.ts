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
    const a = document.nodes.find((node) => node.id === "a");
    const b = document.nodes.find((node) => node.id === "b");
    expect(b?.y).toBeGreaterThan(a?.y ?? 0);
    expect(b?.x).toBe(a?.x);
  });

  it("keeps independent self-loop components oriented top-to-bottom", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "a1", type: "service", label: "A1", x: 0, y: 0, width: 100, height: 80 },
        { id: "a2", type: "service", label: "A2", x: 0, y: 0, width: 100, height: 80 },
        { id: "a3", type: "service", label: "A3", x: 0, y: 0, width: 100, height: 80 },
        { id: "gw", type: "service", label: "Gateway", x: 0, y: 0, width: 100, height: 80 },
        { id: "db", type: "database", label: "DB", x: 0, y: 0, width: 100, height: 80 },
      ],
      edges: [
        { id: "a1a2", type: "calls", source: "a1", target: "a2" },
        { id: "a2a3", type: "calls", source: "a2", target: "a3" },
        { id: "gwloop", type: "calls", source: "gw", target: "gw" },
        { id: "gwdb", type: "writes", source: "gw", target: "db" },
      ],
    };

    layoutFlowDocument(document, { direction: "TB", layerSpacing: 50, nodeSpacing: 25 });
    const positions = Object.fromEntries(document.nodes.map((node) => [node.id, node]));

    expect(positions.a1.y).toBe(0);
    expect(positions.a2.y).toBe(130);
    expect(positions.a3.y).toBe(260);
    expect(positions.gw.y).toBe(0);
    expect(positions.db.y).toBe(130);
    expect(positions.db.x).toBe(positions.gw.x);
    expect(positions.gw.x).toBeGreaterThan(positions.a1.x);
  });

  it("keeps independent chain roots in the first layer", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "a", type: "service", label: "A", x: 0, y: 0, width: 100, height: 80 },
        { id: "b", type: "service", label: "B", x: 0, y: 0, width: 100, height: 80 },
        { id: "c", type: "service", label: "C", x: 0, y: 0, width: 100, height: 80 },
        { id: "d", type: "service", label: "D", x: 0, y: 0, width: 100, height: 80 },
      ],
      edges: [
        { id: "ab", type: "calls", source: "a", target: "b" },
        { id: "cd", type: "calls", source: "c", target: "d" },
      ],
    };

    layoutFlowDocument(document, { direction: "LR", layerSpacing: 100, nodeSpacing: 40 });
    const positions = Object.fromEntries(document.nodes.map((node) => [node.id, node]));

    expect(positions.a.x).toBe(0);
    expect(positions.c.x).toBe(0);
    expect(positions.b.x).toBe(200);
    expect(positions.d.x).toBe(200);
    expect(positions.c.y).toBeGreaterThan(positions.a.y);
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
