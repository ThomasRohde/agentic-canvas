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

export const updateObjectPatchShape = {
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

export const updateObjectShape = {
  id: z.string(),
  ...updateObjectPatchShape,
};

const bboxShape = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const findObjectsShape = {
  type: canvasObjectTypeSchema.optional(),
  textContains: z.string().optional(),
  textRegex: z.string().optional(),
  frameId: z.string().optional(),
  groupId: z.string().optional(),
  bbox: bboxShape.optional(),
  bboxMode: z.enum(["intersects", "contains"]).optional(),
  style: styleSchema.optional(),
  link: z.string().optional(),
  metadata: z
    .object({
      key: z.string(),
      value: metadataValueSchema.optional(),
    })
    .optional(),
  selectedOnly: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
};

const createPatchOperationSchema = z.object({
  op: z.literal("create"),
  key: z.string().optional(),
  spec: z.object(createObjectShape),
});

const updatePatchOperationSchema = z.object({
  op: z.literal("update"),
  id: z.string(),
  patch: z.object(updateObjectPatchShape),
});

const deletePatchOperationSchema = z.object({
  op: z.literal("delete"),
  ids: z.array(z.string()).min(1),
});

export const applyCanvasPatchShape = {
  operations: z
    .array(
      z.discriminatedUnion("op", [
        createPatchOperationSchema,
        updatePatchOperationSchema,
        deletePatchOperationSchema,
      ]),
    )
    .min(1),
  dryRun: z.boolean().optional(),
  returnObjects: z.boolean().optional(),
};

export const findObjectsSchema = z.object(findObjectsShape);
export const applyCanvasPatchSchema = z.object(applyCanvasPatchShape);

export type FindObjectsInput = z.infer<typeof findObjectsSchema>;
export type ApplyCanvasPatchInput = z.infer<typeof applyCanvasPatchSchema>;
