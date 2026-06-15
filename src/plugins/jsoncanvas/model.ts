export type JsonCanvasSide = "top" | "right" | "bottom" | "left";
export type JsonCanvasEnd = "none" | "arrow";
export type JsonCanvasColor = `#${string}` | "1" | "2" | "3" | "4" | "5" | "6";

export interface JsonCanvasDocument {
  nodes?: JsonCanvasNode[];
  edges?: JsonCanvasEdge[];
}

export interface JsonCanvasBaseNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: JsonCanvasColor;
}

export interface JsonCanvasTextNode extends JsonCanvasBaseNode {
  type: "text";
  text: string;
}

export interface JsonCanvasFileNode extends JsonCanvasBaseNode {
  type: "file";
  file: string;
  subpath?: string;
}

export interface JsonCanvasLinkNode extends JsonCanvasBaseNode {
  type: "link";
  url: string;
}

export interface JsonCanvasGroupNode extends JsonCanvasBaseNode {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

export type JsonCanvasNode =
  | JsonCanvasTextNode
  | JsonCanvasFileNode
  | JsonCanvasLinkNode
  | JsonCanvasGroupNode;

export interface JsonCanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: JsonCanvasSide;
  fromEnd?: JsonCanvasEnd;
  toNode: string;
  toSide?: JsonCanvasSide;
  toEnd?: JsonCanvasEnd;
  color?: JsonCanvasColor;
  label?: string;
}

export interface JsonCanvasAppState {
  [key: string]: unknown;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  selectedIds?: string[];
  lastSavedPath?: string;
}

export const JSON_CANVAS_EXTENSION = ".canvas";

export const JSON_CANVAS_DEFAULT_SIZE = {
  text: { width: 360, height: 180 },
  file: { width: 360, height: 120 },
  link: { width: 360, height: 120 },
  group: { width: 520, height: 360 },
} as const;

export const JSON_CANVAS_GRID = {
  originX: 0,
  originY: 0,
  columnWidth: 420,
  rowHeight: 240,
  columns: 3,
} as const;
