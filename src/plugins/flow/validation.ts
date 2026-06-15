import { randomUUID } from "node:crypto";
import {
  FLOW_DOCUMENT_TYPE,
  FLOW_DOCUMENT_VERSION,
  FLOW_EDGE_TYPES,
  FLOW_NODE_DEFAULTS,
  FLOW_NODE_TYPES,
  FLOW_PORT_DIRECTIONS,
  FLOW_PORT_SIDES,
  type FlowDocument,
  type FlowEdge,
  type FlowEdgeType,
  type FlowNode,
  type FlowNodeType,
  type FlowPort,
} from "./model.js";
import { flowDocumentSchema } from "./schemas.js";

export interface FlowValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  objectId?: string;
  objectKind?: "node" | "edge" | "port" | "document";
}

export interface FlowValidationOptions {
  repair?: boolean;
  mode?: "basic" | "strict";
  domainRules?: boolean;
}

export interface FlowValidationResult {
  document: FlowDocument;
  valid: boolean;
  errors: FlowValidationIssue[];
  warnings: FlowValidationIssue[];
}

export class FlowValidationError extends Error {
  constructor(readonly issues: FlowValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
  }
}

interface ValidationContext {
  repair: boolean;
  mode: "basic" | "strict";
  domainRules: boolean;
  errors: FlowValidationIssue[];
  warnings: FlowValidationIssue[];
}

const NODE_TYPES = new Set<string>(FLOW_NODE_TYPES);
const EDGE_TYPES = new Set<string>(FLOW_EDGE_TYPES);
const PORT_DIRECTIONS = new Set<string>(FLOW_PORT_DIRECTIONS);
const PORT_SIDES = new Set<string>(FLOW_PORT_SIDES);

export function validateFlowDocument(
  input: unknown,
  options: FlowValidationOptions = {},
): FlowValidationResult {
  const context: ValidationContext = {
    repair: Boolean(options.repair),
    mode: options.mode ?? "basic",
    domainRules: Boolean(options.domainRules),
    errors: [],
    warnings: [],
  };
  const document = normalizeDocument(input, context);
  validateReferences(document, context);
  validateGraphRules(document, context);

  const schemaResult = flowDocumentSchema.safeParse(document);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      addError(context, "schema.invalid", issue.message, {
        objectKind: "document",
      });
    }
  }

  return {
    document,
    valid: context.errors.length === 0,
    errors: context.errors,
    warnings: context.warnings,
  };
}

export function assertValidFlowDocument(
  input: unknown,
  options: FlowValidationOptions = {},
): FlowValidationResult {
  const result = validateFlowDocument(input, options);
  if (!result.valid) {
    throw new FlowValidationError(result.errors);
  }
  return result;
}

export function createFlowId(prefix: "node" | "edge" | "port"): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function normalizeDocument(input: unknown, context: ValidationContext): FlowDocument {
  if (!isRecord(input) || Array.isArray(input)) {
    addError(context, "document.type", "Top-level Flow value must be an object", {
      objectKind: "document",
    });
    return emptyDocument();
  }

  if (input.type !== FLOW_DOCUMENT_TYPE) {
    addError(context, "document.type", `Flow document type must be ${FLOW_DOCUMENT_TYPE}`, {
      objectKind: "document",
    });
  }
  if (input.version !== FLOW_DOCUMENT_VERSION) {
    addError(
      context,
      "document.version",
      `Flow document version must be ${FLOW_DOCUMENT_VERSION}`,
      {
        objectKind: "document",
      },
    );
  }

  const settings = normalizeSettings(input.settings, context);
  const nodes = normalizeNodes(input.nodes, context);
  const edges = normalizeEdges(input.edges, nodes, context);
  return stripUndefined({
    type: FLOW_DOCUMENT_TYPE,
    version: FLOW_DOCUMENT_VERSION,
    settings,
    nodes,
    edges,
  });
}

