import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PluginToolContext } from "../../core/plugin.js";
import type { Scene } from "../../core/scene.js";
import { getFlowObject } from "./adapter.js";
import { deserializeFlowDocument } from "./format.js";
import { findCycles, findDownstream, findPaths, findUpstream } from "./graph.js";
import { layoutFlowDocument } from "./layout.js";
import { exportFlowMermaid } from "./mermaid.js";
import {
  FLOW_DOCUMENT_TYPE,
  FLOW_DOCUMENT_VERSION,
  FLOW_NODE_DEFAULTS,
  type FlowDocument,
  type FlowEdge,
  type FlowEdgeType,
  type FlowNode,
  type FlowPort,
} from "./model.js";
import {
  flowEdgeDirectionSchema,
  flowEdgeInputShape,
  flowEdgeSchema,
  flowEdgeStatusSchema,
  flowEdgeTypeSchema,
  flowMetadataSchema,
  flowNodeInputShape,
  flowNodeSchema,
  flowNodeStatusSchema,
  flowNodeTypeSchema,
  flowPortDirectionSchema,
  flowPortInputShape,
  flowPortSchema,
  flowPortSideSchema,
} from "./schemas.js";
import { assertValidFlowDocument, createFlowId, validateFlowDocument } from "./validation.js";

const updateFlowNodeShape = {
  id: z.string(),
  type: flowNodeTypeSchema.optional(),
  label: z.string().optional(),
  description: z.string().nullable().optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  status: flowNodeStatusSchema.optional(),
  owner: z.string().nullable().optional(),
  system: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  parentId: z.string().nullable().optional(),
  metadata: flowMetadataSchema.nullable().optional(),
};

const updateFlowEdgeShape = {
  id: z.string(),
  type: flowEdgeTypeSchema.optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  sourcePort: z.string().nullable().optional(),
  targetPort: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: flowEdgeStatusSchema.optional(),
  direction: flowEdgeDirectionSchema.optional(),
  tags: z.array(z.string()).optional(),
  metadata: flowMetadataSchema.nullable().optional(),
};

const updatePortShape = {
  nodeId: z.string(),
  portId: z.string(),
  label: z.string().nullable().optional(),
  direction: flowPortDirectionSchema.optional(),
  side: flowPortSideSchema.optional(),
  protocol: z.string().nullable().optional(),
  dataType: z.string().nullable().optional(),
  required: z.boolean().nullable().optional(),
  metadata: flowMetadataSchema.nullable().optional(),
};

const deletePortShape = {
  nodeId: z.string(),
  portId: z.string(),
  repairEdges: z.boolean().optional(),
};

const findNodesShape = {
  query: z.string().optional(),
  type: flowNodeTypeSchema.optional(),
  status: flowNodeStatusSchema.optional(),
  owner: z.string().optional(),
  system: z.string().optional(),
  tag: z.string().optional(),
  parentId: z.string().optional(),
  limit: z.number().int().positive().optional(),
};

const findEdgesShape = {
  query: z.string().optional(),
  type: flowEdgeTypeSchema.optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  touchingNode: z.string().optional(),
  tag: z.string().optional(),
  limit: z.number().int().positive().optional(),
};

const traversalShape = {
  nodeId: z.string(),
  depth: z.number().int().positive().optional(),
  edgeTypes: z.array(flowEdgeTypeSchema).optional(),
  includeEdges: z.boolean().optional(),
};

const pathsShape = {
  from: z.string(),
  to: z.string(),
  maxDepth: z.number().int().positive().optional(),
  edgeTypes: z.array(flowEdgeTypeSchema).optional(),
  limit: z.number().int().positive().optional(),
};

const cyclesShape = {
  edgeTypes: z.array(flowEdgeTypeSchema).optional(),
  limit: z.number().int().positive().optional(),
};

const validateShape = {
  mode: z.enum(["basic", "strict"]).optional(),
  domainRules: z.boolean().optional(),
};

const autoLayoutShape = {
  direction: z.enum(["LR", "TB"]).optional(),
  layerSpacing: z.number().int().positive().optional(),
  nodeSpacing: z.number().int().positive().optional(),
  preserveManualGroups: z.boolean().optional(),
  includeOrphans: z.boolean().optional(),
};

