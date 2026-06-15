import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PluginToolContext } from "../../core/plugin.js";
import type { Scene } from "../../core/scene.js";
import { getJsonCanvasObject, listJsonCanvasObjects } from "./adapter.js";
import { nextGridPosition } from "./layout.js";
import type {
  JsonCanvasDocument,
  JsonCanvasEdge,
  JsonCanvasGroupNode,
  JsonCanvasNode,
} from "./model.js";
import { JSON_CANVAS_DEFAULT_SIZE } from "./model.js";
import {
  jsonCanvasColorSchema,
  jsonCanvasEdgeSchema,
  jsonCanvasEndSchema,
  jsonCanvasGeometryInput,
  jsonCanvasNodeSchema,
  jsonCanvasSideSchema,
} from "./schemas.js";
import { createJsonCanvasId, validateJsonCanvasDocument } from "./validation.js";

const textCardShape = {
  text: z.string().min(1),
  ...jsonCanvasGeometryInput,
};

const fileCardShape = {
  file: z.string().min(1),
  subpath: z.string().startsWith("#").optional(),
  ...jsonCanvasGeometryInput,
};

const linkCardShape = {
  url: z.string().url(),
  ...jsonCanvasGeometryInput,
};

const groupShape = {
  label: z.string().optional(),
  background: z.string().optional(),
  backgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
  ...jsonCanvasGeometryInput,
};

const connectCardsShape = {
  fromNode: z.string(),
  toNode: z.string(),
  fromSide: jsonCanvasSideSchema.optional(),
  toSide: jsonCanvasSideSchema.optional(),
  fromEnd: jsonCanvasEndSchema.optional(),
  toEnd: jsonCanvasEndSchema.default("arrow"),
  label: z.string().optional(),
  color: jsonCanvasColorSchema.optional(),
};

const updateCardShape = {
  id: z.string(),
  text: z.string().optional(),
  file: z.string().optional(),
  subpath: z.string().nullable().optional(),
  url: z.string().url().optional(),
  label: z.string().nullable().optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  color: jsonCanvasColorSchema.nullable().optional(),
  background: z.string().nullable().optional(),
  backgroundStyle: z.enum(["cover", "ratio", "repeat"]).nullable().optional(),
};

const updateEdgeShape = {
  id: z.string(),
  fromNode: z.string().optional(),
  toNode: z.string().optional(),
  fromSide: jsonCanvasSideSchema.nullable().optional(),
  toSide: jsonCanvasSideSchema.nullable().optional(),
  fromEnd: jsonCanvasEndSchema.nullable().optional(),
  toEnd: jsonCanvasEndSchema.nullable().optional(),
  label: z.string().nullable().optional(),
  color: jsonCanvasColorSchema.nullable().optional(),
};

const findCardsShape = {
  query: z.string().optional(),
  type: z.enum(["text", "file", "link", "group"]).optional(),
  color: jsonCanvasColorSchema.optional(),
  insideGroup: z.string().optional(),
  limit: z.number().int().positive().optional(),
};

const findEdgesShape = {
  query: z.string().optional(),
  fromNode: z.string().optional(),
  toNode: z.string().optional(),
  touchingNode: z.string().optional(),
  color: jsonCanvasColorSchema.optional(),
  limit: z.number().int().positive().optional(),
};

const autoLayoutShape = {
  direction: z.enum(["right", "down"]).optional(),
  layerSpacing: z.number().int().positive().optional(),
  nodeSpacing: z.number().int().positive().optional(),
  includeGroups: z.boolean().optional(),
  resizeGroups: z.boolean().optional(),
};

const updateNodePatchSchema = z.object(updateCardShape).omit({ id: true });
const updateEdgePatchSchema = z.object(updateEdgeShape).omit({ id: true });

const applyPatchShape = {
  createNodes: z.array(jsonCanvasNodeSchema).optional(),
  updateNodes: z.array(z.object({ id: z.string(), patch: updateNodePatchSchema })).optional(),
  deleteNodeIds: z.array(z.string()).optional(),
  createEdges: z.array(jsonCanvasEdgeSchema).optional(),
  updateEdges: z.array(z.object({ id: z.string(), patch: updateEdgePatchSchema })).optional(),
  deleteEdgeIds: z.array(z.string()).optional(),
  repair: z.boolean().optional(),
};