function normalizeSettings(value: unknown, context: ValidationContext): FlowDocument["settings"] {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || Array.isArray(value)) {
    addError(context, "settings.invalid", "Flow settings must be an object", {
      objectKind: "document",
    });
    return undefined;
  }

  const settings: FlowDocument["settings"] = {};
  assignEnum(settings, "direction", value.direction, ["LR", "TB"], context);
  assignEnum(
    settings,
    "domain",
    value.domain,
    ["architecture", "workflow", "data-lineage", "risk-control", "generic"],
    context,
  );
  if (typeof value.acyclic === "boolean") {
    settings.acyclic = value.acyclic;
  }
  if (typeof value.strictValidation === "boolean") {
    settings.strictValidation = value.strictValidation;
  }
  if (Array.isArray(value.allowedNodeTypes)) {
    const allowed = value.allowedNodeTypes.filter(
      (item): item is FlowNodeType => typeof item === "string" && NODE_TYPES.has(item),
    );
    if (allowed.length !== value.allowedNodeTypes.length) {
      addError(context, "settings.allowedNodeTypes", "allowedNodeTypes contains invalid values", {
        objectKind: "document",
      });
    }
    settings.allowedNodeTypes = allowed;
  }
  if (Array.isArray(value.allowedEdgeTypes)) {
    const allowed = value.allowedEdgeTypes.filter(
      (item): item is FlowEdgeType => typeof item === "string" && EDGE_TYPES.has(item),
    );
    if (allowed.length !== value.allowedEdgeTypes.length) {
      addError(context, "settings.allowedEdgeTypes", "allowedEdgeTypes contains invalid values", {
        objectKind: "document",
      });
    }
    settings.allowedEdgeTypes = allowed;
  }
  return Object.keys(settings).length > 0 ? settings : undefined;
}

function normalizeNodes(value: unknown, context: ValidationContext): FlowNode[] {
  if (value === undefined && context.repair) {
    addWarning(context, "nodes.defaulted", "Missing nodes array; using empty array", {
      objectKind: "document",
    });
    return [];
  }
  if (!Array.isArray(value)) {
    addError(context, "nodes.invalid", "nodes must be an array", { objectKind: "document" });
    return [];
  }

  const nodes: FlowNode[] = [];
  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    const node = normalizeNode(item, index, context);
    if (!node) {
      continue;
    }
    if (ids.has(node.id)) {
      addError(context, "node.duplicateId", `Duplicate node id: ${node.id}`, {
        objectId: node.id,
        objectKind: "node",
      });
      continue;
    }
    ids.add(node.id);
    nodes.push(node);
  }
  return nodes;
}

function normalizeNode(
  value: unknown,
  index: number,
  context: ValidationContext,
): FlowNode | undefined {
  if (!isRecord(value)) {
    addError(context, "node.invalid", `Node at index ${index} must be an object`, {
      objectKind: "node",
    });
    return undefined;
  }

  const id = requiredString(value.id, `Node at index ${index} is missing id`, context, "node");
  const type = enumValue(
    value.type,
    NODE_TYPES,
    "generic",
    `Node ${id} has invalid type`,
    context,
    {
      objectId: id,
      objectKind: "node",
    },
  ) as FlowNodeType;
  if (!id) {
    return undefined;
  }
  const defaults = FLOW_NODE_DEFAULTS[type];
  const node: FlowNode = {
    id,
    type,
    label: typeof value.label === "string" ? value.label : "",
    x: integerValue(value.x, 0, `Node ${id} has invalid x`, context, {
      objectId: id,
      objectKind: "node",
    }),
    y: integerValue(value.y, 0, `Node ${id} has invalid y`, context, {
      objectId: id,
      objectKind: "node",
    }),
    width: dimensionValue(value.width, defaults.width, `Node ${id} has invalid width`, context, {
      objectId: id,
      objectKind: "node",
    }),
    height: dimensionValue(
      value.height,
      defaults.height,
      `Node ${id} has invalid height`,
      context,
      {
        objectId: id,
        objectKind: "node",
      },
    ),
  };
  if (typeof value.label !== "string") {
    addError(context, "node.label", `Node ${id} label must be a string`, {
      objectId: id,
      objectKind: "node",
    });
  } else if (value.label.trim().length === 0) {
    addWarning(context, "node.label.empty", `Node ${id} has no label`, {
      objectId: id,
      objectKind: "node",
    });
  }

  assignString(node, "description", value.description);
  assignEnum(
    node,
    "status",
    value.status,
    ["unknown", "proposed", "active", "deprecated", "retired", "at-risk"],
    context,
    { objectId: id, objectKind: "node" },
  );
  assignString(node, "owner", value.owner);
  assignString(node, "system", value.system);
  assignStringArray(node, "tags", value.tags, context, { objectId: id, objectKind: "node" });
  assignString(node, "parentId", value.parentId);
  assignMetadata(node, value.metadata, context, { objectId: id, objectKind: "node" });
  if (Array.isArray(value.ports)) {
    node.ports = normalizePorts(value.ports, id, context);
  }
  return stripUndefined(node);
}