const mermaidShape = {
  direction: z.enum(["LR", "TB"]).optional(),
  includeDescriptions: z.boolean().optional(),
};

const flowNodePatchSchema = z.object(updateFlowNodeShape).omit({ id: true });
const flowEdgePatchSchema = z.object(updateFlowEdgeShape).omit({ id: true });
const flowPortPatchSchema = z.object(updatePortShape).omit({ nodeId: true, portId: true });

const applyPatchShape = {
  createNodes: z.array(flowNodeSchema).optional(),
  updateNodes: z.array(z.object({ id: z.string(), patch: flowNodePatchSchema })).optional(),
  deleteNodeIds: z.array(z.string()).optional(),
  createEdges: z.array(flowEdgeSchema).optional(),
  updateEdges: z.array(z.object({ id: z.string(), patch: flowEdgePatchSchema })).optional(),
  deleteEdgeIds: z.array(z.string()).optional(),
  addPorts: z.array(z.object({ nodeId: z.string(), port: flowPortSchema })).optional(),
  updatePorts: z
    .array(z.object({ nodeId: z.string(), portId: z.string(), patch: flowPortPatchSchema }))
    .optional(),
  deletePorts: z
    .array(
      z.object({ nodeId: z.string(), portId: z.string(), repairEdges: z.boolean().optional() }),
    )
    .optional(),
  repair: z.boolean().optional(),
  returnObjects: z.boolean().optional(),
};

export function registerFlowTools(server: McpServer, context: PluginToolContext): void {
  server.registerTool(
    "add_flow_node",
    { description: "Create a typed Flow node.", inputSchema: flowNodeInputShape },
    async (input) => addFlowNode(context, input),
  );
  server.registerTool(
    "add_port",
    {
      description: "Add a port to a Flow node.",
      inputSchema: { nodeId: z.string(), ...flowPortInputShape },
    },
    async (input) => addPort(context, input),
  );
  server.registerTool(
    "update_port",
    { description: "Update a Flow node port.", inputSchema: updatePortShape },
    async (input) => updatePort(context, input),
  );
  server.registerTool(
    "delete_port",
    { description: "Delete a Flow node port.", inputSchema: deletePortShape },
    async (input) => deletePortTool(context, input),
  );
  server.registerTool(
    "connect_flow_nodes",
    { description: "Connect two Flow nodes with a typed edge.", inputSchema: flowEdgeInputShape },
    async (input) => connectFlowNodes(context, input),
  );
  server.registerTool(
    "update_flow_node",
    { description: "Update a Flow node.", inputSchema: updateFlowNodeShape },
    async (input) => updateFlowNode(context, input),
  );
  server.registerTool(
    "update_flow_edge",
    { description: "Update a Flow edge.", inputSchema: updateFlowEdgeShape },
    async (input) => updateFlowEdge(context, input),
  );
  server.registerTool(
    "find_flow_nodes",
    { description: "Search Flow nodes.", inputSchema: findNodesShape },
    async (input) => findFlowNodes(context, input),
  );
  server.registerTool(
    "find_flow_edges",
    { description: "Search Flow edges.", inputSchema: findEdgesShape },
    async (input) => findFlowEdges(context, input),
  );
  server.registerTool(
    "find_upstream",
    { description: "Find nodes upstream of a Flow node.", inputSchema: traversalShape },
    async (input) => traversalResult(context, input, "upstream"),
  );
  server.registerTool(
    "find_downstream",
    { description: "Find nodes downstream of a Flow node.", inputSchema: traversalShape },
    async (input) => traversalResult(context, input, "downstream"),
  );
  server.registerTool(
    "find_paths",
    { description: "Find simple paths between two Flow nodes.", inputSchema: pathsShape },
    async (input) => findPathTool(context, input),
  );
  server.registerTool(
    "find_cycles",
    { description: "Find representative cycles in the Flow graph.", inputSchema: cyclesShape },
    async (input) => findCyclesTool(context, input),
  );
  server.registerTool(
    "validate_flow",
    { description: "Validate the current Flow graph.", inputSchema: validateShape },
    async (input) => validateFlowTool(context, input),
  );
  server.registerTool(
    "auto_layout_flow",
    { description: "Deterministically lay out the Flow graph.", inputSchema: autoLayoutShape },
    async (input) => autoLayoutFlow(context, input),
  );
  server.registerTool(
    "export_mermaid",
    { description: "Export the Flow graph as Mermaid flowchart text.", inputSchema: mermaidShape },
    async (input) => exportMermaidTool(context, input),
  );
  server.registerTool(
    "apply_flow_patch",
    {
      description: "Atomically apply Flow node, edge, and port changes.",
      inputSchema: applyPatchShape,
    },
    async (input) => applyFlowPatch(context, input),
  );
}

