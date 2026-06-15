export const FLOW_EXTENSION = ".flow";

export const FLOW_DOCUMENT_TYPE = "agentic-flow";
export const FLOW_DOCUMENT_VERSION = 1;

export const FLOW_DIRECTIONS = ["LR", "TB"] as const;
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

export const FLOW_DOMAINS = [
  "architecture",
  "workflow",
  "data-lineage",
  "risk-control",
  "generic",
] as const;
export type FlowDomain = (typeof FLOW_DOMAINS)[number];

export const FLOW_NODE_TYPES = [
  "system",
  "service",
  "database",
  "queue",
  "topic",
  "external",
  "actor",
  "process",
  "decision",
  "control",
  "risk",
  "boundary",
  "note",
  "generic",
] as const;
export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];

export const FLOW_NODE_STATUSES = [
  "unknown",
  "proposed",
  "active",
  "deprecated",
  "retired",
  "at-risk",
] as const;
export type FlowNodeStatus = (typeof FLOW_NODE_STATUSES)[number];

export const FLOW_PORT_DIRECTIONS = ["in", "out", "both"] as const;
export type FlowPortDirection = (typeof FLOW_PORT_DIRECTIONS)[number];

export const FLOW_PORT_SIDES = ["top", "right", "bottom", "left"] as const;
export type FlowPortSide = (typeof FLOW_PORT_SIDES)[number];

export const FLOW_EDGE_TYPES = [
  "depends_on",
  "calls",
  "publishes",
  "subscribes",
  "reads",
  "writes",
  "sends_to",
  "receives_from",
  "contains",
  "controls",
  "mitigates",
  "causes",
  "sequence",
  "fallback",
  "generic",
] as const;
export type FlowEdgeType = (typeof FLOW_EDGE_TYPES)[number];

export const FLOW_EDGE_STATUSES = ["unknown", "proposed", "active", "deprecated"] as const;
export type FlowEdgeStatus = (typeof FLOW_EDGE_STATUSES)[number];

export const FLOW_EDGE_DIRECTIONS = ["directed", "bidirectional"] as const;
export type FlowEdgeDirection = (typeof FLOW_EDGE_DIRECTIONS)[number];

export interface FlowDocument {
  type: typeof FLOW_DOCUMENT_TYPE;
  version: typeof FLOW_DOCUMENT_VERSION;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings?: FlowSettings;
}

export interface FlowSettings {
  direction?: FlowDirection;
  acyclic?: boolean;
  domain?: FlowDomain;
  allowedNodeTypes?: FlowNodeType[];
  allowedEdgeTypes?: FlowEdgeType[];
  strictValidation?: boolean;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  description?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  status?: FlowNodeStatus;
  owner?: string;
  system?: string;
  tags?: string[];
  ports?: FlowPort[];
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface FlowPort {
  id: string;
  label?: string;
  direction: FlowPortDirection;
  side: FlowPortSide;
  protocol?: string;
  dataType?: string;
  required?: boolean;
  metadata?: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  type: FlowEdgeType;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  label?: string;
  description?: string;
  status?: FlowEdgeStatus;
  direction?: FlowEdgeDirection;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface FlowAppState {
  [key: string]: unknown;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  selectedIds?: string[];
  lastSavedPath?: string;
  inspectorOpen?: boolean;
}

export const FLOW_NODE_DEFAULTS: Record<FlowNodeType, { width: number; height: number }> = {
  system: { width: 240, height: 110 },
  service: { width: 220, height: 90 },
  database: { width: 200, height: 90 },
  queue: { width: 200, height: 80 },
  topic: { width: 200, height: 80 },
  external: { width: 230, height: 100 },
  actor: { width: 180, height: 80 },
  process: { width: 220, height: 90 },
  decision: { width: 190, height: 120 },
  control: { width: 220, height: 90 },
  risk: { width: 220, height: 90 },
  boundary: { width: 560, height: 380 },
  note: { width: 260, height: 140 },
  generic: { width: 220, height: 90 },
};

export const FLOW_LAYOUT_DEFAULTS = {
  layerSpacing: 360,
  nodeSpacing: 120,
  orphanSpacing: 80,
  boundaryPadding: 80,
} as const;

export function flowNodeBounds(node: FlowNode): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const defaults = FLOW_NODE_DEFAULTS[node.type];
  return {
    x: node.x,
    y: node.y,
    width: node.width ?? defaults.width,
    height: node.height ?? defaults.height,
  };
}
