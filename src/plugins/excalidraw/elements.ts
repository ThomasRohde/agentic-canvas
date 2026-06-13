import { randomUUID } from "node:crypto";
import type {
  BoundElement,
  CanvasObjectType,
  CreateObjectSpec,
  ElementBinding,
  ExcalidrawElement,
} from "../../core/scene.js";
import { measureTextBounds } from "./textMetrics.js";

const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 80;
const ORDER_KEY_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let elementIndexCounter = 0;

export interface BuildElementOptions {
  id?: string;
  text?: string;
  containerId?: string | null;
  startBinding?: ElementBinding | null;
  endBinding?: ElementBinding | null;
  boundElements?: BoundElement[] | null;
  frameId?: string | null;
  groupIds?: string[];
  name?: string | null;
}

export function buildElement(
  spec: CreateObjectSpec,
  options: BuildElementOptions = {},
): ExcalidrawElement {
  const type = spec.type;
  const width = spec.width ?? defaultWidth(type);
  const height = spec.height ?? defaultHeight(type);
  const points = spec.points ?? defaultPoints(type, width, height);
  const base: ExcalidrawElement = {
    id: options.id ?? randomUUID(),
    index: nextElementIndex(),
    type,
    x: spec.x,
    y: spec.y,
    width,
    height,
    angle: 0,
    strokeColor: spec.style?.strokeColor ?? "#1e1e1e",
    backgroundColor: spec.style?.backgroundColor ?? "transparent",
    fillStyle: spec.style?.fillStyle ?? "solid",
    strokeWidth: spec.style?.strokeWidth ?? 2,
    strokeStyle: spec.style?.strokeStyle ?? "solid",
    roughness: spec.style?.roughness ?? 1,
    opacity: spec.style?.opacity ?? 100,
    groupIds: options.groupIds ?? spec.groupIds ?? [],
    frameId: options.frameId ?? null,
    roundness: roundnessFor(type),
    seed: randomInt31(),
    version: 1,
    versionNonce: randomInt31(),
    isDeleted: false,
    boundElements: options.boundElements ?? null,
    updated: Date.now(),
    link: null,
    locked: false,
  };

  if (type === "text") {
    const text = options.text ?? spec.text ?? "";
    const bounds = measureTextBounds(text, spec.style);
    return {
      ...base,
      width: spec.width ?? bounds.width,
      height: spec.height ?? bounds.height,
      text,
      originalText: text,
      fontSize: bounds.fontSize,
      fontFamily: 1,
      textAlign: spec.style?.textAlign ?? "center",
      verticalAlign: "middle",
      containerId: options.containerId ?? spec.containerId ?? null,
      lineHeight: bounds.lineHeight,
      autoResize: true,
    };
  }

  if (type === "line" || type === "arrow") {
    return {
      ...base,
      points,
      width: linearWidth(points),
      height: linearHeight(points),
      lastCommittedPoint: null,
      startBinding: options.startBinding ?? null,
      endBinding: options.endBinding ?? null,
      startArrowhead: null,
      endArrowhead: type === "arrow" ? "arrow" : null,
    };
  }

  if (type === "frame") {
    return {
      ...base,
      backgroundColor: spec.style?.backgroundColor ?? "transparent",
      name: options.name ?? spec.text ?? null,
    };
  }

  return base;
}

export function makeBinding(elementId: string): ElementBinding {
  return { elementId, focus: 0, gap: 0 };
}

export function addBoundElement(target: ExcalidrawElement, bound: BoundElement): void {
  const current = target.boundElements ?? [];
  if (!current.some((entry) => entry.id === bound.id)) {
    target.boundElements = [...current, bound];
    touchElement(target);
  }
}

export function touchElement(element: ExcalidrawElement): void {
  element.version += 1;
  element.versionNonce = randomInt31();
  element.updated = Date.now();
}

function defaultWidth(type: CanvasObjectType): number {
  return type === "text" ? 80 : DEFAULT_WIDTH;
}

function defaultHeight(type: CanvasObjectType): number {
  return type === "text" ? 24 : DEFAULT_HEIGHT;
}

function defaultPoints(type: CanvasObjectType, width: number, height: number): [number, number][] {
  if (type === "line" || type === "arrow") {
    return [
      [0, 0],
      [width, height],
    ];
  }

  return [];
}

function linearWidth(points: [number, number][]): number {
  const xs = points.map(([x]) => x);
  return Math.max(...xs) - Math.min(...xs);
}

function linearHeight(points: [number, number][]): number {
  const ys = points.map(([, y]) => y);
  return Math.max(...ys) - Math.min(...ys);
}

function roundnessFor(type: CanvasObjectType): ExcalidrawElement["roundness"] {
  if (type === "rectangle" || type === "diamond") {
    return { type: 3 };
  }

  return null;
}

function randomInt31(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

function nextElementIndex(): string {
  return orderKeyForInteger(elementIndexCounter++);
}

function orderKeyForInteger(value: number): string {
  let remaining = value;
  for (let width = 1; width <= 26; width += 1) {
    const capacity = ORDER_KEY_DIGITS.length ** width;
    if (remaining < capacity) {
      return `${String.fromCharCode("a".charCodeAt(0) + width - 1)}${encodeOrderDigits(
        remaining,
        width,
      )}`;
    }

    remaining -= capacity;
  }

  throw new Error("Element order key range exhausted");
}

function encodeOrderDigits(value: number, width: number): string {
  let encoded = "";
  let remaining = value;
  for (let index = 0; index < width; index += 1) {
    encoded = ORDER_KEY_DIGITS[remaining % ORDER_KEY_DIGITS.length] + encoded;
    remaining = Math.floor(remaining / ORDER_KEY_DIGITS.length);
  }
  return encoded;
}
