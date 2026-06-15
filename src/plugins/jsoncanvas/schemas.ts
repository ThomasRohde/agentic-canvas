import { z } from "zod";
import type { JsonCanvasColor } from "./model.js";

export function isJsonCanvasColor(value: string): value is JsonCanvasColor {
  return /^[1-6]$/.test(value) || /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value);
}

export const jsonCanvasColorSchema = z.string().refine(isJsonCanvasColor, {
  message: "Invalid JSON Canvas color",
});

export const jsonCanvasSideSchema = z.enum(["top", "right", "bottom", "left"]);
export const jsonCanvasEndSchema = z.enum(["none", "arrow"]);
export const jsonCanvasBackgroundStyleSchema = z.enum(["cover", "ratio", "repeat"]);

const integerGeometrySchema = z.number().int();
const positiveIntegerGeometrySchema = z.number().int().positive();

const baseNodeShape = {
  id: z.string().min(1),
  x: integerGeometrySchema,
  y: integerGeometrySchema,
  width: positiveIntegerGeometrySchema,
  height: positiveIntegerGeometrySchema,
  color: jsonCanvasColorSchema.optional(),
};

export const jsonCanvasTextNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal("text"),
    text: z.string(),
  })
  .passthrough();

export const jsonCanvasFileNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal("file"),
    file: z.string().min(1),
    subpath: z.string().startsWith("#").optional(),
  })
  .passthrough();

export const jsonCanvasLinkNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal("link"),
    url: z
      .string()
      .url()
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
        message: "Link URLs must use http or https",
      }),
  })
  .passthrough();

export const jsonCanvasGroupNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal("group"),
    label: z.string().optional(),
    background: z.string().optional(),
    backgroundStyle: jsonCanvasBackgroundStyleSchema.optional(),
  })
  .passthrough();

export const jsonCanvasNodeSchema = z.discriminatedUnion("type", [
  jsonCanvasTextNodeSchema,
  jsonCanvasFileNodeSchema,
  jsonCanvasLinkNodeSchema,
  jsonCanvasGroupNodeSchema,
]);

export const jsonCanvasEdgeSchema = z
  .object({
    id: z.string().min(1),
    fromNode: z.string().min(1),
    fromSide: jsonCanvasSideSchema.optional(),
    fromEnd: jsonCanvasEndSchema.optional(),
    toNode: z.string().min(1),
    toSide: jsonCanvasSideSchema.optional(),
    toEnd: jsonCanvasEndSchema.optional(),
    color: jsonCanvasColorSchema.optional(),
    label: z.string().optional(),
  })
  .passthrough();

export const jsonCanvasDocumentSchema = z
  .object({
    nodes: z.array(jsonCanvasNodeSchema).optional().default([]),
    edges: z.array(jsonCanvasEdgeSchema).optional().default([]),
  })
  .passthrough();

export const jsonCanvasGeometryInput = {
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  color: jsonCanvasColorSchema.optional(),
};
