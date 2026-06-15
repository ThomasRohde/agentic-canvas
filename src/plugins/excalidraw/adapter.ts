import type {
  CanvasObject,
  CanvasObjectSummary,
  CanvasObjectType,
  ExcalidrawElement,
  ShapeObjectType,
} from "../../core/scene.js";

const SUPPORTED_TYPES = new Set<ShapeObjectType>([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "frame",
]);

export function isSupportedElement(element: ExcalidrawElement): element is ExcalidrawElement & {
  type: ShapeObjectType;
} {
  return SUPPORTED_TYPES.has(element.type as ShapeObjectType) && !element.isDeleted;
}

export function toCanvasObject(element: ExcalidrawElement): CanvasObject | undefined {
  if (!isSupportedElement(element)) {
    return undefined;
  }

  return {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    text: element.text,
    points: element.points,
    style: {
      strokeColor: element.strokeColor,
      backgroundColor: element.backgroundColor,
      fillStyle: normalizeFillStyle(element.fillStyle),
      strokeWidth: normalizeStrokeWidth(element.strokeWidth),
      strokeStyle: element.strokeStyle,
      roughness: normalizeRoughness(element.roughness),
      opacity: element.opacity,
      fontSize: element.fontSize,
      textAlign: element.textAlign,
    },
    containerId: element.containerId ?? undefined,
    groupIds: element.groupIds,
    frameId: element.frameId,
    raw: element,
  };
}

export function toCanvasObjectSummary(element: ExcalidrawElement): CanvasObjectSummary | undefined {
  const object = toCanvasObject(element);
  if (!object) {
    return undefined;
  }

  return {
    id: object.id,
    type: object.type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    text: object.text,
  };
}

function normalizeStrokeWidth(width: number): 1 | 2 | 4 {
  if (width === 1 || width === 4) {
    return width;
  }

  return 2;
}

function normalizeFillStyle(fillStyle: string): "hachure" | "cross-hatch" | "solid" {
  if (fillStyle === "hachure" || fillStyle === "cross-hatch") {
    return fillStyle;
  }

  return "solid";
}

function normalizeRoughness(roughness: number): 0 | 1 | 2 {
  if (roughness === 0 || roughness === 2) {
    return roughness;
  }

  return 1;
}
