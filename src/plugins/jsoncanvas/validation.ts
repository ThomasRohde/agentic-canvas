import { randomUUID } from "node:crypto";
import type {
  JsonCanvasDocument,
  JsonCanvasEdge,
  JsonCanvasNode,
  JsonCanvasSide,
} from "./model.js";
import { JSON_CANVAS_DEFAULT_SIZE } from "./model.js";
import { isJsonCanvasColor } from "./schemas.js";

export interface JsonCanvasValidationOptions {
  repair?: boolean;
}

export interface JsonCanvasValidationResult {
  document: JsonCanvasDocument;
  warnings: string[];
}

export class JsonCanvasValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
  }
}

interface NormalizationContext {
  repair: boolean;
  issues: string[];
  warnings: string[];
  usedIds: Set<string>;
}

const NODE_TYPES = new Set(["text", "file", "link", "group"]);
const SIDES = new Set(["top", "right", "bottom", "left"]);
const ENDS = new Set(["none", "arrow"]);
const BACKGROUND_STYLES = new Set(["cover", "ratio", "repeat"]);

export function validateJsonCanvasDocument(
  input: unknown,
  options: JsonCanvasValidationOptions = {},
): JsonCanvasValidationResult {
  const repair = Boolean(options.repair);
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input) || Array.isArray(input)) {
    throw new JsonCanvasValidationError(["Top-level JSON Canvas value must be an object"]);
  }

  const nodesInput = input.nodes;
  const edgesInput = input.edges;
  if (nodesInput !== undefined && !Array.isArray(nodesInput)) {
    issues.push("nodes must be an array");
  }
  if (edgesInput !== undefined && !Array.isArray(edgesInput)) {
    issues.push("edges must be an array");
  }
  if (issues.length > 0 && !repair) {
    throw new JsonCanvasValidationError(issues);
  }

  const context: NormalizationContext = {
    repair,
    issues,
    warnings,
    usedIds: new Set<string>(),
  };

  const nodes = normalizeNodes(Array.isArray(nodesInput) ? nodesInput : [], context);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeEdges(Array.isArray(edgesInput) ? edgesInput : [], nodeIds, context);

  if (issues.length > 0 && !repair) {
    throw new JsonCanvasValidationError(issues);
  }

  return {
    document: { nodes, edges },
    warnings,
  };
}

function normalizeNodes(values: unknown[], context: NormalizationContext): JsonCanvasNode[] {
  const nodes: JsonCanvasNode[] = [];
  for (const [index, value] of values.entries()) {
    const node = normalizeNode(value, index, context);
    if (!node) {
      continue;
    }

    const nextId = reserveId(
      node.id,
      `Duplicate node id: ${node.id}`,
      node.type === "group" ? "group" : "card",
      context,
    );
    if (!nextId) {
      continue;
    }

    node.id = nextId;
    nodes.push(node);
  }
  return nodes;
}