function normalizePorts(value: unknown[], nodeId: string, context: ValidationContext): FlowPort[] {
  const ports: FlowPort[] = [];
  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      addError(
        context,
        "port.invalid",
        `Port at index ${index} on node ${nodeId} must be an object`,
        {
          objectId: nodeId,
          objectKind: "port",
        },
      );
      continue;
    }
    const id = requiredString(
      item.id,
      `Port at index ${index} on node ${nodeId} is missing id`,
      context,
      "port",
    );
    if (!id) {
      continue;
    }
    if (ids.has(id)) {
      addError(context, "port.duplicateId", `Duplicate port id on node ${nodeId}: ${id}`, {
        objectId: `${nodeId}#${id}`,
        objectKind: "port",
      });
      continue;
    }
    ids.add(id);
    const port: FlowPort = {
      id,
      direction: enumValue(
        item.direction,
        PORT_DIRECTIONS,
        "both",
        `Port ${nodeId}#${id} has invalid direction`,
        context,
        { objectId: `${nodeId}#${id}`, objectKind: "port" },
      ) as FlowPort["direction"],
      side: enumValue(
        item.side,
        PORT_SIDES,
        "right",
        `Port ${nodeId}#${id} has invalid side`,
        context,
        {
          objectId: `${nodeId}#${id}`,
          objectKind: "port",
        },
      ) as FlowPort["side"],
    };
    assignString(port, "label", item.label);
    assignString(port, "protocol", item.protocol);
    assignString(port, "dataType", item.dataType);
    if (typeof item.required === "boolean") {
      port.required = item.required;
    }
    assignMetadata(port, item.metadata, context, {
      objectId: `${nodeId}#${id}`,
      objectKind: "port",
    });
    ports.push(stripUndefined(port));
  }
  return ports;
}

