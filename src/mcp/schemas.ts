import { z } from "zod";

export const canvasObjectTypeSchema = z.enum([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "frame",
]);

export const styleSchema = z.object({
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  fillStyle: z.enum(["hachure", "cross-hatch", "solid"]).optional(),
  strokeWidth: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  roughness: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  opacity: z.number().min(0).max(100).optional(),
  fontSize: z.number().positive().optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
});

export const endpointSchema = z.union([
  z.object({ elementId: z.string() }),
  z.object({ x: z.number(), y: z.number() }),
]);

export const createObjectShape = {
  type: canvasObjectTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string().optional(),
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  style: styleSchema.optional(),
  start: endpointSchema.optional(),
  end: endpointSchema.optional(),
  containerId: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
};

export const updateObjectShape = {
  id: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string().optional(),
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  style: styleSchema.optional(),
  start: endpointSchema.optional(),
  end: endpointSchema.optional(),
  containerId: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
};