function normalizeNode(
  value: unknown,
  index: number,
  context: NormalizationContext,
): JsonCanvasNode | undefined {
  if (!isRecord(value)) {
    return rejectOrSkip(`Node at index ${index} must be an object`, context);
  }

  const type = value.type;
  if (typeof type !== "string" || !NODE_TYPES.has(type)) {
    return rejectOrSkip(`Unsupported node type at index ${index}: ${String(type)}`, context);
  }

  const id = stringField(
    value,
    "id",
    context,
    createJsonCanvasId(type === "group" ? "group" : "card"),
  );
  const size = JSON_CANVAS_DEFAULT_SIZE[type as JsonCanvasNode["type"]];
  const base = {
    id,
    type,
    x: integerField(value, "x", context, 0),
    y: integerField(value, "y", context, 0),
    width: dimensionField(value, "width", context, size.width),
    height: dimensionField(value, "height", context, size.height),
  };
  const color = optionalString(value, "color");
  const common = color && validColorOrRepair(color, context) ? { ...base, color } : base;

  if (type === "text") {
    const text = stringField(value, "text", context, "");
    return { ...common, type, text };
  }
  if (type === "file") {
    const file = stringField(value, "file", context, "");
    const subpath = optionalString(value, "subpath");
    if (subpath && !subpath.startsWith("#")) {
      if (!context.repair) {
        context.issues.push(`File node ${id} subpath must start with #`);
      } else {
        context.warnings.push(`Removed invalid subpath from file node ${id}`);
      }
      return { ...common, type, file };
    }
    return subpath ? { ...common, type, file, subpath } : { ...common, type, file };
  }
  if (type === "link") {
    const url = stringField(value, "url", context, "");
    if (!isHttpUrl(url)) {
      if (!context.repair) {
        context.issues.push(`Link node ${id} url must use http or https`);
      } else {
        context.warnings.push(`Repaired invalid link node ${id} URL to https://example.invalid/`);
      }
    }
    return { ...common, type, url: isHttpUrl(url) ? url : "https://example.invalid/" };
  }

  const label = optionalString(value, "label");
  const background = optionalString(value, "background");
  const backgroundStyle = optionalString(value, "backgroundStyle");
  const group: JsonCanvasNode = { ...common, type: "group" };
  if (label) {
    group.label = label;
  }
  if (background) {
    group.background = background;
  }
  if (backgroundStyle) {
    if (BACKGROUND_STYLES.has(backgroundStyle)) {
      group.backgroundStyle = backgroundStyle as "cover" | "ratio" | "repeat";
    } else if (!context.repair) {
      context.issues.push(`Group node ${id} has invalid backgroundStyle`);
    } else {
      context.warnings.push(`Removed invalid backgroundStyle from group node ${id}`);
    }
  }
  return group;
}

function normalizeEdges(
  values: unknown[],
  nodeIds: Set<string>,
  context: NormalizationContext,
): JsonCanvasEdge[] {
  const edges: JsonCanvasEdge[] = [];
  const edgeIds = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!isRecord(value)) {
      rejectOrSkip(`Edge at index ${index} must be an object`, context);
      continue;
    }

    const id = stringField(value, "id", context, createJsonCanvasId("edge"));
    const fromNode = stringField(value, "fromNode", context, "");
    const toNode = stringField(value, "toNode", context, "");
    const hasDuplicateEdgeId = edgeIds.has(id);
    const hasGlobalCollision = context.usedIds.has(id);
    let nextId = id;
    if (hasDuplicateEdgeId || hasGlobalCollision) {
      const issue = hasDuplicateEdgeId ? `Duplicate edge id: ${id}` : `Duplicate id: ${id}`;
      if (!context.repair) {
        context.issues.push(issue);
      } else {
        nextId = uniqueRepairId(id, context.usedIds);
        context.warnings.push(`${issue}; reassigned to ${nextId}`);
      }
    }
    edgeIds.add(id);
    if (!nodeIds.has(fromNode) || !nodeIds.has(toNode)) {
      const issue = `Edge ${id} references missing node`;
      if (!context.repair) {
        context.issues.push(issue);
      } else {
        context.warnings.push(`${issue}; dropped`);
      }
      continue;
    }
    if ((hasDuplicateEdgeId || hasGlobalCollision) && !context.repair) {
      continue;
    }

    const edge: JsonCanvasEdge = { id: nextId, fromNode, toNode };
    context.usedIds.add(edge.id);

    assignOptionalSide(edge, "fromSide", value.fromSide, context);
    assignOptionalSide(edge, "toSide", value.toSide, context);
    assignOptionalEnd(edge, "fromEnd", value.fromEnd, context);
    assignOptionalEnd(edge, "toEnd", value.toEnd, context);
    const color = optionalString(value, "color");
    if (color && validColorOrRepair(color, context)) {
      edge.color = color;
    }
    const label = optionalString(value, "label");
    if (label) {
      edge.label = label;
    }
    edges.push(edge);
  }
  return edges;
}

