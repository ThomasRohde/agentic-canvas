import type { JsonCanvasDocument, JsonCanvasNode } from "./model.js";
import { JSON_CANVAS_GRID } from "./model.js";

export function nextGridPosition(document: JsonCanvasDocument): { x: number; y: number } {
  const occupied = new Set(
    (document.nodes ?? []).map((node) => `${gridColumn(node.x)}:${gridRow(node.y)}`),
  );

  for (let slot = 0; slot < 10_000; slot += 1) {
    const column = slot % JSON_CANVAS_GRID.columns;
    const row = Math.floor(slot / JSON_CANVAS_GRID.columns);
    const key = `${column}:${row}`;
    if (!occupied.has(key)) {
      return {
        x: JSON_CANVAS_GRID.originX + column * JSON_CANVAS_GRID.columnWidth,
        y: JSON_CANVAS_GRID.originY + row * JSON_CANVAS_GRID.rowHeight,
      };
    }
  }

  return {
    x: JSON_CANVAS_GRID.originX,
    y: JSON_CANVAS_GRID.originY + (document.nodes ?? []).length * JSON_CANVAS_GRID.rowHeight,
  };
}

export function boundsForNodes(nodes: JsonCanvasNode[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function gridColumn(x: number): number {
  return Math.round((x - JSON_CANVAS_GRID.originX) / JSON_CANVAS_GRID.columnWidth);
}

function gridRow(y: number): number {
  return Math.round((y - JSON_CANVAS_GRID.originY) / JSON_CANVAS_GRID.rowHeight);
}
