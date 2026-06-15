import type { CanvasObjectDetail, CanvasObjectSummary } from "../../core/scene.js";
import type { JsonCanvasDocument, JsonCanvasEdge, JsonCanvasNode } from "./model.js";

export function listJsonCanvasObjects(
  document: JsonCanvasDocument,
  type?: string,
): CanvasObjectSummary[] {
  return [...nodes(document).map(summarizeNode), ...edges(document).map(summarizeEdge)].filter(
    (object) => !type || object.type === type || object.pluginType === type || object.kind === type,
  );
}

export function getJsonCanvasObject(
  document: JsonCanvasDocument,
  id: string,
): CanvasObjectDetail | undefined {
  const node = nodes(document).find((candidate) => candidate.id === id);
  if (node) {
    return {
      ...summarizeNode(node),
      raw: node,
      references: {
        incomingEdgeIds: edges(document)
          .filter((edge) => edge.toNode === node.id)
          .map((edge) => edge.id),
        outgoingEdgeIds: edges(document)
          .filter((edge) => edge.fromNode === node.id)
          .map((edge) => edge.id),
        containedNodeIds:
          node.type === "group"
            ? nodes(document)
                .filter((candidate) => candidate.id !== node.id && containsNode(node, candidate))
                .map((candidate) => candidate.id)
            : undefined,
      },
    };
  }

  const edge = edges(document).find((candidate) => candidate.id === id);
  if (!edge) {
    return undefined;
  }

  return {
    ...summarizeEdge(edge),
    raw: edge,
    references: {
      sourceNodeId: edge.fromNode,
      targetNodeId: edge.toNode,
    },
  };
}

export function summarizeNode(node: JsonCanvasNode): CanvasObjectSummary {
  return {
    id: node.id,
    type: node.type,
    pluginType: `jsoncanvas.${node.type}`,
    kind: node.type === "group" ? "group" : "node",
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    text: nodeText(node),
    label: nodeLabel(node),
  };
}

export function summarizeEdge(edge: JsonCanvasEdge): CanvasObjectSummary {
  return {
    id: edge.id,
    type: "edge",
    pluginType: "jsoncanvas.edge",
    kind: "edge",
    text: edge.label ?? `${edge.fromNode} -> ${edge.toNode}`,
    label: edge.label,
  };
}

export function nodeText(node: JsonCanvasNode): string | undefined {
  if (node.type === "text") {
    return firstHeading(node.text) ?? truncate(node.text);
  }
  if (node.type === "file") {
    return `${node.file}${node.subpath ?? ""}`;
  }
  if (node.type === "link") {
    try {
      const url = new URL(node.url);
      return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
    } catch {
      return node.url;
    }
  }
  return node.label;
}

function nodeLabel(node: JsonCanvasNode): string | undefined {
  return node.type === "group" ? node.label : nodeText(node);
}

function firstHeading(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"))
    ?.replace(/^#+\s*/, "");
}

function truncate(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function containsNode(group: JsonCanvasNode, node: JsonCanvasNode): boolean {
  if (group.type !== "group") {
    return false;
  }
  return (
    node.x >= group.x &&
    node.y >= group.y &&
    node.x + node.width <= group.x + group.width &&
    node.y + node.height <= group.y + group.height
  );
}

function nodes(document: JsonCanvasDocument): JsonCanvasNode[] {
  return document.nodes ?? [];
}

function edges(document: JsonCanvasDocument): JsonCanvasEdge[] {
  return document.edges ?? [];
}
