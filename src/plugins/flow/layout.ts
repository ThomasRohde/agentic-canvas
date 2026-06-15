import type { FlowDocument, FlowNode } from "./model.js";
import { FLOW_LAYOUT_DEFAULTS, FLOW_NODE_DEFAULTS, flowNodeBounds } from "./model.js";

export interface FlowLayoutOptions {
  direction?: "LR" | "TB";
  layerSpacing?: number;
  nodeSpacing?: number;
  preserveManualGroups?: boolean;
  includeOrphans?: boolean;
}

export interface FlowLayoutResult {
  movedIds: string[];
  moved: Array<{
    id: string;
    oldBounds: { x: number; y: number; width: number; height: number };
    newBounds: { x: number; y: number; width: number; height: number };
  }>;
}

const NODE_TYPE_PRIORITY = [
  "actor",
  "external",
  "system",
  "service",
  "process",
  "decision",
  "queue",
  "topic",
  "database",
  "control",
  "risk",
  "note",
  "generic",
  "boundary",
];

export function layoutFlowDocument(
  document: FlowDocument,
  options: FlowLayoutOptions = {},
): FlowLayoutResult {
  const direction = options.direction ?? document.settings?.direction ?? "LR";
  const layerSpacing = options.layerSpacing ?? FLOW_LAYOUT_DEFAULTS.layerSpacing;
  const nodeSpacing = options.nodeSpacing ?? FLOW_LAYOUT_DEFAULTS.nodeSpacing;
  const includeOrphans = options.includeOrphans ?? true;
  const moved: FlowLayoutResult["moved"] = [];
  const layoutNodes = document.nodes.filter((node) => node.type !== "boundary");
  const orphanIds = new Set(orphanNodes(document).map((node) => node.id));
  const layered = layerNodes(
    document,
    includeOrphans ? layoutNodes : layoutNodes.filter((node) => !orphanIds.has(node.id)),
  );
  const orphanLayer = includeOrphans ? [] : layoutNodes.filter((node) => orphanIds.has(node.id));
  const layers = orphanLayer.length > 0 ? [...layered, orphanLayer] : layered;

  for (const [layerIndex, layer] of layers.entries()) {
    const sorted = sortNodes(layer);
    for (const [nodeIndex, node] of sorted.entries()) {
      const oldBounds = flowNodeBounds(node);
      const position = positionFor(layers, layerIndex, sorted, nodeIndex, direction, {
        layerSpacing,
        nodeSpacing,
      });
      node.x = position.x;
      node.y = position.y;
      node.width = node.width ?? FLOW_NODE_DEFAULTS[node.type].width;
      node.height = node.height ?? FLOW_NODE_DEFAULTS[node.type].height;
      pushMove(moved, node.id, oldBounds, flowNodeBounds(node));
    }
  }

  resizeBoundaries(document, moved, Boolean(options.preserveManualGroups));
  return { movedIds: moved.map((item) => item.id), moved };
}