function normalizeEdges(value: unknown, nodes: FlowNode[], context: ValidationContext): FlowEdge[] {
  if (value === undefined && context.repair) {
    addWarning(context, "edges.defaulted", "Missing edges array; using empty array", {
      objectKind: "document",
    });
    return [];
  }
  if (!Array.isArray(value)) {
    addError(context, "edges.invalid", "edges must be an array", { objectKind: "document" });
    return [];
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeIdCollisions = new Set(nodeIds);
  const edges: FlowEdge[] = [];
  const byId = new Map<string, FlowEdge>();
  for (const [index, item] of value.entries()) {
    const edge = normalizeEdge(item, index, context);
    if (!edge) {
      continue;
    }
    if (nodeIdCollisions.has(edge.id)) {
      addError(context, "edge.duplicateId", `Duplicate id across node/edge namespace: ${edge.id}`, {
        objectId: edge.id,
        objectKind: "edge",
      });
      continue;
    }
    const existing = byId.get(edge.id);
    if (existing) {
      if (context.repair && sameEdge(existing, edge)) {
        addWarning(context, "edge.duplicateId.repaired", `Removed duplicate edge id: ${edge.id}`, {
          objectId: edge.id,
          objectKind: "edge",
        });
      } else {
        addError(context, "edge.duplicateId", `Duplicate edge id: ${edge.id}`, {
          objectId: edge.id,
          objectKind: "edge",
        });
      }
      continue;
    }
    if (context.repair && (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
      addWarning(context, "edge.dangling.repaired", `Removed dangling edge: ${edge.id}`, {
        objectId: edge.id,
        objectKind: "edge",
      });
      continue;
    }
    byId.set(edge.id, edge);
    edges.push(edge);
  }
  return edges;
}

function normalizeEdge(
  value: unknown,
  index: number,
  context: ValidationContext,
): FlowEdge | undefined {
  if (!isRecord(value)) {
    addError(context, "edge.invalid", `Edge at index ${index} must be an object`, {
      objectKind: "edge",
    });
    return undefined;
  }

  const id = requiredString(value.id, `Edge at index ${index} is missing id`, context, "edge");
  if (!id) {
    return undefined;
  }
  const edge: FlowEdge = {
    id,
    type: enumValue(value.type, EDGE_TYPES, "generic", `Edge ${id} has invalid type`, context, {
      objectId: id,
      objectKind: "edge",
    }) as FlowEdgeType,
    source: requiredString(value.source, `Edge ${id} is missing source`, context, "edge"),
    target: requiredString(value.target, `Edge ${id} is missing target`, context, "edge"),
  };
  assignString(edge, "sourcePort", value.sourcePort);
  assignString(edge, "targetPort", value.targetPort);
  assignString(edge, "label", value.label);
  if (edge.label !== undefined && edge.label.trim().length === 0) {
    edge.label = undefined;
  }
  assignString(edge, "description", value.description);
  assignEnum(
    edge,
    "status",
    value.status,
    ["unknown", "proposed", "active", "deprecated"],
    context,
    {
      objectId: id,
      objectKind: "edge",
    },
  );
  assignEnum(edge, "direction", value.direction, ["directed", "bidirectional"], context, {
    objectId: id,
    objectKind: "edge",
  });
  assignStringArray(edge, "tags", value.tags, context, { objectId: id, objectKind: "edge" });
  assignMetadata(edge, value.metadata, context, { objectId: id, objectKind: "edge" });
  return stripUndefined(edge);
}

function validateReferences(document: FlowDocument, context: ValidationContext): void {
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]));
  for (const edge of document.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source) {
      addError(
        context,
        "edge.source.missing",
        `Edge ${edge.id} source node is missing: ${edge.source}`,
        {
          objectId: edge.id,
          objectKind: "edge",
        },
      );
    }
    if (!target) {
      addError(
        context,
        "edge.target.missing",
        `Edge ${edge.id} target node is missing: ${edge.target}`,
        {
          objectId: edge.id,
          objectKind: "edge",
        },
      );
    }
    if (source && edge.sourcePort) {
      const port = findPort(source, edge.sourcePort);
      if (!port) {
        if (context.repair) {
          addWarning(
            context,
            "edge.sourcePort.repaired",
            `Removed missing sourcePort on edge ${edge.id}`,
            {
              objectId: edge.id,
              objectKind: "edge",
            },
          );
          edge.sourcePort = undefined;
        } else {
          addError(
            context,
            "edge.sourcePort.missing",
            `Edge ${edge.id} source port is missing: ${edge.sourcePort}`,
            {
              objectId: edge.id,
              objectKind: "edge",
            },
          );
        }
      } else if (port.direction === "in") {
        addError(
          context,
          "edge.sourcePort.direction",
          `Edge ${edge.id} source port cannot be in-only`,
          {
            objectId: edge.id,
            objectKind: "edge",
          },
        );
      }
    }
    if (target && edge.targetPort) {
      const port = findPort(target, edge.targetPort);
      if (!port) {
        if (context.repair) {
          addWarning(
            context,
            "edge.targetPort.repaired",
            `Removed missing targetPort on edge ${edge.id}`,
            {
              objectId: edge.id,
              objectKind: "edge",
            },
          );
          edge.targetPort = undefined;
        } else {
          addError(
            context,
            "edge.targetPort.missing",
            `Edge ${edge.id} target port is missing: ${edge.targetPort}`,
            {
              objectId: edge.id,
              objectKind: "edge",
            },
          );
        }
      } else if (port.direction === "out") {
        addError(
          context,
          "edge.targetPort.direction",
          `Edge ${edge.id} target port cannot be out-only`,
          {
            objectId: edge.id,
            objectKind: "edge",
          },
        );
      }
    }
  }

  for (const node of document.nodes) {
    if (!node.parentId) {
      continue;
    }
    const parent = nodesById.get(node.parentId);
    if (!parent) {
      addError(
        context,
        "node.parent.missing",
        `Node ${node.id} parent is missing: ${node.parentId}`,
        {
          objectId: node.id,
          objectKind: "node",
        },
      );
    } else if (parent.type !== "boundary") {
      addError(context, "node.parent.notBoundary", `Node ${node.id} parent is not a boundary`, {
        objectId: node.id,
        objectKind: "node",
      });
    }
  }
  for (const node of document.nodes) {
    if (hasParentCycle(node.id, nodesById)) {
      addError(context, "node.parent.cycle", `Node ${node.id} is part of a parent cycle`, {
        objectId: node.id,
        objectKind: "node",
      });
    }
  }
}