function addFlowNode(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const object = mutateFlow(context, (document) => {
      const node = buildNode(document, input);
      assertUniqueId(document, node.id);
      document.nodes.push(node);
      return node.id;
    });
    return textResult(object);
  } catch (error) {
    return errorResult(error);
  }
}

function addPort(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = mutateFlow(context, (document) => {
      const node = requireNode(document, String(input.nodeId));
      const port = buildPort(node, input);
      node.ports = [...(node.ports ?? []), port];
      return { nodeId: node.id, port, object: getFlowObject(document, `${node.id}#${port.id}`) };
    });
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function updatePort(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = mutateFlow(context, (document) => {
      const node = requireNode(document, String(input.nodeId));
      const port = requirePort(node, String(input.portId));
      applyPortPatch(port, input);
      return { nodeId: node.id, port, object: getFlowObject(document, `${node.id}#${port.id}`) };
    });
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function deletePortTool(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = mutateFlow(context, (document) =>
      deletePort(document, String(input.nodeId), String(input.portId), Boolean(input.repairEdges)),
    );
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function connectFlowNodes(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const object = mutateFlow(context, (document) => {
      const edge = buildEdge(document, input);
      assertUniqueId(document, edge.id);
      reconcileContainmentForEdge(document, edge);
      assertNoDuplicateSemanticEdge(document, edge);
      document.edges.push(edge);
      return edge.id;
    });
    return textResult(object);
  } catch (error) {
    return errorResult(error);
  }
}

function updateFlowNode(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const object = mutateFlow(context, (document) => {
      const node = requireNode(document, String(input.id));
      if (node.type === "boundary" && input.type && input.type !== "boundary") {
        const childIds = document.nodes.filter((candidate) => candidate.parentId === node.id);
        if (childIds.length > 0) {
          throw new Error(`Cannot change boundary node ${node.id} while it has children`);
        }
      }
      applyNodePatch(node, input);
      reconcileContainmentForNode(document, node);
      return node.id;
    });
    return textResult(object);
  } catch (error) {
    return errorResult(error);
  }
}

function updateFlowEdge(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const object = mutateFlow(context, (document) => {
      const edge = requireEdge(document, String(input.id));
      applyEdgePatch(edge, input);
      assertEdgeEndpoints(document, edge);
      reconcileContainmentForEdge(document, edge);
      assertNoDuplicateSemanticEdge(document, edge, edge.id);
      return edge.id;
    });
    return textResult(object);
  } catch (error) {
    return errorResult(error);
  }
}

function findFlowNodes(context: PluginToolContext, input: Record<string, unknown>) {
  const document = documentFromScene(context.controller.getScene());
  const query = normalizeQuery(input.query);
  const matched = document.nodes.filter((node) => {
    if (input.type && node.type !== input.type) {
      return false;
    }
    if (input.status && node.status !== input.status) {
      return false;
    }
    if (input.owner && node.owner !== input.owner) {
      return false;
    }
    if (input.system && node.system !== input.system) {
      return false;
    }
    if (input.tag && !(node.tags ?? []).includes(String(input.tag))) {
      return false;
    }
    if (input.parentId && node.parentId !== input.parentId) {
      return false;
    }
    return !query || searchableNodeText(node).includes(query);
  });
  const limited = input.limit ? matched.slice(0, Number(input.limit)) : matched;
  return textResult({
    count: limited.length,
    ids: limited.map((node) => node.id),
    objects: limited.map((node) => getFlowObject(document, node.id)),
  });
}

