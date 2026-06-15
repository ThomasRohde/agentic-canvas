import { describe, expect, it } from "vitest";
import { getFlowObject, listFlowObjects } from "../../src/plugins/flow/adapter.js";
import type { FlowDocument } from "../../src/plugins/flow/model.js";

describe("Flow adapter", () => {
  const document: FlowDocument = {
    type: "agentic-flow",
    version: 1,
    nodes: [
      {
        id: "boundary",
        type: "boundary",
        label: "Payments",
        x: -80,
        y: -80,
        width: 600,
        height: 300,
      },
      {
        id: "service",
        type: "service",
        label: "Checkout",
        x: 0,
        y: 0,
        parentId: "boundary",
        ports: [{ id: "out", label: "authorize", direction: "out", side: "right" }],
      },
      { id: "database", type: "database", label: "Ledger", x: 360, y: 0 },
    ],
    edges: [
      {
        id: "edge",
        type: "writes",
        source: "service",
        sourcePort: "out",
        target: "database",
        label: "writes",
      },
      { id: "unlabeled", type: "calls", source: "service", target: "database" },
    ],
  };

  it("maps nodes, boundaries, edges, and ports to normalized objects", () => {
    const objects = listFlowObjects(document);

    expect(objects.map((object) => [object.id, object.kind, object.pluginType])).toEqual([
      ["boundary", "group", "flow.node.boundary"],
      ["service", "node", "flow.node.service"],
      ["database", "node", "flow.node.database"],
      ["edge", "edge", "flow.edge.writes"],
      ["unlabeled", "edge", "flow.edge.calls"],
      ["service#out", "port", "flow.port"],
    ]);
    expect(listFlowObjects(document, "service").map((object) => object.id)).toEqual(["service"]);
    expect(listFlowObjects(document, "flow.edge.writes").map((object) => object.id)).toEqual([
      "edge",
    ]);
    expect(listFlowObjects(document, "port").map((object) => object.id)).toEqual(["service#out"]);
  });

  it("returns references for nodes, edges, and ports", () => {
    expect(getFlowObject(document, "service")?.references).toMatchObject({
      outgoingEdgeIds: ["edge", "unlabeled"],
      portIds: ["service#out"],
      parentId: "boundary",
    });
    expect(getFlowObject(document, "edge")?.references).toMatchObject({
      sourceNodeId: "service",
      targetNodeId: "database",
      sourcePortId: "out",
    });
    expect(getFlowObject(document, "service#out")?.references).toMatchObject({
      nodeId: "service",
      outgoingEdgeIds: ["edge"],
    });
  });

  it("separates authored edge labels from display labels", () => {
    expect(getFlowObject(document, "unlabeled")).toMatchObject({
      id: "unlabeled",
      label: undefined,
      text: undefined,
      displayLabel: "calls",
    });
  });
});