function validateGraphRules(document: FlowDocument, context: ValidationContext): void {
  const incoming = new Map<string, FlowEdge[]>();
  const outgoing = new Map<string, FlowEdge[]>();
  for (const edge of document.edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    if (edge.direction === "bidirectional") {
      incoming.set(edge.source, [...(incoming.get(edge.source) ?? []), edge]);
      outgoing.set(edge.target, [...(outgoing.get(edge.target) ?? []), edge]);
    }
    if (!edge.label) {
      addWarning(context, "edge.label.empty", `Edge ${edge.id} has no label`, {
        objectId: edge.id,
        objectKind: "edge",
      });
    }
  }

  validateContainment(document, context);

  for (const node of document.nodes) {
    if ((incoming.get(node.id) ?? []).length === 0 && (outgoing.get(node.id) ?? []).length === 0) {
      addWarning(context, "node.orphan", `Node ${node.id} is orphaned`, {
        objectId: node.id,
        objectKind: "node",
      });
    }
    if (node.type === "boundary") {
      const childCount = document.nodes.filter(
        (candidate) => candidate.parentId === node.id,
      ).length;
      if (childCount === 0) {
        addWarning(context, "boundary.empty", `Boundary node ${node.id} has no children`, {
          objectId: node.id,
          objectKind: "node",
        });
      }
    }
    if (node.status === "deprecated") {
      const activeIncoming = (incoming.get(node.id) ?? []).filter(
        (edge) => edge.status === "active",
      );
      if (activeIncoming.length > 0) {
        addWarning(
          context,
          "node.deprecated.activeIncoming",
          `Deprecated node ${node.id} has active incoming edges`,
          {
            objectId: node.id,
            objectKind: "node",
          },
        );
      }
    }
    if (node.status === "at-risk" && downstreamCount(node.id, outgoing) >= 5) {
      addWarning(
        context,
        "node.atRisk.downstream",
        `At-risk node ${node.id} has many downstream dependents`,
        {
          objectId: node.id,
          objectKind: "node",
        },
      );
    }
  }

  const strict = context.mode === "strict" || document.settings?.strictValidation === true;
  const domainRules = context.domainRules;
  if (!strict && !domainRules && document.settings?.acyclic !== true) {
    return;
  }

  if ((strict || document.settings?.acyclic) && findCycle(document)) {
    addError(context, "graph.cyclic", "Graph is cyclic", {
      objectKind: "document",
    });
  }
  if (strict || domainRules) {
    validateDomainRules(document, incoming, outgoing, context);
  }
  if (!strict) {
    return;
  }
  const allowedNodeTypes = document.settings?.allowedNodeTypes
    ? new Set(document.settings.allowedNodeTypes)
    : undefined;
  const allowedEdgeTypes = document.settings?.allowedEdgeTypes
    ? new Set(document.settings.allowedEdgeTypes)
    : undefined;
  for (const node of document.nodes) {
    if (allowedNodeTypes && !allowedNodeTypes.has(node.type)) {
      addError(
        context,
        "node.type.notAllowed",
        `Node ${node.id} type is not allowed: ${node.type}`,
        {
          objectId: node.id,
          objectKind: "node",
        },
      );
    }
    if (
      node.type === "risk" &&
      !hasEdgeType(node.id, ["mitigates", "causes"], incoming, outgoing)
    ) {
      addWarning(context, "risk.unlinked", `Risk node ${node.id} has no mitigates or causes edge`, {
        objectId: node.id,
        objectKind: "node",
      });
    }
    if (
      node.type === "control" &&
      !hasEdgeType(node.id, ["mitigates", "controls"], incoming, outgoing)
    ) {
      addWarning(
        context,
        "control.unlinked",
        `Control node ${node.id} has no mitigates or controls edge`,
        {
          objectId: node.id,
          objectKind: "node",
        },
      );
    }
  }
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]));
  for (const edge of document.edges) {
    if (allowedEdgeTypes && !allowedEdgeTypes.has(edge.type)) {
      addError(
        context,
        "edge.type.notAllowed",
        `Edge ${edge.id} type is not allowed: ${edge.type}`,
        {
          objectId: edge.id,
          objectKind: "edge",
        },
      );
    }
    const source = nodesById.get(edge.source);
    if (edge.type === "writes" && nodesById.get(edge.target)?.type === "external") {
      addWarning(
        context,
        "external.writes.incoming",
        `External node ${edge.target} has incoming writes edge`,
        {
          objectId: edge.id,
          objectKind: "edge",
        },
      );
    }
    if (source?.type === "database" && edge.type === "calls") {
      addWarning(
        context,
        "database.calls.outgoing",
        `Database node ${source.id} has outgoing calls edge`,
        {
          objectId: edge.id,
          objectKind: "edge",
        },
      );
    }
    if ((source?.type === "queue" || source?.type === "topic") && edge.type === "calls") {
      addWarning(
        context,
        "async.calls",
        `Queue/topic node ${source.id} has synchronous calls edge`,
        {
          objectId: edge.id,
          objectKind: "edge",
        },
      );
    }
  }
}

