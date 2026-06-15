import { describe, expect, it } from "vitest";
import { exportFlowMermaid } from "../../src/plugins/flow/mermaid.js";
import type { FlowDocument } from "../../src/plugins/flow/model.js";

describe("Flow Mermaid export", () => {
  it("exports stable flowchart text with escaped labels", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "node checkout", type: "service", label: 'Checkout "API"', x: 0, y: 0 },
        { id: "db", type: "database", label: "Ledger", x: 360, y: 0 },
      ],
      edges: [
        {
          id: "edge",
          type: "writes",
          source: "node checkout",
          target: "db",
          label: "write payment",
        },
      ],
    };

    expect(exportFlowMermaid(document, { direction: "TB" })).toContain("flowchart TB");
    expect(exportFlowMermaid(document)).toContain('node_checkout["Checkout \\"API\\""]');
    expect(exportFlowMermaid(document)).toContain("node_checkout -->|write payment| db");
  });
});
