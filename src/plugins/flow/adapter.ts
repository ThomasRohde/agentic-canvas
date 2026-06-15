import type { CanvasObjectDetail, CanvasObjectSummary } from "../../core/scene.js";
import type { FlowDocument, FlowEdge, FlowNode, FlowPort } from "./model.js";
import { flowNodeBounds } from "./model.js";

export function listFlowObjects(document: FlowDocument, type?: string): CanvasObjectSummary[] {
  return [
    ...document.nodes.map(summarizeNode),
    ...document.edges.map(summarizeEdge),
    ...document.nodes.flatMap((node) =>
      (node.ports ?? []).map((port) => summarizePort(node, port)),
    ),
  ].filter((object) => matchesType(object, type));
}

export function getFlowObject(document: FlowDocument, id: string): CanvasObjectDetail | undefined {
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node) {
    return {
      ...summarizeNode(node),
      raw: node,
      references: {
        incomingEdgeIds: document.edges
          .filter((edge) => edge.target === node.id || edge.direction === "bidirectional")
          .filter((edge) => edge.target === node.id || edge.source === node.id)
          .map((edge) => edge.id),
        outgoingEdgeIds: document.edges
          .filter((edge) => edge.source === node.id || edge.direction === "bidirectional")
          .filter((edge) => edge.source === node.id || edge.target === node.id)
          .map((edge) => edge.id),
        portIds: (node.ports ?? []).map((port) => portObjectId(node.id, port.id)),
        parentId: node.parentId,
        childNodeIds:
          node.type === "boundary"
            ? document.nodes
                .filter((candidate) => candidate.parentId === node.id)
                .map((candidate) => candidate.id)
            : undefined,
      },
    };
  }

  const edge = document.edges.find((candidate) => candidate.id === id);
  if (edge) {
    return {
      ...summarizeEdge(edge),
      raw: edge,
      references: {
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourcePortId: edge.sourcePort,
        targetPortId: edge.targetPort,
      },
    };
  }

  const portMatch = findPortByObjectId(document, id);
  if (!portMatch) {
    return undefined;
  }

  return {
    ...summarizePort(portMatch.node, portMatch.port),
    raw: portMatch.port,
    references: {
      nodeId: portMatch.node.id,
      incomingEdgeIds: document.edges
        .filter(
          (edge) => edge.target === portMatch.node.id && edge.targetPort === portMatch.port.id,
        )
        .map((edge) => edge.id),
      outgoingEdgeIds: document.edges
        .filter(
          (edge) => edge.source === portMatch.node.id && edge.sourcePort === portMatch.port.id,
        )
        .map((edge) => edge.id),
    },
  };
}

export function summarizeNode(node: FlowNode): CanvasObjectSummary {
  const bounds = flowNodeBounds(node);
  return {
    id: node.id,
    type: node.type,
    pluginType: `flow.node.${node.type}`,
    kind: node.type === "boundary" ? "group" : "node",
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    text: node.label,
    label: node.label,
  };
}

export function summarizeEdge(edge: FlowEdge): CanvasObjectSummary {
  const authoredLabel = edge.label?.trim() ? edge.label : undefined;
  return {
    id: edge.id,
    type: edge.type,
    pluginType: `flow.edge.${edge.type}`,
    kind: "edge",
    text: authoredLabel,
    label: authoredLabel,
    displayLabel: authoredLabel ?? edge.type,
  };
}

export function summarizePort(node: FlowNode, port: FlowPort): CanvasObjectSummary {
  return {
    id: portObjectId(node.id, port.id),
    type: "port",
    pluginType: "flow.port",
    kind: "port",
    text: port.label ?? port.id,
    label: port.label ?? port.id,
  };
}

export function portObjectId(nodeId: string, portId: string): string {
  return `${nodeId}#${portId}`;
}

function findPortByObjectId(
  document: FlowDocument,
  id: string,
): { node: FlowNode; port: FlowPort } | undefined {
  const [nodeId, portId] = id.split("#");
  if (!nodeId || !portId) {
    return undefined;
  }
  const node = document.nodes.find((candidate) => candidate.id === nodeId);
  const port = node?.ports?.find((candidate) => candidate.id === portId);
  return node && port ? { node, port } : undefined;
}

function matchesType(object: CanvasObjectSummary, type?: string): boolean {
  if (!type) {
    return true;
  }
  return (
    object.type === type ||
    object.pluginType === type ||
    object.kind === type ||
    (type === "node" && object.kind === "group")
  );
}