function validateDomainRules(
  document: FlowDocument,
  incoming: Map<string, FlowEdge[]>,
  outgoing: Map<string, FlowEdge[]>,
  context: ValidationContext,
): void {
  for (const edge of document.edges) {
    if (edge.source === edge.target && edge.type !== "contains") {
      addError(context, "edge.selfLoop", `Edge ${edge.id} is a self-loop`, {
        objectId: edge.id,
        objectKind: "edge",
      });
    }
  }
  for (const node of document.nodes) {
    for (const port of node.ports ?? []) {
      if (!port.required) {
        continue;
      }
      const connectedIncoming = portConnectedIncoming(node.id, port.id, incoming);
      const connectedOutgoing = portConnectedOutgoing(node.id, port.id, outgoing);
      const connected =
        port.direction === "in"
          ? connectedIncoming
          : port.direction === "out"
            ? connectedOutgoing
            : connectedIncoming || connectedOutgoing;
      if (!connected) {
        addError(
          context,
          "port.required.unconnected",
          `Required port ${node.id}#${port.id} is not connected`,
          {
            objectId: `${node.id}#${port.id}`,
            objectKind: "port",
          },
        );
      }
    }
    if (
      node.type === "decision" &&
      (incoming.get(node.id) ?? []).length === 0 &&
      (outgoing.get(node.id) ?? []).length === 0
    ) {
      addError(context, "decision.orphan", `Decision node ${node.id} is orphaned`, {
        objectId: node.id,
        objectKind: "node",
      });
    }
  }
}