function layerNodes(document: FlowDocument, nodes: FlowNode[]): FlowNode[][] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of document.edges) {
    if (edge.type === "contains" || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const roots = sortNodes(nodes.filter((node) => (incoming.get(node.id) ?? []).length === 0));
  const seedRoots = roots.length > 0 ? roots : sortNodes(nodes).slice(0, 1);
  const layerById = new Map<string, number>();
  for (const root of seedRoots) {
    assignLayer(root.id, 0, outgoing, layerById, new Set());
  }
  for (const node of sortNodes(nodes)) {
    if (!layerById.has(node.id)) {
      layerById.set(node.id, 0);
    }
  }

  const layers: FlowNode[][] = [];
  for (const node of nodes) {
    const layer = layerById.get(node.id) ?? 0;
    layers[layer] = [...(layers[layer] ?? []), node];
  }
  return layers.filter(Boolean);
}

function assignLayer(
  nodeId: string,
  layer: number,
  outgoing: Map<string, string[]>,
  layerById: Map<string, number>,
  visiting: Set<string>,
): void {
  if (visiting.has(nodeId)) {
    return;
  }
  visiting.add(nodeId);
  layerById.set(nodeId, Math.max(layerById.get(nodeId) ?? 0, layer));
  for (const target of outgoing.get(nodeId) ?? []) {
    assignLayer(target, layer + 1, outgoing, layerById, visiting);
  }
  visiting.delete(nodeId);
}

function positionFor(
  layers: FlowNode[][],
  layerIndex: number,
  layer: FlowNode[],
  nodeIndex: number,
  direction: "LR" | "TB",
  spacing: { layerSpacing: number; nodeSpacing: number },
): { x: number; y: number } {
  if (direction === "TB") {
    return {
      x: stackStart(layer, nodeIndex, "x", spacing.nodeSpacing),
      y: layerStart(layers, layerIndex, "y", spacing.layerSpacing),
    };
  }
  return {
    x: layerStart(layers, layerIndex, "x", spacing.layerSpacing),
    y: stackStart(layer, nodeIndex, "y", spacing.nodeSpacing),
  };
}

function layerStart(
  layers: FlowNode[][],
  layerIndex: number,
  axis: "x" | "y",
  spacing: number,
): number {
  let offset = 0;
  for (let index = 0; index < layerIndex; index += 1) {
    const layer = layers[index] ?? [];
    const maxExtent = Math.max(
      0,
      ...layer.map((node) => {
        const bounds = flowNodeBounds(node);
        return axis === "x" ? bounds.width : bounds.height;
      }),
    );
    offset += maxExtent + spacing;
  }
  return offset;
}

function stackStart(
  nodes: FlowNode[],
  nodeIndex: number,
  axis: "x" | "y",
  spacing: number,
): number {
  let offset = 0;
  for (let index = 0; index < nodeIndex; index += 1) {
    const bounds = flowNodeBounds(nodes[index]);
    offset += (axis === "x" ? bounds.width : bounds.height) + spacing;
  }
  return offset;
}

function resizeBoundaries(
  document: FlowDocument,
  moved: FlowLayoutResult["moved"],
  preserveManualGroups: boolean,
): void {
  for (const boundary of document.nodes.filter((node) => node.type === "boundary")) {
    if (preserveManualGroups) {
      continue;
    }
    const children = document.nodes.filter((node) => node.parentId === boundary.id);
    if (children.length === 0) {
      continue;
    }
    const oldBounds = flowNodeBounds(boundary);
    const padding = FLOW_LAYOUT_DEFAULTS.boundaryPadding;
    const left = Math.min(...children.map((node) => flowNodeBounds(node).x));
    const top = Math.min(...children.map((node) => flowNodeBounds(node).y));
    const right = Math.max(
      ...children.map((node) => {
        const bounds = flowNodeBounds(node);
        return bounds.x + bounds.width;
      }),
    );
    const bottom = Math.max(
      ...children.map((node) => {
        const bounds = flowNodeBounds(node);
        return bounds.y + bounds.height;
      }),
    );
    boundary.x = left - padding;
    boundary.y = top - padding;
    boundary.width = right - left + padding * 2;
    boundary.height = bottom - top + padding * 2;
    pushMove(moved, boundary.id, oldBounds, flowNodeBounds(boundary));
  }
}

function orphanNodes(document: FlowDocument): FlowNode[] {
  const connected = new Set<string>();
  for (const edge of document.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return document.nodes.filter((node) => node.type !== "boundary" && !connected.has(node.id));
}

function sortNodes(nodes: FlowNode[]): FlowNode[] {
  return [...nodes].sort(
    (left, right) =>
      typePriority(left) - typePriority(right) ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id),
  );
}

function typePriority(node: FlowNode): number {
  const index = NODE_TYPE_PRIORITY.indexOf(node.type);
  return index === -1 ? NODE_TYPE_PRIORITY.length : index;
}

function pushMove(
  moved: FlowLayoutResult["moved"],
  id: string,
  oldBounds: { x: number; y: number; width: number; height: number },
  newBounds: { x: number; y: number; width: number; height: number },
): void {
  if (
    oldBounds.x !== newBounds.x ||
    oldBounds.y !== newBounds.y ||
    oldBounds.width !== newBounds.width ||
    oldBounds.height !== newBounds.height
  ) {
    moved.push({ id, oldBounds, newBounds });
  }
}
