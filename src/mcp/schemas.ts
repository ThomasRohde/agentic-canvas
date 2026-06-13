import { z } from "zod";
import { isCanvasColor } from "../shared/colors.js";

export const canvasObjectTypeSchema = z.enum([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "frame",
]);

export const colorSchema = z.string().refine(isCanvasColor, {
  message: "Invalid canvas color",
});

export const styleSchema = z.object({
  strokeColor: colorSchema.optional(),
  backgroundColor: colorSchema.optional(),
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

export const pointSchema = z.array(z.number()).length(2);
export const pointsSchema = z.array(pointSchema).min(2);

export const createObjectShape = {
  type: canvasObjectTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  text: z.string().optional(),
  points: pointsSchema.optional(),
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
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  text: z.string().optional(),
  points: pointsSchema.optional(),
  style: styleSchema.optional(),
  start: endpointSchema.optional(),
  end: endpointSchema.optional(),
  containerId: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
};
