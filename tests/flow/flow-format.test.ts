import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deserializeFlowDocument, serializeFlowDocument } from "../../src/plugins/flow/format.js";
import type { FlowDocument } from "../../src/plugins/flow/model.js";
import { Workspace } from "../../src/server/workspace.js";
import { jsonContent, textContent } from "../helpers.js";
import { connectFlow } from "./flowTestUtils.js";

describe("Flow format", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-flow-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("serializes stable pretty JSON", () => {
    const document: FlowDocument = {
      type: "agentic-flow",
      version: 1,
      nodes: [{ id: "a", type: "service", label: "A", x: 0, y: 0 }],
      edges: [],
    };

    expect(serializeFlowDocument(document)).toBe(`{
  "type": "agentic-flow",
  "version": 1,
  "nodes": [
    {
      "id": "a",
      "type": "service",
      "label": "A",
      "x": 0,
      "y": 0
    }
  ],
  "edges": []
}
`);
  });

  it("opens valid fixtures and rejects invalid top-level data", async () => {
    const raw = await readFile(
      path.join("tests", "fixtures", "flow", "architecture-basic.flow"),
      "utf8",
    );
    const result = deserializeFlowDocument(raw);
    expect(result.document.nodes.map((node) => node.id)).toEqual([
      "node_checkout",
      "node_auth",
      "node_ledger",
    ]);

    expect(() => deserializeFlowDocument(JSON.stringify({ type: "wrong", version: 1 }))).toThrow(
      /Flow document type/,
    );
  });

  it("repairs safe invalid edges in repair mode", () => {
    const result = deserializeFlowDocument(
      JSON.stringify({
        type: "agentic-flow",
        version: 1,
        nodes: [{ id: "a", type: "service", label: "A", x: 0, y: 0 }],
        edges: [{ id: "dangling", type: "calls", source: "a", target: "missing" }],
      }),
      { repair: true },
    );

    expect(result.document.edges).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toContain("edge.dangling.repaired");
  });

  it("uses .flow through baseline save/open and rejects wrong extensions", async () => {
    const { client, close } = await connectFlow(workspace);

    try {
      await client.callTool({
        name: "add_flow_node",
        arguments: { type: "service", label: "Checkout" },
      });

      const saved = jsonContent<{ path: string }>(
        await client.callTool({ name: "save_canvas", arguments: { path: "demo" } }),
      );
      expect(saved.path).toBe(path.join(root, "demo.flow"));
      expect(JSON.parse(await readFile(saved.path, "utf8"))).toMatchObject({
        type: "agentic-flow",
        version: 1,
        nodes: [{ label: "Checkout" }],
      });

      await client.callTool({ name: "clear_canvas", arguments: {} });
      const opened = jsonContent<{ objectCount: number }>(
        await client.callTool({ name: "open_canvas", arguments: { path: "demo" } }),
      );
      expect(opened.objectCount).toBe(1);

      await writeFile(path.join(root, "bad.txt"), "{}");
      const bad = await client.callTool({ name: "open_canvas", arguments: { path: "bad.txt" } });
      expect((bad as { isError?: boolean }).isError).toBe(true);
      expect(textContent(bad)).toMatch(/Expected \.flow file path/);
    } finally {
      await close();
    }
  });
});
