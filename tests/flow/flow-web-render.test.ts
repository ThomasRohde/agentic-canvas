// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  type FlowGraphNode,
  resolveSelectionChange,
  shouldSyncEdgeChanges,
  shouldSyncNodeChanges,
  toFlowDocument,
  toReactFlowEdge,
} from "../../src/web/canvases/flow/FlowCanvasApp.js";

describe("Flow browser renderer helpers", () => {
  it("keeps programmatic selection authoritative during immediate callbacks", () => {
    expect(resolveSelectionChange([], ["node_a"])).toEqual({
      selectedIds: ["node_a"],
      keepProgrammaticSelection: true,
    });
    expect(resolveSelectionChange(["node_a"], ["node_a"])).toEqual({
      selectedIds: ["node_a"],
      keepProgrammaticSelection: false,
    });
  });

  it("does not sync selection or measurement-only changes", () => {
    expect(shouldSyncNodeChanges([{ type: "select", id: "node_a", selected: true }])).toBe(false);
    expect(
      shouldSyncNodeChanges([
        { type: "dimensions", id: "node_a", dimensions: { width: 220, height: 90 } },
      ]),
    ).toBe(false);
    expect(
      shouldSyncNodeChanges([{ type: "position", id: "node_a", position: { x: 20, y: 30 } }]),
    ).toBe(true);
    expect(shouldSyncEdgeChanges([{ type: "select", id: "edge_a", selected: true }])).toBe(false);
    expect(shouldSyncEdgeChanges([{ type: "remove", id: "edge_a" }])).toBe(true);
  });

  it("serializes a semantic Flow document from React Flow state", () => {
    const edge = toReactFlowEdge({
      id: "edge_a",
      type: "calls",
      source: "node_a",
      target: "node_b",
      sourcePort: "out",
      targetPort: "in",
    });
    const document = toFlowDocument(
      [
        {
          id: "node_a",
          type: "flowNode",
          position: { x: 10.4, y: 20.6 },
          width: 221,
          height: 91,
          data: {
            label: "A",
            nodeType: "service",
            raw: {
              id: "node_a",
              type: "service",
              label: "A",
              x: 10,
              y: 20,
              width: 220,
              height: 90,
            },
          },
        } satisfies FlowGraphNode,
      ],
      [
        {
          ...edge,
          source: "node_a",
          target: "node_a",
        },
      ],
    );

    expect(edge.sourceHandle).toBe("source:out");
    expect(edge.targetHandle).toBe("target:in");
    expect(document).toMatchObject({
      type: "agentic-flow",
      version: 1,
      nodes: [{ id: "node_a", x: 10, y: 21, width: 221, height: 91 }],
      edges: [
        { id: "edge_a", source: "node_a", target: "node_a", sourcePort: "out", targetPort: "in" },
      ],
    });
  });
});
