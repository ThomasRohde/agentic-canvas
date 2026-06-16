import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Workspace } from "../../src/server/workspace.js";
import { jsonContent, textContent } from "../helpers.js";
import { connectFlow } from "./flowTestUtils.js";

describe("Flow MCP tools", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-flow-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("creates nodes, ports, edges, searches, validates, and traverses", async () => {
    const { client, close } = await connectFlow(workspace);

    try {
      const checkout = jsonContent<{ id: string; label: string }>(
        await client.callTool({
          name: "add_flow_node",
          arguments: { type: "service", label: "Checkout", owner: "payments" },
        }),
      );
      const auth = jsonContent<{ id: string }>(
        await client.callTool({
          name: "add_flow_node",
          arguments: { type: "service", label: "Authorization" },
        }),
      );
      const checkoutPort = jsonContent<{ object: { id: string; kind: string } }>(
        await client.callTool({
          name: "add_port",
          arguments: { nodeId: checkout.id, id: "out", direction: "out", side: "right" },
        }),
      );
      expect(checkoutPort.object).toMatchObject({ id: `${checkout.id}#out`, kind: "port" });
      await client.callTool({
        name: "add_port",
        arguments: { nodeId: auth.id, id: "in", direction: "in", side: "left" },
      });
      const edge = jsonContent<{ id: string; label: string }>(
        await client.callTool({
          name: "connect_flow_nodes",
          arguments: {
            source: checkout.id,
            sourcePort: "out",
            target: auth.id,
            targetPort: "in",
            type: "calls",
            label: "authorize",
          },
        }),
      );

      expect(edge.label).toBe("authorize");
      expect(
        jsonContent<{ ids: string[] }>(
          await client.callTool({ name: "find_flow_nodes", arguments: { query: "payments" } }),
        ).ids,
      ).toEqual([checkout.id]);
      expect(
        jsonContent<{ ids: string[] }>(
          await client.callTool({
            name: "find_flow_edges",
            arguments: { touchingNode: auth.id, type: "calls" },
          }),
        ).ids,
      ).toEqual([edge.id]);
      expect(
        jsonContent<{ nodeIds: string[]; edgeIds: string[] }>(
          await client.callTool({
            name: "find_downstream",
            arguments: { nodeId: checkout.id, includeEdges: true },
          }),
        ),
      ).toMatchObject({ nodeIds: [auth.id], edgeIds: [edge.id] });
      expect(
        jsonContent<{ paths: Array<{ nodeIds: string[] }> }>(
          await client.callTool({
            name: "find_paths",
            arguments: { from: checkout.id, to: auth.id },
          }),
        ).paths[0].nodeIds,
      ).toEqual([checkout.id, auth.id]);
      expect(
        jsonContent<{
          valid: boolean;
          stats: { nodeCount: number; edgeCount: number; cycleCount: number };
        }>(await client.callTool({ name: "validate_flow", arguments: {} })),
      ).toMatchObject({ valid: true, stats: { nodeCount: 2, edgeCount: 1, cycleCount: 0 } });
    } finally {
      await close();
    }
  });

  it("rejects port direction changes that invalidate existing edges", async () => {
    const { client, close } = await connectFlow(workspace);

    try {
      const source = jsonContent<{ id: string }>(
        await client.callTool({
          name: "add_flow_node",
          arguments: { type: "service", label: "Source" },
        }),
      );
      const target = jsonContent<{ id: string }>(
        await client.callTool({
          name: "add_flow_node",
          arguments: { type: "service", label: "Target" },
        }),
      );
      await client.callTool({
        name: "add_port",
        arguments: { nodeId: source.id, id: "out", direction: "out", side: "right" },
      });
      await client.callTool({
        name: "add_port",
        arguments: { nodeId: target.id, id: "in", direction: "in", side: "left" },
      });
      await client.callTool({
        name: "connect_flow_nodes",
        arguments: { source: source.id, sourcePort: "out", target: target.id, targetPort: "in" },
      });

      const invalid = await client.callTool({
        name: "update_port",
        arguments: { nodeId: source.id, portId: "out", direction: "in" },
      });
      expect((invalid as { isError?: boolean }).isError).toBe(true);
      expect(textContent(invalid)).toMatch(/source port cannot be in-only/);
    } finally {
      await close();
    }
  });

  it("returns missing port errors without leaking generated edge ids", async () => {
    const { client, close } = await connectFlow(workspace);

    try {
      const source = jsonContent<{ id: string }>(
        await client.callTool({
          name: "add_flow_node",
          arguments: { type: "service", label: "Source" },
        }),
      );
      const target = jsonContent<{ id: string }>(
        await client.callTool({
          name: "add_flow_node",
          arguments: { type: "service", label: "Target" },
        }),
      );

      const invalid = await client.callTool({
        name: "connect_flow_nodes",
        arguments: { source: source.id, target: target.id, targetPort: "missing" },
      });

      expect((invalid as { isError?: boolean }).isError).toBe(true);
      expect(textContent(invalid)).toBe(`Target port ${target.id}#missing does not exist`);
      expect(textContent(invalid)).not.toMatch(/edge_[0-9a-f]/);
    } finally {
      await close();
    }
  });

  it("surfaces self-loops through graph tools and strict domain validation", async () => {
    const { client, close } = await connectFlow(workspace);

    try {
      await client.callTool({
        name: "apply_flow_patch",
        arguments: {
          createNodes: [{ id: "svc", type: "service", label: "Service", x: 0, y: 0 }],
          createEdges: [{ id: "loop", type: "calls", source: "svc", target: "svc" }],
        },
      });

      expect(
        jsonContent<{ cycles: string[][] }>(
          await client.callTool({ name: "find_cycles", arguments: {} }),
        ).cycles,
      ).toEqual([["svc", "svc"]]);
      expect(
        jsonContent<{ paths: Array<{ nodeIds: string[]; edgeIds: string[] }> }>(
          await client.callTool({ name: "find_paths", arguments: { from: "svc", to: "svc" } }),
        ).paths,
      ).toEqual([
        { nodeIds: ["svc"], edgeIds: [] },
        { nodeIds: ["svc", "svc"], edgeIds: ["loop"] },
      ]);

      const validation = jsonContent<{
        valid: boolean;
        errors: Array<{ code: string }>;
        stats: { cycleCount: number };
      }>(
        await client.callTool({
          name: "validate_flow",
          arguments: { mode: "strict", domainRules: true },
        }),
      );
      expect(validation.valid).toBe(false);
      expect(validation.errors.map((error) => error.code)).toContain("edge.selfLoop");
      expect(validation.stats.cycleCount).toBe(1);
    } finally {
      await close();
    }
  });

  it("reconciles contains edges with structural parent ids", async () => {
    const { client, close, controller } = await connectFlow(workspace);

    try {
      await client.callTool({
        name: "apply_flow_patch",
        arguments: {
          createNodes: [
            { id: "boundary", type: "boundary", label: "Boundary", x: 0, y: 0 },
            { id: "child", type: "service", label: "Child", x: 80, y: 80 },
          ],
        },
      });
      await client.callTool({
        name: "connect_flow_nodes",
        arguments: { source: "boundary", target: "child", type: "contains" },
      });

      expect(controller.getObject("child")?.references).toMatchObject({ parentId: "boundary" });

      await client.callTool({
        name: "update_flow_node",
        arguments: { id: "child", parentId: null },
      });

      expect(controller.getObject("child")?.references).toMatchObject({ parentId: undefined });
      expect(
        jsonContent<{ ids: string[] }>(
          await client.callTool({ name: "find_flow_edges", arguments: { type: "contains" } }),
        ).ids,
      ).toEqual([]);
    } finally {
      await close();
    }
  });

  it("does not report populated boundaries as validate_flow orphans", async () => {
    const { client, close } = await connectFlow(workspace);

    try {
      await client.callTool({
        name: "apply_flow_patch",
        arguments: {
          createNodes: [
            { id: "boundary", type: "boundary", label: "Boundary", x: 0, y: 0 },
            {
              id: "child",
              type: "service",
              label: "Child",
              x: 80,
              y: 80,
              parentId: "boundary",
            },
            { id: "target", type: "service", label: "Target", x: 360, y: 80 },
          ],
          createEdges: [{ id: "child_target", type: "calls", source: "child", target: "target" }],
        },
      });

      const validation = jsonContent<{
        warnings: Array<{ code: string; objectId?: string }>;
        stats: { orphanNodeCount: number };
      }>(await client.callTool({ name: "validate_flow", arguments: {} }));

      expect(validation.stats.orphanNodeCount).toBe(0);
      expect(validation.warnings).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ code: "node.orphan", objectId: "boundary" }),
        ]),
      );
    } finally {
      await close();
    }
  });

  it("applies patches atomically and returns optional objects", async () => {
    const { client, close, controller } = await connectFlow(workspace);

    try {
      const result = jsonContent<{ created: string[]; objects: Array<{ id: string }> }>(
        await client.callTool({
          name: "apply_flow_patch",
          arguments: {
            createNodes: [
              { id: "a", type: "service", label: "A", x: 0, y: 0 },
              { id: "b", type: "database", label: "B", x: 300, y: 0 },
            ],
            createEdges: [{ id: "ab", type: "writes", source: "a", target: "b" }],
            returnObjects: true,
          },
        }),
      );
      expect(result.created).toEqual(["a", "b", "ab"]);
      expect(result.objects.map((object) => object.id)).toEqual(["a", "b", "ab"]);

      const invalid = await client.callTool({
        name: "apply_flow_patch",
        arguments: {
          updateNodes: [{ id: "a", patch: { label: "Changed" } }],
          createEdges: [{ id: "bad", type: "calls", source: "a", target: "missing" }],
        },
      });
      expect((invalid as { isError?: boolean }).isError).toBe(true);
      expect(controller.getObject("a")?.label).toBe("A");
      expect(controller.getObject("bad")).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("advertises Flow tools and hides generic shape tools", async () => {
    const { client, close } = await connectFlow(workspace);

    try {
      const capabilities = jsonContent<{
        canvas: string;
        fileExtension: string;
        pluginTools: string[];
        genericObjectTools: string[];
      }>(await client.callTool({ name: "get_canvas_capabilities", arguments: {} }));
      expect(capabilities).toMatchObject({ canvas: "flow", fileExtension: ".flow" });
      expect(capabilities.pluginTools).toContain("apply_flow_patch");
      expect(capabilities.genericObjectTools).toEqual([]);

      const listed = (await client.listTools()) as { tools: Array<{ name: string }> };
      const toolNames = listed.tools.map((tool) => tool.name);
      expect(toolNames).toContain("add_flow_node");
      expect(toolNames).not.toContain("create_object");
      expect(toolNames).not.toContain("find_objects");
      expect(toolNames).not.toContain("apply_canvas_patch");
    } finally {
      await close();
    }
  });
});
