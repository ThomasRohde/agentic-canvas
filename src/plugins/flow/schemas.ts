import { z } from "zod";
import {
  FLOW_DIRECTIONS,
  FLOW_DOCUMENT_TYPE,
  FLOW_DOCUMENT_VERSION,
  FLOW_DOMAINS,
  FLOW_EDGE_DIRECTIONS,
  FLOW_EDGE_STATUSES,
  FLOW_EDGE_TYPES,
  FLOW_NODE_DEFAULTS,
  FLOW_NODE_STATUSES,
  FLOW_NODE_TYPES,
  FLOW_PORT_DIRECTIONS,
  FLOW_PORT_SIDES,
} from "./model.js";

export const flowDirectionSchema = z.enum(FLOW_DIRECTIONS);
export const flowDomainSchema = z.enum(FLOW_DOMAINS);
export const flowNodeTypeSchema = z.enum(FLOW_NODE_TYPES);
export const flowNodeStatusSchema = z.enum(FLOW_NODE_STATUSES);
export const flowPortDirectionSchema = z.enum(FLOW_PORT_DIRECTIONS);
export const flowPortSideSchema = z.enum(FLOW_PORT_SIDES);
export const flowEdgeTypeSchema = z.enum(FLOW_EDGE_TYPES);
export const flowEdgeStatusSchema = z.enum(FLOW_EDGE_STATUSES);
export const flowEdgeDirectionSchema = z.enum(FLOW_EDGE_DIRECTIONS);

export const flowMetadataSchema = z.record(z.unknown());

export const flowPortSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    direction: flowPortDirectionSchema,
    side: flowPortSideSchema,
    protocol: z.string().min(1).optional(),
    dataType: z.string().min(1).optional(),
    required: z.boolean().optional(),
    metadata: flowMetadataSchema.optional(),
  })
  .strict();

export const flowNodeSchema = z
  .object({
    id: z.string().min(1),
    type: flowNodeTypeSchema,
    label: z.string(),
    description: z.string().optional(),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    status: flowNodeStatusSchema.optional(),
    owner: z.string().min(1).optional(),
    system: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    ports: z.array(flowPortSchema).optional(),
    parentId: z.string().min(1).optional(),
    metadata: flowMetadataSchema.optional(),
  })
  .strict();

export const flowEdgeSchema = z
  .object({
    id: z.string().min(1),
    type: flowEdgeTypeSchema,
    source: z.string().min(1),
    target: z.string().min(1),
    sourcePort: z.string().min(1).optional(),
    targetPort: z.string().min(1).optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    status: flowEdgeStatusSchema.optional(),
    direction: flowEdgeDirectionSchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
    metadata: flowMetadataSchema.optional(),
  })
  .strict();

export const flowSettingsSchema = z
  .object({
    direction: flowDirectionSchema.optional(),
    acyclic: z.boolean().optional(),
    domain: flowDomainSchema.optional(),
    allowedNodeTypes: z.array(flowNodeTypeSchema).optional(),
    allowedEdgeTypes: z.array(flowEdgeTypeSchema).optional(),
    strictValidation: z.boolean().optional(),
  })
  .strict();

export const flowDocumentSchema = z
  .object({
    type: z.literal(FLOW_DOCUMENT_TYPE),
    version: z.literal(FLOW_DOCUMENT_VERSION),
    nodes: z.array(flowNodeSchema),
    edges: z.array(flowEdgeSchema),
    settings: flowSettingsSchema.optional(),
  })
  .strict();

export const flowGeometryInput = {
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
};

export const flowNodeInputShape = {
  type: flowNodeTypeSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  ...flowGeometryInput,
  status: flowNodeStatusSchema.optional(),
  owner: z.string().optional(),
  system: z.string().optional(),
  tags: z.array(z.string()).optional(),
  parentId: z.string().optional(),
  ports: z.array(flowPortSchema).optional(),
  metadata: flowMetadataSchema.optional(),
};

export const flowPortInputShape = {
  id: z.string().min(1).optional(),
  label: z.string().optional(),
  direction: flowPortDirectionSchema,
  side: flowPortSideSchema,
  protocol: z.string().optional(),
  dataType: z.string().optional(),
  required: z.boolean().optional(),
  metadata: flowMetadataSchema.optional(),
};

export const flowEdgeInputShape = {
  source: z.string(),
  target: z.string(),
  type: flowEdgeTypeSchema.optional(),
  sourcePort: z.string().optional(),
  targetPort: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  status: flowEdgeStatusSchema.optional(),
  direction: flowEdgeDirectionSchema.optional(),
  tags: z.array(z.string()).optional(),
  metadata: flowMetadataSchema.optional(),
};

export function defaultDimensionsFor(type: keyof typeof FLOW_NODE_DEFAULTS): {
  width: number;
  height: number;
} {
  return FLOW_NODE_DEFAULTS[type];
}
