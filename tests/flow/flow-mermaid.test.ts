import { describe, expect, it } from "vitest";
import { exportFlowMermaid } from "../../src/plugins/flow/mermaid.js";
import type { FlowDocument } from "../../src/plugins/flow/model.js";

describe("Flow Mermaid export", () => {
  it("exports stable flowchart text with escaped labels", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [
        {
          id: "node checkout",
          type: "service",
          label: 'Checkout "API" | <safe> & [x]',
          x: 0,
          y: 0,
        },
        { id: "db", type: "database", label: "Ledger", x: 360, y: 0 },
      ],
      edges: [
        {
          id: "edge",
          type: "writes",
          source: "node checkout",
          target: "db",
          label: 'write|payment "now" {ok}',
        },
      ],
    };

    const exported = exportFlowMermaid(document, { direction: "TB" });
    expect(exported).toContain("flowchart TB");
    expect(exported).toContain(
      'node_checkout["Checkout #34;API#34; #124; #60;safe#62; #38; #91;x#93;"]',
    );
    expect(exported).toContain("node_checkout -->|write#124;payment #34;now#34; #123;ok#125;| db");
    expect(exported).not.toContain('\\"');
    expect(exported).not.toContain("|write|payment");
  });

  it("exports boundaries as subgraphs and omits contains edges", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "bnd", type: "boundary", label: "Payments", x: -80, y: -80 },
        { id: "svc", type: "service", label: "Checkout", x: 0, y: 0, parentId: "bnd" },
        { id: "db", type: "database", label: "Ledger", x: 360, y: 0 },
      ],
      edges: [
        { id: "contains", type: "contains", source: "bnd", target: "svc" },
        { id: "writes", type: "writes", source: "svc", target: "db" },
      ],
    };

    const exported = exportFlowMermaid(document);
    expect(exported).toContain('subgraph bnd["Payments"]');
    expect(exported).toContain('  svc["Checkout"]');
    expect(exported).toContain("svc --> db");
    expect(exported).not.toContain("bnd --> svc");
  });
});
