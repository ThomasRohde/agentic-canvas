import nodePath from "node:path";
import type { FlowDocument, FlowEdge, FlowNode, FlowPort, FlowSettings } from "./model.js";
import { FLOW_EXTENSION } from "./model.js";
import {
  FlowValidationError,
  type FlowValidationOptions,
  validateFlowDocument,
} from "./validation.js";

export interface FlowDeserializeResult {
  document: FlowDocument;
  warnings: ReturnType<typeof validateFlowDocument>["warnings"];
}

export function serializeFlowDocument(document: FlowDocument): string {
  return `${JSON.stringify(sortFlowDocument(document), null, 2)}\n`;
}

export function deserializeFlowDocument(
  raw: string,
  options: FlowValidationOptions = {},
): FlowDeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new FlowValidationError([
      {
        severity: "error",
        code: "json.invalid",
        message: error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON",
        objectKind: "document",
      },
    ]);
  }

  const result = validateFlowDocument(parsed, options);
  if (!result.valid) {
    throw new FlowValidationError(result.errors);
  }
  return { document: result.document, warnings: result.warnings };
}

export function normalizeFlowPath(userPath: string): string {
  const extension = nodePath.extname(userPath);
  if (!extension) {
    return `${userPath}${FLOW_EXTENSION}`;
  }
  if (extension.toLowerCase() !== FLOW_EXTENSION) {
    throw new Error(`Expected ${FLOW_EXTENSION} file path, got: ${userPath}`);
  }

  return userPath;
}

export function sortFlowDocument(document: FlowDocument): FlowDocument {
  return stripUndefined({
    type: document.type,
    version: document.version,
    settings: document.settings ? sortSettings(document.settings) : undefined,
    nodes: document.nodes.map(sortNode),
    edges: document.edges.map(sortEdge),
  });
}

function sortSettings(settings: FlowSettings): FlowSettings {
  return stripUndefined({
    direction: settings.direction,
    acyclic: settings.acyclic,
    domain: settings.domain,
    allowedNodeTypes: settings.allowedNodeTypes,
    allowedEdgeTypes: settings.allowedEdgeTypes,
    strictValidation: settings.strictValidation,
  });
}

function sortNode(node: FlowNode): FlowNode {
  return stripUndefined({
    id: node.id,
    type: node.type,
    label: node.label,
    description: node.description,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    status: node.status,
    owner: node.owner,
    system: node.system,
    tags: node.tags,
    ports: node.ports?.map(sortPort),
    parentId: node.parentId,
    metadata: node.metadata,
  });
}

function sortPort(port: FlowPort): FlowPort {
  return stripUndefined({
    id: port.id,
    label: port.label,
    direction: port.direction,
    side: port.side,
    protocol: port.protocol,
    dataType: port.dataType,
    required: port.required,
    metadata: port.metadata,
  });
}

function sortEdge(edge: FlowEdge): FlowEdge {
  return stripUndefined({
    id: edge.id,
    type: edge.type,
    source: edge.source,
    target: edge.target,
    sourcePort: edge.sourcePort,
    targetPort: edge.targetPort,
    label: edge.label,
    description: edge.description,
    status: edge.status,
    direction: edge.direction,
    tags: edge.tags,
    metadata: edge.metadata,
  });
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
