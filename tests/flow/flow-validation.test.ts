import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateFlowDocument } from "../../src/plugins/flow/validation.js";

describe("Flow validation", () => {
  it("rejects duplicate node and edge ids", () => {
    const result = validateFlowDocument({
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "a", type: "service", label: "A", x: 0, y: 0 },
        { id: "a", type: "service", label: "A2", x: 0, y: 120 },
      ],
      edges: [
        { id: "e", type: "calls", source: "a", target: "a" },
        { id: "e", type: "calls", source: "a", target: "a" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("node.duplicateId");
    expect(result.errors.map((error) => error.code)).toContain("edge.duplicateId");
  });

  it("rejects dangling edges and missing ports", () => {
    const result = validateFlowDocument({
      type: "agentic-flow",
      version: 1,
      nodes: [{ id: "a", type: "service", label: "A", x: 0, y: 0 }],
      edges: [
        {
          id: "e",
          type: "calls",
          source: "a",
          sourcePort: "missing",
          target: "missing",
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["edge.target.missing", "edge.sourcePort.missing"]),
    );
  });

  it("rejects incompatible port directions", () => {
    const result = validateFlowDocument({
      type: "agentic-flow",
      version: 1,
      nodes: [
        {
          id: "a",
          type: "service",
          label: "A",
          x: 0,
          y: 0,
          ports: [{ id: "in", direction: "in", side: "right" }],
        },
        {
          id: "b",
          type: "service",
          label: "B",
          x: 200,
          y: 0,
          ports: [{ id: "out", direction: "out", side: "left" }],
        },
      ],
      edges: [
        { id: "e", type: "calls", source: "a", sourcePort: "in", target: "b", targetPort: "out" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["edge.sourcePort.direction", "edge.targetPort.direction"]),
    );
  });

  it("rejects parent cycles and non-boundary parents", () => {
    const result = validateFlowDocument({
      type: "agentic-flow",
      version: 1,
      nodes: [
        { id: "a", type: "service", label: "A", x: 0, y: 0, parentId: "b" },
        { id: "b", type: "service", label: "B", x: 0, y: 100, parentId: "a" },
      ],
      edges: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["node.parent.notBoundary", "node.parent.cycle"]),
    );
  });

  it("reports strict acyclic and domain validation findings", async () => {
    const raw = await readFile(path.join("tests", "fixtures", "flow", "cyclic.flow"), "utf8");
    const result = validateFlowDocument(JSON.parse(raw), { mode: "strict" });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("graph.cyclic");

    const risk = validateFlowDocument(
      {
        type: "agentic-flow",
        version: 1,
        nodes: [{ id: "risk", type: "risk", label: "Risk", x: 0, y: 0 }],
        edges: [],
        settings: { strictValidation: true },
      },
      { mode: "strict" },
    );
    expect(risk.warnings.map((warning) => warning.code)).toContain("risk.unlinked");
  });
});
