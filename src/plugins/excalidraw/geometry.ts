import type { ExcalidrawElement } from "../../core/scene.js";

export interface Point {
  x: number;
  y: number;
}

export function centerPoint(
  element: Pick<ExcalidrawElement, "x" | "y" | "width" | "height">,
): Point {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

export function edgePoint(
  element: Pick<ExcalidrawElement, "x" | "y" | "width" | "height" | "type">,
  towardX: number,
  towardY: number,
): Point {
  const center = centerPoint(element);
  const dx = towardX - center.x;
  const dy = towardY - center.y;
  if (dx === 0 && dy === 0) {
    return center;
  }

  const halfWidth = element.width / 2;
  const halfHeight = element.height / 2;
  if (halfWidth <= 0 || halfHeight <= 0) {
    return center;
  }

  if (element.type === "ellipse") {
    const scale =
      1 / Math.sqrt((dx * dx) / (halfWidth * halfWidth) + (dy * dy) / (halfHeight * halfHeight));
    return {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    };
  }

  if (element.type === "diamond") {
    const scale = 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight);
    return {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    };
  }

  const xScale = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const yScale = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const scale = Math.min(xScale, yScale);
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}