export function registerJsonCanvasTools(server: McpServer, context: PluginToolContext): void {
  server.registerTool(
    "add_text_card",
    {
      description: "Create a JSON Canvas text card.",
      inputSchema: textCardShape,
    },
    async (input) => createNodeTool(context, "text", input),
  );

  server.registerTool(
    "add_file_card",
    {
      description: "Create a JSON Canvas file card.",
      inputSchema: fileCardShape,
    },
    async (input) => createNodeTool(context, "file", input),
  );

  server.registerTool(
    "add_link_card",
    {
      description: "Create a JSON Canvas link card.",
      inputSchema: linkCardShape,
    },
    async (input) => createNodeTool(context, "link", input),
  );

  server.registerTool(
    "create_group",
    {
      description: "Create a JSON Canvas visual group.",
      inputSchema: groupShape,
    },
    async (input) => createNodeTool(context, "group", input),
  );

  server.registerTool(
    "connect_cards",
    {
      description: "Connect two JSON Canvas cards with an edge.",
      inputSchema: connectCardsShape,
    },
    async (input) => connectCards(context, input),
  );

  server.registerTool(
    "update_card",
    {
      description: "Update a JSON Canvas node.",
      inputSchema: updateCardShape,
    },
    async (input) => updateCard(context, input),
  );

  server.registerTool(
    "update_edge",
    {
      description: "Update a JSON Canvas edge.",
      inputSchema: updateEdgeShape,
    },
    async (input) => updateEdge(context, input),
  );

  server.registerTool(
    "find_cards",
    {
      description: "Search JSON Canvas cards.",
      inputSchema: findCardsShape,
    },
    async (input) => findCards(context, input),
  );

  server.registerTool(
    "find_edges",
    {
      description: "Search JSON Canvas edges.",
      inputSchema: findEdgesShape,
    },
    async (input) => findEdges(context, input),
  );

  server.registerTool(
    "auto_layout_cards",
    {
      description: "Deterministically lay out JSON Canvas cards.",
      inputSchema: autoLayoutShape,
    },
    async (input) => autoLayoutCards(context, input),
  );

  server.registerTool(
    "apply_jsoncanvas_patch",
    {
      description: "Atomically apply JSON Canvas node and edge changes.",
      inputSchema: applyPatchShape,
    },
    async (input) => applyJsonCanvasPatch(context, input),
  );
}

function createNodeTool(
  context: PluginToolContext,
  type: JsonCanvasNode["type"],
  input: Record<string, unknown>,
) {
  try {
    const node = context.controller.mutateScene((scene) => {
      const document = documentFromScene(scene);
      const created = buildNode(document, type, input);
      document.nodes = [...(document.nodes ?? []), created];
      validateJsonCanvasDocument(document);
      return created;
    });
    return textResult(node);
  } catch (error) {
    return errorResult(error);
  }
}

function connectCards(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = context.controller.mutateScene((scene) => {
      const document = documentFromScene(scene);
      const created: JsonCanvasEdge = {
        id: createJsonCanvasId("edge"),
        fromNode: String(input.fromNode),
        toNode: String(input.toNode),
        toEnd: (input.toEnd as JsonCanvasEdge["toEnd"]) ?? "arrow",
      };
      assignDefined(created, "fromSide", input.fromSide);
      assignDefined(created, "toSide", input.toSide);
      assignDefined(created, "fromEnd", input.fromEnd);
      assignDefined(created, "label", input.label);
      assignDefined(created, "color", input.color);
      assertNodeExists(document, created.fromNode);
      assertNodeExists(document, created.toNode);
      const warnings = edgeWarnings(document, created);
      document.edges = [...(document.edges ?? []), created];
      validateJsonCanvasDocument(document);
      return { ...created, warnings };
    });
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function updateCard(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const object = context.controller.mutateScene((scene) => {
      const document = documentFromScene(scene);
      const node = findNode(document, String(input.id));
      if (!node) {
        throw new Error(`Card not found: ${String(input.id)}`);
      }
      applyNodePatch(node, input);
      validateJsonCanvasDocument(document);
      return getJsonCanvasObject(document, node.id);
    });
    return textResult(object);
  } catch (error) {
    return errorResult(error);
  }
}