function validateContainment(document: FlowDocument, context: ValidationContext): void {
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]));
  const strict =
    context.mode === "strict" ||
    context.domainRules ||
    document.settings?.strictValidation === true;
  for (const edge of document.edges.filter((candidate) => candidate.type === "contains")) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      continue;
    }
    if (source.type !== "boundary") {
      containmentIssue(
        context,
        strict,
        "contains.source.notBoundary",
        `Contains edge ${edge.id} source is not a boundary: ${edge.source}`,
        edge.id,
      );
      continue;
    }
    if (target.parentId !== edge.source) {
      if (context.repair) {
        addWarning(
          context,
          "contains.parent.repaired",
          `Updated node ${target.id} parentId to match contains edge ${edge.id}`,
          {
            objectId: edge.id,
            objectKind: "edge",
          },
        );
        target.parentId = edge.source;
        continue;
      }
      containmentIssue(
        context,
        strict,
        "contains.parent.mismatch",
        target.parentId
          ? `Contains edge ${edge.id} conflicts with node ${target.id} parentId: ${target.parentId}`
          : `Contains edge ${edge.id} is not mirrored by node ${target.id} parentId`,
        edge.id,
      );
    }
  }
}

function containmentIssue(
  context: ValidationContext,
  strict: boolean,
  code: string,
  message: string,
  objectId: string,
): void {
  const issue = { objectId, objectKind: "edge" as const };
  if (strict) {
    addError(context, code, message, issue);
  } else {
    addWarning(context, code, message, issue);
  }
}

function portConnectedIncoming(
  nodeId: string,
  portId: string,
  incoming: Map<string, FlowEdge[]>,
): boolean {
  return (incoming.get(nodeId) ?? []).some(
    (edge) =>
      (edge.target === nodeId && edge.targetPort === portId) ||
      (edge.direction === "bidirectional" && edge.source === nodeId && edge.sourcePort === portId),
  );
}

function portConnectedOutgoing(
  nodeId: string,
  portId: string,
  outgoing: Map<string, FlowEdge[]>,
): boolean {
  return (outgoing.get(nodeId) ?? []).some(
    (edge) =>
      (edge.source === nodeId && edge.sourcePort === portId) ||
      (edge.direction === "bidirectional" && edge.target === nodeId && edge.targetPort === portId),
  );
}

function emptyDocument(): FlowDocument {
  return { type: FLOW_DOCUMENT_TYPE, version: FLOW_DOCUMENT_VERSION, nodes: [], edges: [] };
}

function findPort(node: FlowNode, portId: string): FlowPort | undefined {
  return (node.ports ?? []).find((port) => port.id === portId);
}

function hasParentCycle(nodeId: string, nodesById: Map<string, FlowNode>): boolean {
  const seen = new Set<string>();
  let current = nodesById.get(nodeId);
  while (current?.parentId) {
    if (seen.has(current.id)) {
      return true;
    }
    seen.add(current.id);
    current = nodesById.get(current.parentId);
  }
  return false;
}

function findCycle(document: FlowDocument): boolean {
  const outgoing = new Map<string, FlowEdge[]>();
  for (const edge of document.edges.filter((candidate) => candidate.type !== "contains")) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }
    visiting.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (visit(edge.target)) {
        return true;
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return document.nodes.some((node) => visit(node.id));
}