function findFlowEdges(context: PluginToolContext, input: Record<string, unknown>) {
  const document = documentFromScene(context.controller.getScene());
  const query = normalizeQuery(input.query);
  const matched = document.edges.filter((edge) => {
    if (input.type && edge.type !== input.type) {
      return false;
    }
    if (input.source && edge.source !== input.source) {
      return false;
    }
    if (input.target && edge.target !== input.target) {
      return false;
    }
    if (
      input.touchingNode &&
      edge.source !== input.touchingNode &&
      edge.target !== input.touchingNode
    ) {
      return false;
    }
    if (input.tag && !(edge.tags ?? []).includes(String(input.tag))) {
      return false;
    }
    return !query || searchableEdgeText(edge).includes(query);
  });
  const limited = input.limit ? matched.slice(0, Number(input.limit)) : matched;
  return textResult({
    count: limited.length,
    ids: limited.map((edge) => edge.id),
    objects: limited.map((edge) => getFlowObject(document, edge.id)),
  });
}

function traversalResult(
  context: PluginToolContext,
  input: Record<string, unknown>,
  direction: "upstream" | "downstream",
) {
  const document = documentFromScene(context.controller.getScene());
  requireNode(document, String(input.nodeId));
  const options = {
    depth: input.depth ? Number(input.depth) : undefined,
    edgeTypes: input.edgeTypes as FlowEdgeType[] | undefined,
    includeEdges: Boolean(input.includeEdges),
  };
  const result =
    direction === "upstream"
      ? findUpstream(document, String(input.nodeId), options)
      : findDownstream(document, String(input.nodeId), options);
  return textResult({
    ...result,
    objects: result.nodeIds.map((id) => getFlowObject(document, id)),
    edges: result.edgeIds?.map((id) => getFlowObject(document, id)),
  });
}

function findPathTool(context: PluginToolContext, input: Record<string, unknown>) {
  const document = documentFromScene(context.controller.getScene());
  requireNode(document, String(input.from));
  requireNode(document, String(input.to));
  const paths = findPaths(document, String(input.from), String(input.to), {
    maxDepth: input.maxDepth ? Number(input.maxDepth) : undefined,
    edgeTypes: input.edgeTypes as FlowEdgeType[] | undefined,
    limit: input.limit ? Number(input.limit) : undefined,
  });
  return textResult({ count: paths.length, paths });
}

function findCyclesTool(context: PluginToolContext, input: Record<string, unknown>) {
  const document = documentFromScene(context.controller.getScene());
  const cycles = findCycles(document, {
    edgeTypes: input.edgeTypes as FlowEdgeType[] | undefined,
    limit: input.limit ? Number(input.limit) : undefined,
  });
  return textResult({ count: cycles.length, cycles });
}

function validateFlowTool(context: PluginToolContext, input: Record<string, unknown>) {
  const document = documentFromScene(context.controller.getScene());
  const result = validateFlowDocument(document, {
    mode: input.mode === "strict" ? "strict" : "basic",
    domainRules: Boolean(input.domainRules),
  });
  return textResult({
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    stats: flowStats(document),
  });
}