function reserveId(
  id: string,
  issue: string,
  prefix: "card" | "group" | "edge",
  context: NormalizationContext,
): string | undefined {
  if (!context.usedIds.has(id)) {
    context.usedIds.add(id);
    return id;
  }
  if (!context.repair) {
    context.issues.push(issue);
    return undefined;
  }
  const nextId = uniqueRepairId(id || createJsonCanvasId(prefix), context.usedIds);
  context.usedIds.add(nextId);
  context.warnings.push(`${issue}; reassigned to ${nextId}`);
  return nextId;
}

function uniqueRepairId(id: string, usedIds: Set<string>): string {
  const base = id.trim() || "id";
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!usedIds.has(candidate)) {
      return candidate;
    }
  }
  return `${base}_${Date.now()}`;
}

function stringField(
  value: Record<string, unknown>,
  field: string,
  context: NormalizationContext,
  fallback: string,
): string {
  const candidate = value[field];
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate;
  }
  const issue = `Missing or invalid ${field}`;
  if (!context.repair) {
    context.issues.push(issue);
  } else {
    context.warnings.push(`${issue}; using ${fallback}`);
  }
  return fallback;
}

function integerField(
  value: Record<string, unknown>,
  field: string,
  context: NormalizationContext,
  fallback: number,
): number {
  const candidate = value[field];
  if (Number.isInteger(candidate)) {
    return candidate as number;
  }
  if (context.repair && typeof candidate === "number" && Number.isFinite(candidate)) {
    context.warnings.push(`Rounded ${field}`);
    return Math.round(candidate);
  }
  const issue = `Invalid integer ${field}`;
  if (!context.repair) {
    context.issues.push(issue);
  } else {
    context.warnings.push(`${issue}; using ${fallback}`);
  }
  return fallback;
}

function dimensionField(
  value: Record<string, unknown>,
  field: string,
  context: NormalizationContext,
  fallback: number,
): number {
  const next = integerField(value, field, context, fallback);
  if (next > 0) {
    return next;
  }
  const issue = `${field} must be greater than zero`;
  if (!context.repair) {
    context.issues.push(issue);
    return next;
  }
  context.warnings.push(`${issue}; using ${fallback}`);
  return fallback;
}

function optionalString(value: Record<string, unknown>, field: string): string | undefined {
  return typeof value[field] === "string" ? value[field] : undefined;
}

function validColorOrRepair(
  color: string,
  context: NormalizationContext,
): color is NonNullable<JsonCanvasEdge["color"]> {
  if (isJsonCanvasColor(color)) {
    return true;
  }
  if (!context.repair) {
    context.issues.push(`Invalid color: ${color}`);
  } else {
    context.warnings.push(`Removed invalid color: ${color}`);
  }
  return false;
}

function assignOptionalSide(
  edge: JsonCanvasEdge,
  field: "fromSide" | "toSide",
  value: unknown,
  context: NormalizationContext,
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value === "string" && SIDES.has(value)) {
    edge[field] = value as JsonCanvasSide;
  } else if (!context.repair) {
    context.issues.push(`Invalid ${field}`);
  } else {
    context.warnings.push(`Removed invalid ${field}`);
  }
}

function assignOptionalEnd(
  edge: JsonCanvasEdge,
  field: "fromEnd" | "toEnd",
  value: unknown,
  context: NormalizationContext,
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value === "string" && ENDS.has(value)) {
    edge[field] = value as "none" | "arrow";
  } else if (!context.repair) {
    context.issues.push(`Invalid ${field}`);
  } else {
    context.warnings.push(`Removed invalid ${field}`);
  }
}

function rejectOrSkip<T>(issue: string, context: NormalizationContext): T | undefined {
  if (!context.repair) {
    context.issues.push(issue);
  } else {
    context.warnings.push(`${issue}; skipped`);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function createJsonCanvasId(prefix: "card" | "group" | "edge"): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