function downstreamCount(nodeId: string, outgoing: Map<string, FlowEdge[]>): number {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    for (const edge of outgoing.get(next) ?? []) {
      const target = edge.source === next ? edge.target : edge.source;
      if (!visited.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
  }
  return visited.size;
}

function hasEdgeType(
  nodeId: string,
  types: string[],
  incoming: Map<string, FlowEdge[]>,
  outgoing: Map<string, FlowEdge[]>,
): boolean {
  const allowed = new Set(types);
  return [...(incoming.get(nodeId) ?? []), ...(outgoing.get(nodeId) ?? [])].some((edge) =>
    allowed.has(edge.type),
  );
}

function sameEdge(left: FlowEdge, right: FlowEdge): boolean {
  return JSON.stringify(sortKeys(left)) === JSON.stringify(sortKeys(right));
}

function requiredString(
  value: unknown,
  message: string,
  context: ValidationContext,
  objectKind: FlowValidationIssue["objectKind"],
): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  addError(context, `${objectKind}.requiredString`, message, { objectKind });
  return "";
}

function enumValue(
  value: unknown,
  allowed: Set<string>,
  fallback: string,
  message: string,
  context: ValidationContext,
  issue: Partial<FlowValidationIssue>,
): string {
  if (typeof value === "string" && allowed.has(value)) {
    return value;
  }
  if (context.repair) {
    addWarning(context, "enum.repaired", `${message}; using ${fallback}`, issue);
    return fallback;
  }
  addError(context, "enum.invalid", message, issue);
  return fallback;
}

function integerValue(
  value: unknown,
  fallback: number,
  message: string,
  context: ValidationContext,
  issue: Partial<FlowValidationIssue>,
): number {
  if (Number.isInteger(value)) {
    return value as number;
  }
  if (context.repair && typeof value === "number" && Number.isFinite(value)) {
    addWarning(context, "integer.rounded", `${message}; rounded`, issue);
    return Math.round(value);
  }
  if (context.repair && value === undefined) {
    addWarning(context, "integer.defaulted", `${message}; using ${fallback}`, issue);
    return fallback;
  }
  addError(context, "integer.invalid", message, issue);
  return fallback;
}

function dimensionValue(
  value: unknown,
  fallback: number,
  message: string,
  context: ValidationContext,
  issue: Partial<FlowValidationIssue>,
): number {
  if (Number.isInteger(value) && (value as number) > 0) {
    return value as number;
  }
  if (context.repair || value === undefined) {
    if (value !== undefined) {
      addWarning(context, "dimension.defaulted", `${message}; using ${fallback}`, issue);
    }
    return fallback;
  }
  addError(context, "dimension.invalid", message, issue);
  return fallback;
}

function assignString<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: unknown,
): void {
  if (typeof value === "string" && value.trim().length > 0) {
    target[key] = value as T[K];
  }
}

function assignEnum<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: unknown,
  allowed: readonly string[],
  context: ValidationContext,
  issue: Partial<FlowValidationIssue> = { objectKind: "document" },
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value === "string" && allowed.includes(value)) {
    target[key] = value as T[K];
  } else {
    addError(context, `${String(key)}.invalid`, `Invalid ${String(key)}: ${String(value)}`, issue);
  }
}

function assignStringArray<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: unknown,
  context: ValidationContext,
  issue: Partial<FlowValidationIssue>,
): void {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    target[key] = value as T[K];
  } else {
    addError(
      context,
      `${String(key)}.invalid`,
      `${String(key)} must be an array of strings`,
      issue,
    );
  }
}

function assignMetadata<T extends object>(
  target: T & { metadata?: Record<string, unknown> },
  value: unknown,
  context: ValidationContext,
  issue: Partial<FlowValidationIssue>,
): void {
  if (value === undefined) {
    return;
  }
  if (isRecord(value) && !Array.isArray(value)) {
    target.metadata = value;
  } else {
    addError(context, "metadata.invalid", "metadata must be an object", issue);
  }
}

function addError(
  context: ValidationContext,
  code: string,
  message: string,
  issue: Partial<FlowValidationIssue> = {},
): void {
  context.errors.push({ severity: "error", code, message, ...issue });
}

function addWarning(
  context: ValidationContext,
  code: string,
  message: string,
  issue: Partial<FlowValidationIssue> = {},
): void {
  context.warnings.push({ severity: "warning", code, message, ...issue });
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