function updateEdge(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = context.controller.mutateScene((scene) => {
      const document = documentFromScene(scene);
      const existing = findEdge(document, String(input.id));
      if (!existing) {
        throw new Error(`Edge not found: ${String(input.id)}`);
      }
      applyEdgePatch(document, existing, input);
      validateJsonCanvasDocument(document);
      return { ...existing, warnings: edgeWarnings(document, existing, existing.id) };
    });
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function findCards(context: PluginToolContext, input: Record<string, unknown>) {
  const document = documentFromScene(context.controller.getScene());
  const query = normalizeQuery(input.query);
  const insideGroup = input.insideGroup ? findNode(document, String(input.insideGroup)) : undefined;
  const matched = (document.nodes ?? []).filter((node) => {
    if (input.type && node.type !== input.type) {
      return false;
    }
    if (input.color && node.color !== input.color) {
      return false;
    }
    if (insideGroup && !containsNode(insideGroup, node)) {
      return false;
    }
    return !query || searchableNodeText(node).includes(query);
  });
  const limited = input.limit ? matched.slice(0, Number(input.limit)) : matched;
  return textResult({
    count: limited.length,
    ids: limited.map((node) => node.id),
    objects: limited.map((node) => getJsonCanvasObject(document, node.id)),
  });
}

function findEdges(context: PluginToolContext, input: Record<string, unknown>) {
  const document = documentFromScene(context.controller.getScene());
  const query = normalizeQuery(input.query);
  const matched = (document.edges ?? []).filter((edge) => {
    if (input.fromNode && edge.fromNode !== input.fromNode) {
      return false;
    }
    if (input.toNode && edge.toNode !== input.toNode) {
      return false;
    }
    if (
      input.touchingNode &&
      edge.fromNode !== input.touchingNode &&
      edge.toNode !== input.touchingNode
    ) {
      return false;
    }
    if (input.color && edge.color !== input.color) {
      return false;
    }
    return !query || (edge.label ?? "").toLowerCase().includes(query);
  });
  const limited = input.limit ? matched.slice(0, Number(input.limit)) : matched;
  return textResult({
    count: limited.length,
    ids: limited.map((edge) => edge.id),
    objects: limited.map((edge) => getJsonCanvasObject(document, edge.id)),
  });
}

function autoLayoutCards(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = context.controller.mutateScene((scene) => {
      const document = documentFromScene(scene);
      const moved = layoutDocument(document, {
        direction: input.direction === "down" ? "down" : "right",
        layerSpacing: Number(input.layerSpacing ?? 60),
        nodeSpacing: Number(input.nodeSpacing ?? 120),
        includeGroups: Boolean(input.includeGroups),
      });
      validateJsonCanvasDocument(document);
      return moved;
    });
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function applyJsonCanvasPatch(context: PluginToolContext, input: Record<string, unknown>) {
  try {
    const result = context.controller.transaction(() =>
      context.controller.mutateScene((scene) => {
        const document = documentFromScene(scene);
        const created: string[] = [];
        const updated: string[] = [];
        const deleted: string[] = [];
        const warnings: string[] = [];

        for (const node of (input.createNodes as JsonCanvasNode[] | undefined) ?? []) {
          assertUniqueNodeId(document, node.id);
          document.nodes = [...(document.nodes ?? []), structuredClone(node)];
          created.push(node.id);
        }
        for (const item of (input.updateNodes as
          | Array<{ id: string; patch: Record<string, unknown> }>
          | undefined) ?? []) {
          const node = findNode(document, item.id);
          if (!node) {
            throw new Error(`Card not found: ${item.id}`);
          }
          applyNodePatch(node, item.patch);
          updated.push(node.id);
        }
        for (const id of (input.deleteNodeIds as string[] | undefined) ?? []) {
          deleted.push(...deleteNode(document, id));
        }
        for (const edge of (input.createEdges as JsonCanvasEdge[] | undefined) ?? []) {
          assertUniqueEdgeId(document, edge.id);
          assertNodeExists(document, edge.fromNode);
          assertNodeExists(document, edge.toNode);
          warnings.push(...edgeWarnings(document, edge));
          document.edges = [...(document.edges ?? []), structuredClone(edge)];
          created.push(edge.id);
        }
        for (const item of (input.updateEdges as
          | Array<{ id: string; patch: Record<string, unknown> }>
          | undefined) ?? []) {
          const edge = findEdge(document, item.id);
          if (!edge) {
            throw new Error(`Edge not found: ${item.id}`);
          }
          applyEdgePatch(document, edge, item.patch);
          warnings.push(...edgeWarnings(document, edge, edge.id));
          updated.push(edge.id);
        }
        for (const id of (input.deleteEdgeIds as string[] | undefined) ?? []) {
          if (deleteEdge(document, id)) {
            deleted.push(id);
          }
        }

        const validation = validateJsonCanvasDocument(document, {
          repair: Boolean(input.repair),
        });
        scene.native = validation.document;
        return {
          created,
          updated,
          deleted,
          warnings: [...warnings, ...validation.warnings],
          version: context.controller.currentVersion() + 1,
        };
      }),
    );
    return textResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

function buildNode(
  document: JsonCanvasDocument,
  type: JsonCanvasNode["type"],
  input: Record<string, unknown>,
): JsonCanvasNode {
  const defaults = JSON_CANVAS_DEFAULT_SIZE[type];
  const position =
    input.x !== undefined && input.y !== undefined
      ? { x: Number(input.x), y: Number(input.y) }
      : nextGridPosition(document);
  const base = {
    id: createJsonCanvasId(type === "group" ? "group" : "card"),
    type,
    x: position.x,
    y: position.y,
    width: Number(input.width ?? defaults.width),
    height: Number(input.height ?? defaults.height),
    color: input.color as JsonCanvasNode["color"],
  };
  if (type === "text") {
    return stripUndefined({ ...base, type, text: String(input.text) });
  }
  if (type === "file") {
    return stripUndefined({
      ...base,
      type,
      file: String(input.file),
      subpath: input.subpath as string | undefined,
    });
  }
  if (type === "link") {
    return stripUndefined({ ...base, type, url: String(input.url) });
  }
  return stripUndefined({
    ...base,
    type,
    label: input.label as string | undefined,
    background: input.background as string | undefined,
    backgroundStyle: input.backgroundStyle as JsonCanvasGroupNode["backgroundStyle"],
  });
}

function applyNodePatch(node: JsonCanvasNode, patch: Record<string, unknown>): void {
  assertApplicableNodeFields(node, patch);
  for (const field of ["x", "y", "width", "height"] as const) {
    if (patch[field] !== undefined) {
      node[field] = Number(patch[field]);
    }
  }
  if ("color" in patch) {
    if (patch.color === null) {
      node.color = undefined;
    } else {
      node.color = patch.color as JsonCanvasNode["color"];
    }
  }
  if (node.type === "text" && patch.text !== undefined) {
    node.text = String(patch.text);
  }
  if (node.type === "file") {
    if (patch.file !== undefined) {
      node.file = String(patch.file);
    }
    if ("subpath" in patch) {
      if (patch.subpath === null) {
        node.subpath = undefined;
      } else {
        node.subpath = String(patch.subpath);
      }
    }
  }
  if (node.type === "link" && patch.url !== undefined) {
    node.url = String(patch.url);
  }
  if (node.type === "group") {
    assignNullable(node, "label", patch.label);
    assignNullable(node, "background", patch.background);
    assignNullable(node, "backgroundStyle", patch.backgroundStyle);
  }
}

function applyEdgePatch(
  document: JsonCanvasDocument,
  edge: JsonCanvasEdge,
  patch: Record<string, unknown>,
): void {
  if (patch.fromNode !== undefined) {
    assertNodeExists(document, String(patch.fromNode));
    edge.fromNode = String(patch.fromNode);
  }
  if (patch.toNode !== undefined) {
    assertNodeExists(document, String(patch.toNode));
    edge.toNode = String(patch.toNode);
  }
  assignNullable(edge, "fromSide", patch.fromSide);
  assignNullable(edge, "toSide", patch.toSide);
  assignNullable(edge, "fromEnd", patch.fromEnd);
  assignNullable(edge, "toEnd", patch.toEnd);
  assignNullable(edge, "label", patch.label);
  assignNullable(edge, "color", patch.color);
}

function assertApplicableNodeFields(node: JsonCanvasNode, patch: Record<string, unknown>): void {
  const common = new Set(["id", "x", "y", "width", "height", "color"]);
  const allowed = {
    text: new Set([...common, "text"]),
    file: new Set([...common, "file", "subpath"]),
    link: new Set([...common, "url"]),
    group: new Set([...common, "label", "background", "backgroundStyle"]),
  }[node.type];
  const invalid = Object.keys(patch).filter((field) => !allowed.has(field));
  if (invalid.length > 0) {
    throw new Error(`Fields not applicable to ${node.type} node: ${invalid.join(", ")}`);
  }
}

function layoutDocument(
  document: JsonCanvasDocument,
  options: {
    direction: "right" | "down";
    layerSpacing: number;
    nodeSpacing: number;
    includeGroups: boolean;
  },
) {
  const nodes = (document.nodes ?? []).filter(
    (node) => options.includeGroups || node.type !== "group",
  );
  const layers = layeredNodes(document, nodes);
  const moved: Array<{
    id: string;
    oldBounds: { x: number; y: number; width: number; height: number };
    newBounds: { x: number; y: number; width: number; height: number };
  }> = [];

  for (const [layerIndex, layer] of layers.entries()) {
    const sorted = [...layer].sort(
      (left, right) =>
        left.y - right.y ||
        nodeSortText(left).localeCompare(nodeSortText(right)) ||
        left.id.localeCompare(right.id),
    );
    for (const [index, node] of sorted.entries()) {
      const oldBounds = { x: node.x, y: node.y, width: node.width, height: node.height };
      if (options.direction === "right") {
        node.x = layerStart(layers, layerIndex, "x", options.layerSpacing);
        node.y = stackStart(sorted, index, "y", options.nodeSpacing);
      } else {
        node.x = stackStart(sorted, index, "x", options.nodeSpacing);
        node.y = layerStart(layers, layerIndex, "y", options.layerSpacing);
      }
      const newBounds = { x: node.x, y: node.y, width: node.width, height: node.height };
      if (oldBounds.x !== newBounds.x || oldBounds.y !== newBounds.y) {
        moved.push({ id: node.id, oldBounds, newBounds });
      }
    }
  }

  return { movedIds: moved.map((item) => item.id), moved };
}

function layerStart(
  layers: JsonCanvasNode[][],
  layerIndex: number,
  axis: "x" | "y",
  spacing: number,
): number {
  let offset = 0;
  for (let index = 0; index < layerIndex; index += 1) {
    const layer = layers[index] ?? [];
    const maxExtent = Math.max(
      0,
      ...layer.map((node) => (axis === "x" ? node.width : node.height)),
    );
    offset += maxExtent + spacing;
  }
  return offset;
}

function stackStart(
  nodes: JsonCanvasNode[],
  nodeIndex: number,
  axis: "x" | "y",
  spacing: number,
): number {
  let offset = 0;
  for (let index = 0; index < nodeIndex; index += 1) {
    const node = nodes[index];
    offset += (axis === "x" ? node.width : node.height) + spacing;
  }
  return offset;
}

function layeredNodes(document: JsonCanvasDocument, nodes: JsonCanvasNode[]): JsonCanvasNode[][] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, JsonCanvasEdge[]>();
  const outgoing = new Map<string, JsonCanvasEdge[]>();
  for (const edge of document.edges ?? []) {
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) {
      continue;
    }
    incoming.set(edge.toNode, [...(incoming.get(edge.toNode) ?? []), edge]);
    outgoing.set(edge.fromNode, [...(outgoing.get(edge.fromNode) ?? []), edge]);
  }
  const roots = nodes.filter((node) => (incoming.get(node.id) ?? []).length === 0);
  const seedRoots =
    roots.length > 0 ? roots : [...nodes].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 1);
  const layerById = new Map<string, number>();
  for (const root of seedRoots) {
    assignLayers(root.id, 0, outgoing, layerById, new Set());
  }
  for (const node of nodes) {
    if (!layerById.has(node.id)) {
      layerById.set(node.id, Math.max(0, layerById.size));
    }
  }
  const layers: JsonCanvasNode[][] = [];
  for (const node of nodes) {
    const layer = layerById.get(node.id) ?? 0;
    layers[layer] = [...(layers[layer] ?? []), node];
  }
  return layers.filter(Boolean);
}

function assignLayers(
  nodeId: string,
  layer: number,
  outgoing: Map<string, JsonCanvasEdge[]>,
  layerById: Map<string, number>,
  visiting: Set<string>,
): void {
  if (visiting.has(nodeId)) {
    return;
  }
  visiting.add(nodeId);
  layerById.set(nodeId, Math.max(layerById.get(nodeId) ?? 0, layer));
  for (const edge of outgoing.get(nodeId) ?? []) {
    assignLayers(edge.toNode, layer + 1, outgoing, layerById, visiting);
  }
  visiting.delete(nodeId);
}

function deleteNode(document: JsonCanvasDocument, id: string): string[] {
  const deleted: string[] = [];
  const beforeNodes = document.nodes?.length ?? 0;
  document.nodes = (document.nodes ?? []).filter((node) => node.id !== id);
  if ((document.nodes ?? []).length !== beforeNodes) {
    deleted.push(id);
  }
  document.edges = (document.edges ?? []).filter((edge) => {
    const keep = edge.fromNode !== id && edge.toNode !== id;
    if (!keep) {
      deleted.push(edge.id);
    }
    return keep;
  });
  return deleted;
}

function deleteEdge(document: JsonCanvasDocument, id: string): boolean {
  const before = document.edges?.length ?? 0;
  document.edges = (document.edges ?? []).filter((edge) => edge.id !== id);
  return (document.edges ?? []).length !== before;
}

function documentFromScene(scene: Scene): JsonCanvasDocument {
  return scene.native as JsonCanvasDocument;
}

function findNode(document: JsonCanvasDocument, id: string): JsonCanvasNode | undefined {
  return (document.nodes ?? []).find((node) => node.id === id);
}

function findEdge(document: JsonCanvasDocument, id: string): JsonCanvasEdge | undefined {
  return (document.edges ?? []).find((edge) => edge.id === id);
}

function assertNodeExists(document: JsonCanvasDocument, id: string): void {
  if (!findNode(document, id)) {
    throw new Error(`Card not found: ${id}`);
  }
}

function assertUniqueNodeId(document: JsonCanvasDocument, id: string): void {
  if (findNode(document, id) || findEdge(document, id)) {
    throw new Error(`Duplicate node id: ${id}`);
  }
}

function assertUniqueEdgeId(document: JsonCanvasDocument, id: string): void {
  if (findEdge(document, id) || findNode(document, id)) {
    throw new Error(`Duplicate edge id: ${id}`);
  }
}

function edgeWarnings(
  document: JsonCanvasDocument,
  edge: JsonCanvasEdge,
  existingId?: string,
): string[] {
  const warnings: string[] = [];
  if (edge.fromNode === edge.toNode) {
    warnings.push(`Edge ${edge.id} is a self-loop`);
  }
  if (
    (document.edges ?? []).some(
      (candidate) =>
        candidate.id !== existingId &&
        candidate.fromNode === edge.fromNode &&
        candidate.toNode === edge.toNode,
    )
  ) {
    warnings.push(`Edge ${edge.id} is parallel to an existing edge`);
  }
  return warnings;
}

function searchableNodeText(node: JsonCanvasNode): string {
  if (node.type === "text") {
    return node.text.toLowerCase();
  }
  if (node.type === "file") {
    return `${node.file} ${node.subpath ?? ""}`.toLowerCase();
  }
  if (node.type === "link") {
    return node.url.toLowerCase();
  }
  return (node.label ?? "").toLowerCase();
}

function normalizeQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.toLowerCase() : undefined;
}

function containsNode(group: JsonCanvasNode, node: JsonCanvasNode): boolean {
  return (
    group.type === "group" &&
    node.id !== group.id &&
    node.x >= group.x &&
    node.y >= group.y &&
    node.x + node.width <= group.x + group.width &&
    node.y + node.height <= group.y + group.height
  );
}

function nodeSortText(node: JsonCanvasNode): string {
  return searchableNodeText(node) || node.id;
}

function assignDefined(target: object, field: string, value: unknown): void {
  if (value !== undefined) {
    Reflect.set(target, field, value);
  }
}

function assignNullable(target: object, field: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (value === null) {
    Reflect.deleteProperty(target, field);
  } else {
    Reflect.set(target, field, value);
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }
  return value;
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
