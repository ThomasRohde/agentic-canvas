import { describe, expect, it } from "vitest";
import { planFlowchart } from "../src/plugins/excalidraw/flowchart.js";

describe("flowchart planning", () => {
  it("offsets branch siblings on the cross axis", () => {
    const plan = planFlowchart({
      direction: "LR",
      nodes: [
        { id: "start", label: "Start" },
        { id: "decision", label: "Decision", shape: "diamond" },
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
      edges: [
        { from: "start", to: "decision" },
        { from: "decision", to: "yes" },
        { from: "decision", to: "no" },
      ],
    });

    const yes = plan.nodes.find((node) => node.key === "yes");
    const no = plan.nodes.find((node) => node.key === "no");
    expect(yes?.spec.x).toBe(440);
    expect(no?.spec.x).toBe(440);
    expect(yes?.spec.y).toBe(-70);
    expect(no?.spec.y).toBe(70);
  });
});