function autoLayoutFlow(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = mutateFlow(context, (document) =>
      layoutFlowDocument(document, {
        direction: input.direction as "LR" | "TB" | undefined,
        layerSpacing: input.layerSpacing ? Number(input.layerSpacing) : undefined,
        nodeSpacing: input.nodeSpacing ? Number(input.nodeSpacing) : undefined,
        preserveManualGroups: Boolean(input.preserveManualGroups),
        includeOrphans:
          input.includeOrphans === undefined ? undefined : Boolean(input.includeOrphans),
      }),
    );
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function exportMermaidTool(context: PluginToolContext, input: Record<string, unknown>) {
  const document = documentFromScene(context.controller.getScene());
  return textResult({
    format: "mermaid",
    text: exportFlowMermaid(document, {
      direction: input.direction as "LR" | "TB" | undefined,
      includeDescriptions: Boolean(input.includeDescriptions),
    }),
  });
}

function applyFlowPatch(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = context.controller.transaction(() =>
      context.controller.mutateScene((scene) => {
        const document = documentFromScene(scene);
        const created: string[] = [];
        const updated: string[] = [];
        const deleted: string[] = [];
        const warnings: string[] = [];

        for (const node of (input.createNodes as FlowNode[] | undefined) ?? []) {
          assertUniqueId(document, node.id);
          document.nodes.push(structuredClone(node));
          created.push(node.id);
        }
        for (const item of (input.updateNodes as
          | Array<{ id: string; patch: Record<string, unknown> }>
          | undefined) ?? []) {
          const node = requireNode(document, item.id);
          applyNodePatch(node, item.patch);
          reconcileContainmentForNode(document, node);
          updated.push(node.id);
        }
        for (const id of (input.deleteNodeIds as string[] | undefined) ?? []) {
          deleted.push(...deleteNode(document, id));
        }
        for (const item of (input.addPorts as
          | Array<{ nodeId: string; port: FlowPort }>
          | undefined) ?? []) {
          const node = requireNode(document, item.nodeId);
          if ((node.ports ?? []).some((port) => port.id === item.port.id)) {
            throw new Error(`Duplicate port id on node ${node.id}: ${item.port.id}`);
          }
          node.ports = [...(node.ports ?? []), structuredClone(item.port)];
          created.push(`${node.id}#${item.port.id}`);
        }
        for (const item of (input.updatePorts as
          | Array<{ nodeId: string; portId: string; patch: Record<string, unknown> }>
          | undefined) ?? []) {
          const node = requireNode(document, item.nodeId);
          const port = requirePort(node, item.portId);
          applyPortPatch(port, item.patch);
          updated.push(`${node.id}#${port.id}`);
        }
        for (const item of (input.deletePorts as
          | Array<{ nodeId: string; portId: string; repairEdges?: boolean }>
          | undefined) ?? []) {
          const deletion = deletePort(
            document,
            item.nodeId,
            item.portId,
            Boolean(item.repairEdges),
          );
          deleted.push(...deletion.deleted);
        }
        for (const edge of (input.createEdges as FlowEdge[] | undefined) ?? []) {
          const nextEdge = structuredClone(edge);
          assertUniqueId(document, nextEdge.id);
          assertEdgeEndpoints(document, nextEdge);
          reconcileContainmentForEdge(document, nextEdge);
          assertNoDuplicateSemanticEdge(document, nextEdge);
          document.edges.push(nextEdge);
          created.push(nextEdge.id);
        }
        for (const item of (input.updateEdges as
          | Array<{ id: string; patch: Record<string, unknown> }>
          | undefined) ?? []) {
          const edge = requireEdge(document, item.id);
          applyEdgePatch(edge, item.patch);
          assertEdgeEndpoints(document, edge);
          reconcileContainmentForEdge(document, edge);
          assertNoDuplicateSemanticEdge(document, edge, edge.id);
          updated.push(edge.id);
        }
        for (const id of (input.deleteEdgeIds as string[] | undefined) ?? []) {
          if (deleteEdge(document, id)) {
            deleted.push(id);
          }
        }

        const validation = assertValidFlowDocument(document, { repair: Boolean(input.repair) });
        scene.native = validation.document;
        warnings.push(...validation.warnings.map((warning) => warning.message));
        const response: Record<string, unknown> = {
          created,
          updated,
          deleted,
          warnings,
          validation: {
            valid: true,
            errors: [],
            warnings: validation.warnings,
          },
          version: context.controller.currentVersion() + 1,
        };
        if (input.returnObjects) {
          response.objects = [...new Set([...created, ...updated])]
            .map((id) => getFlowObject(validation.document, id))
            .filter(Boolean);
        }
        return response;
      }),
    );
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function mutateFlow<T>(context: PluginToolContext, mutator: (document: FlowDocument) => T) {
  return context.controller.transaction(() =>
    context.controller.mutateScene((scene) => {
      const document = documentFromScene(scene);
      const result = mutator(document);
      const validation = assertValidFlowDocument(document);
      scene.native = validation.document;
      if (typeof result === "string") {
        return getFlowObject(validation.document, result);
      }
      return result;
    }),
  );
}

function buildNode(document: FlowDocument, input: Record<string, unknown>): FlowNode {
  const type = input.type as FlowNode["type"];
  const defaults = FLOW_NODE_DEFAULTS[type];
  const position =
    input.x !== undefined && input.y !== undefined
      ? { x: Number(input.x), y: Number(input.y) }
      : nextFreePosition(document);
  return stripUndefined({
    id: createFlowId("node"),
    type,
    label: String(input.label),
    description: input.description as string | undefined,
    x: position.x,
    y: position.y,
    width: Number(input.width ?? defaults.width),
    height: Number(input.height ?? defaults.height),
    status: input.status as FlowNode["status"],
    owner: input.owner as string | undefined,
    system: input.system as string | undefined,
    tags: input.tags as string[] | undefined,
    parentId: input.parentId as string | undefined,
    ports: input.ports ? structuredClone(input.ports as FlowPort[]) : undefined,
    metadata: input.metadata as Record<string, unknown> | undefined,
  });
}

function buildPort(node: FlowNode, input: Record<string, unknown>): FlowPort {
  const id = (input.id as string | undefined) ?? createFlowId("port");
  if ((node.ports ?? []).some((port) => port.id === id)) {
    throw new Error(`Duplicate port id on node ${node.id}: ${id}`);
  }
  return stripUndefined({
    id,
    label: input.label as string | undefined,
    direction: input.direction as FlowPort["direction"],
    side: input.side as FlowPort["side"],
    protocol: input.protocol as string | undefined,
    dataType: input.dataType as string | undefined,
    required: input.required as boolean | undefined,
    metadata: input.metadata as Record<string, unknown> | undefined,
  });
}

function buildEdge(document: FlowDocument, input: Record<string, unknown>): FlowEdge {
  assertEdgeEndpointValues(
    document,
    String(input.source),
    String(input.target),
    input.sourcePort as string | undefined,
    input.targetPort as string | undefined,
  );
  return stripUndefined({
    id: createFlowId("edge"),
    type: (input.type as FlowEdge["type"] | undefined) ?? "generic",
    source: String(input.source),
    target: String(input.target),
    sourcePort: input.sourcePort as string | undefined,
    targetPort: input.targetPort as string | undefined,
    label: input.label as string | undefined,
    description: input.description as string | undefined,
    status: input.status as FlowEdge["status"],
    direction: input.direction as FlowEdge["direction"],
    tags: input.tags as string[] | undefined,
    metadata: input.metadata as Record<string, unknown> | undefined,
  });
}

function applyNodePatch(node: FlowNode, patch: Record<string, unknown>): void {
  if (patch.type !== undefined) {
    node.type = patch.type as FlowNode["type"];
  }
  if (patch.label !== undefined) {
    node.label = String(patch.label);
  }
  for (const field of ["x", "y", "width", "height"] as const) {
    if (patch[field] !== undefined) {
      node[field] = Number(patch[field]);
    }
  }
  assignNullable(node, "description", patch.description);
  assignNullable(node, "owner", patch.owner);
  assignNullable(node, "system", patch.system);
  assignNullable(node, "parentId", patch.parentId);
  assignNullable(node, "metadata", patch.metadata);
  if (patch.status !== undefined) {
    node.status = patch.status as FlowNode["status"];
  }
  if (patch.tags !== undefined) {
    node.tags = patch.tags as string[];
  }
}

function applyEdgePatch(edge: FlowEdge, patch: Record<string, unknown>): void {
  if (patch.type !== undefined) {
    edge.type = patch.type as FlowEdge["type"];
  }
  if (patch.source !== undefined) {
    edge.source = String(patch.source);
  }
  if (patch.target !== undefined) {
    edge.target = String(patch.target);
  }
  assignNullable(edge, "sourcePort", patch.sourcePort);
  assignNullable(edge, "targetPort", patch.targetPort);
  assignNullable(edge, "label", patch.label);
  assignNullable(edge, "description", patch.description);
  assignNullable(edge, "metadata", patch.metadata);
  if (patch.status !== undefined) {
    edge.status = patch.status as FlowEdge["status"];
  }
  if (patch.direction !== undefined) {
    edge.direction = patch.direction as FlowEdge["direction"];
  }
  if (patch.tags !== undefined) {
    edge.tags = patch.tags as string[];
  }
}

function applyPortPatch(port: FlowPort, patch: Record<string, unknown>): void {
  assignNullable(port, "label", patch.label);
  assignNullable(port, "protocol", patch.protocol);
  assignNullable(port, "dataType", patch.dataType);
  assignNullable(port, "required", patch.required);
  assignNullable(port, "metadata", patch.metadata);
  if (patch.direction !== undefined) {
    port.direction = patch.direction as FlowPort["direction"];
  }
  if (patch.side !== undefined) {
    port.side = patch.side as FlowPort["side"];
  }
}

function deletePort(
  document: FlowDocument,
  nodeId: string,
  portId: string,
  repairEdges: boolean,
): { deleted: string[]; repairedEdges: string[] } {
  const node = requireNode(document, nodeId);
  requirePort(node, portId);
  const affected = document.edges.filter(
    (edge) =>
      (edge.source === nodeId && edge.sourcePort === portId) ||
      (edge.target === nodeId && edge.targetPort === portId),
  );
  if (affected.length > 0 && !repairEdges) {
    throw new Error(
      `Port ${nodeId}#${portId} is referenced by edges: ${affected.map((edge) => edge.id).join(", ")}`,
    );
  }
  for (const edge of affected) {
    if (edge.source === nodeId && edge.sourcePort === portId) {
      edge.sourcePort = undefined;
    }
    if (edge.target === nodeId && edge.targetPort === portId) {
      edge.targetPort = undefined;
    }
  }
  node.ports = (node.ports ?? []).filter((port) => port.id !== portId);
  return {
    deleted: [`${nodeId}#${portId}`],
    repairedEdges: affected.map((edge) => edge.id),
  };
}

function deleteNode(document: FlowDocument, id: string): string[] {
  const deleted: string[] = [];
  const beforeNodes = document.nodes.length;
  document.nodes = document.nodes.filter((node) => node.id !== id);
  if (document.nodes.length !== beforeNodes) {
    deleted.push(id);
  }
  document.edges = document.edges.filter((edge) => {
    const keep = edge.source !== id && edge.target !== id;
    if (!keep) {
      deleted.push(edge.id);
    }
    return keep;
  });
  for (const node of document.nodes) {
    if (node.parentId === id) {
      node.parentId = undefined;
    }
  }
  return deleted;
}

function deleteEdge(document: FlowDocument, id: string): boolean {
  const edge = document.edges.find((candidate) => candidate.id === id);
  if (!edge) {
    return false;
  }
  if (edge.type === "contains") {
    const target = document.nodes.find((node) => node.id === edge.target);
    if (target?.parentId === edge.source) {
      target.parentId = undefined;
    }
  }
  document.edges = document.edges.filter((candidate) => candidate.id !== id);
  return true;
}

function requireNode(document: FlowDocument, id: string): FlowNode {
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (!node) {
    throw new Error(`Flow node not found: ${id}`);
  }
  return node;
}

function requireEdge(document: FlowDocument, id: string): FlowEdge {
  const edge = document.edges.find((candidate) => candidate.id === id);
  if (!edge) {
    throw new Error(`Flow edge not found: ${id}`);
  }
  return edge;
}

function requirePort(node: FlowNode, id: string): FlowPort {
  const port = (node.ports ?? []).find((candidate) => candidate.id === id);
  if (!port) {
    throw new Error(`Flow port not found: ${node.id}#${id}`);
  }
  return port;
}

function assertEdgeEndpoints(document: FlowDocument, edge: FlowEdge): void {
  assertEdgeEndpointValues(document, edge.source, edge.target, edge.sourcePort, edge.targetPort);
}

function assertEdgeEndpointValues(
  document: FlowDocument,
  sourceId: string,
  targetId: string,
  sourcePortId?: string,
  targetPortId?: string,
): void {
  const source = requireNode(document, sourceId);
  const target = requireNode(document, targetId);
  if (sourcePortId) {
    const sourcePort = findPort(source, sourcePortId);
    if (!sourcePort) {
      throw new Error(`Source port ${source.id}#${sourcePortId} does not exist`);
    }
    if (sourcePort.direction === "in") {
      throw new Error(`Source port ${source.id}#${sourcePortId} cannot be in-only`);
    }
  }
  if (targetPortId) {
    const targetPort = findPort(target, targetPortId);
    if (!targetPort) {
      throw new Error(`Target port ${target.id}#${targetPortId} does not exist`);
    }
    if (targetPort.direction === "out") {
      throw new Error(`Target port ${target.id}#${targetPortId} cannot be out-only`);
    }
  }
}

function reconcileContainmentForNode(document: FlowDocument, node: FlowNode): void {
  if (!node.parentId) {
    document.edges = document.edges.filter(
      (edge) => edge.type !== "contains" || edge.target !== node.id,
    );
    return;
  }
  document.edges = document.edges.filter(
    (edge) => edge.type !== "contains" || edge.target !== node.id || edge.source === node.parentId,
  );
}

function reconcileContainmentForEdge(document: FlowDocument, edge: FlowEdge): void {
  if (edge.type !== "contains") {
    return;
  }
  const source = requireNode(document, edge.source);
  const target = requireNode(document, edge.target);
  if (source.type !== "boundary") {
    throw new Error(`Contains edge source must be a boundary: ${edge.source}`);
  }
  target.parentId = source.id;
  document.edges = document.edges.filter(
    (candidate) =>
      candidate.id === edge.id ||
      candidate.type !== "contains" ||
      candidate.target !== target.id ||
      candidate.source === source.id,
  );
}

function findPort(node: FlowNode, id: string): FlowPort | undefined {
  return (node.ports ?? []).find((candidate) => candidate.id === id);
}

function assertUniqueId(document: FlowDocument, id: string): void {
  if (
    document.nodes.some((node) => node.id === id) ||
    document.edges.some((edge) => edge.id === id)
  ) {
    throw new Error(`Duplicate Flow id: ${id}`);
  }
}

function assertNoDuplicateSemanticEdge(
  document: FlowDocument,
  edge: FlowEdge,
  existingId?: string,
): void {
  const duplicate = document.edges.find(
    (candidate) =>
      candidate.id !== existingId &&
      candidate.source === edge.source &&
      candidate.target === edge.target &&
      candidate.sourcePort === edge.sourcePort &&
      candidate.targetPort === edge.targetPort &&
      candidate.type === edge.type &&
      (candidate.label ?? "") === (edge.label ?? ""),
  );
  if (duplicate) {
    throw new Error(`Duplicate semantic Flow edge: ${duplicate.id}`);
  }
}

function flowStats(document: FlowDocument) {
  const connected = new Set<string>();
  for (const edge of document.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return {
    nodeCount: document.nodes.length,
    edgeCount: document.edges.length,
    portCount: document.nodes.reduce((count, node) => count + (node.ports?.length ?? 0), 0),
    orphanNodeCount: document.nodes.filter(
      (node) => node.type !== "boundary" && !connected.has(node.id),
    ).length,
    cycleCount: findCycles(document, { limit: 50 }).length,
  };
}

function nextFreePosition(document: FlowDocument): { x: number; y: number } {
  const index = document.nodes.filter((node) => node.type !== "boundary").length;
  return { x: (index % 3) * 320, y: Math.floor(index / 3) * 180 };
}

function documentFromScene(scene: Scene): FlowDocument {
  if (isFlowDocument(scene.native)) {
    return scene.native;
  }
  return deserializeFlowDocument(JSON.stringify(scene.native), { repair: true }).document;
}

function isFlowDocument(value: unknown): value is FlowDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === FLOW_DOCUMENT_TYPE &&
    (value as { version?: unknown }).version === FLOW_DOCUMENT_VERSION &&
    Array.isArray((value as { nodes?: unknown }).nodes) &&
    Array.isArray((value as { edges?: unknown }).edges)
  );
}

function searchableNodeText(node: FlowNode): string {
  return [
    node.label,
    node.description,
    node.owner,
    node.system,
    ...(node.tags ?? []),
    ...Object.values(node.metadata ?? {}).filter(
      (value): value is string => typeof value === "string",
    ),
    ...(node.ports ?? []).flatMap((port) => [
      port.label,
      port.protocol,
      port.dataType,
      ...Object.values(port.metadata ?? {}).filter(
        (value): value is string => typeof value === "string",
      ),
    ]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function searchableEdgeText(edge: FlowEdge): string {
  return [
    edge.label,
    edge.description,
    edge.type,
    ...(edge.tags ?? []),
    ...Object.values(edge.metadata ?? {}).filter(
      (value): value is string => typeof value === "string",
    ),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function normalizeQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.toLowerCase() : undefined;
}

function assignNullable<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }
  if (value === null) {
    target[key] = undefined as T[K];
    return;
  }
  target[key] = value as T[K];
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
