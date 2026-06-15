import { describe, expect, it } from "vitest";
import {
  buildFlowGraphIndex,
  findCycles,
  findDownstream,
  findPaths,
  findUpstream,
} from "../../src/plugins/flow/graph.js";
import type { FlowDocument } from "../../src/plugins/flow/model.js";

describe("Flow graph algorithms", () => {
  const document: FlowDocument = {
    type: "agentic-flow",
    version: 1,
    nodes: [
      { id: "a", type: "service", label: "A", x: 0, y: 0 },
      { id: "b", type: "service", label: "B", x: 0, y: 0 },
      { id: "c", type: "database", label: "C", x: 0, y: 0 },
      { id: "d", type: "external", label: "D", x: 0, y: 0 },
    ],
    edges: [
      { id: "ab", type: "calls", source: "a", target: "b" },
      { id: "bc", type: "writes", source: "b", target: "c" },
      { id: "bd", type: "calls", source: "b", target: "d", direction: "bidirectional" },
      { id: "ca", type: "reads", source: "c", target: "a" },
    ],
  };

  it("builds incoming and outgoing adjacency with bidirectional edges", () => {
    const index = buildFlowGraphIndex(document);

    expect(index.outgoing.get("d")?.map((edge) => edge.id)).toEqual(["bd"]);
    expect(index.incoming.get("b")?.map((edge) => edge.id)).toEqual(["ab", "bd"]);
  });

  it("finds upstream and downstream nodes with edge filters", () => {
    expect(findDownstream(document, "a", { depth: 2, includeEdges: true })).toEqual({
      nodeIds: ["b", "c", "d"],
      edgeIds: ["ab", "bc", "bd"],
    });
    expect(findUpstream(document, "c", { edgeTypes: ["writes"], includeEdges: true })).toEqual({
      nodeIds: ["b"],
      edgeIds: ["bc"],
    });
  });

  it("finds bounded simple paths", () => {
    expect(findPaths(document, "a", "c", { maxDepth: 3 })).toEqual([
      { nodeIds: ["a", "b", "c"], edgeIds: ["ab", "bc"] },
    ]);
  });

  it("finds representative cycles", () => {
    expect(findCycles(document).some((cycle) => cycle.join(">") === "a>b>c>a")).toBe(true);
  });
});
