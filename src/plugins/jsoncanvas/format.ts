import nodePath from "node:path";
import type { JsonCanvasDocument } from "./model.js";
import { JSON_CANVAS_EXTENSION } from "./model.js";
import {
  JsonCanvasValidationError,
  type JsonCanvasValidationOptions,
  validateJsonCanvasDocument,
} from "./validation.js";

export interface JsonCanvasDeserializeResult {
  document: JsonCanvasDocument;
  warnings: string[];
}

export function serializeJsonCanvasDocument(document: JsonCanvasDocument): string {
  return `${JSON.stringify({ nodes: document.nodes ?? [], edges: document.edges ?? [] }, null, 2)}\n`;
}

export function deserializeJsonCanvasDocument(
  raw: string,
  options: JsonCanvasValidationOptions = {},
): JsonCanvasDeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new JsonCanvasValidationError([
      error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON",
    ]);
  }

  return validateJsonCanvasDocument(parsed, options);
}

export function normalizeJsonCanvasPath(userPath: string): string {
  const extension = nodePath.extname(userPath);
  if (!extension) {
    return `${userPath}${JSON_CANVAS_EXTENSION}`;
  }
  if (extension.toLowerCase() !== JSON_CANVAS_EXTENSION) {
    throw new Error(`Expected ${JSON_CANVAS_EXTENSION} file path, got: ${userPath}`);
  }

  return userPath;
}
