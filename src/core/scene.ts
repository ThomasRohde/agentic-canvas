export type CanvasObjectType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "text"
  | "frame";

export type FillStyle = "hachure" | "cross-hatch" | "solid";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type StrokeWidth = 1 | 2 | 4;
export type Roughness = 0 | 1 | 2;
export type TextAlign = "left" | "center" | "right";

export interface CanvasStyle {
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: FillStyle;
  strokeWidth?: StrokeWidth;
  strokeStyle?: StrokeStyle;
  roughness?: Roughness;
  opacity?: number;
  fontSize?: number;
  textAlign?: TextAlign;
}

export interface ElementEndpoint {
  elementId: string;
}

export interface PointEndpoint {
  x: number;
  y: number;
}

export type ArrowEndpoint = ElementEndpoint | PointEndpoint;

export interface CreateObjectSpec {
  type: CanvasObjectType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  points?: [number, number][];
  style?: CanvasStyle;
  start?: ArrowEndpoint;
  end?: ArrowEndpoint;
  containerId?: string;
  groupIds?: string[];
}

export type UpdateObjectPatch = Partial<Omit<CreateObjectSpec, "type">>;

export interface CanvasObjectSummary {
  id: string;
  type: CanvasObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

export interface CanvasObject extends CanvasObjectSummary {
  points?: [number, number][];
  style: CanvasStyle;
  containerId?: string;
  groupIds: string[];
  frameId?: string | null;
  raw: ExcalidrawElement;
}

export interface BoundElement {
  id: string;
  type: "arrow" | "text";
}

export interface ElementBinding {
  elementId: string;
  focus: number;
  gap: number;
}

export interface ExcalidrawElement {
  id: string;
  index: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number; value?: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: BoundElement[] | null;
  updated: number;
  link: string | null;
  locked: boolean;
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: TextAlign;
  verticalAlign?: "top" | "middle" | "bottom";
  containerId?: string | null;
  lineHeight?: number;
  autoResize?: boolean;
  points?: [number, number][];
  lastCommittedPoint?: [number, number] | null;
  startBinding?: ElementBinding | null;
  endBinding?: ElementBinding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  name?: string | null;
  customData?: Record<string, unknown>;
}

export interface AppState {
  viewBackgroundColor: string;
  [key: string]: unknown;
}

export type BinaryFiles = Record<string, unknown>;

export interface Scene {
  elements: ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  version: number;
}

export interface CanvasMetadata {
  canvas: string;
  version: number;
  objectCount: number;
  viewBackgroundColor: string;
}

export interface SerializedScene {
  type: "excalidraw";
  version: 2;
  source: "agentic-canvas";
  elements: ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

export function isElementEndpoint(endpoint: ArrowEndpoint): endpoint is ElementEndpoint {
  return "elementId" in endpoint;
}

export function cloneScene(scene: Scene): Scene {
  return {
    elements: scene.elements.map(cloneElement),
    appState: { ...scene.appState },
    files: { ...scene.files },
    version: scene.version,
  };
}

export function cloneElement(element: ExcalidrawElement): ExcalidrawElement {
  return {
    ...element,
    groupIds: [...element.groupIds],
    roundness: element.roundness ? { ...element.roundness } : null,
    boundElements: element.boundElements
      ? element.boundElements.map((bound) => ({ ...bound }))
      : null,
    points: element.points ? element.points.map(([x, y]) => [x, y]) : undefined,
    startBinding: element.startBinding ? { ...element.startBinding } : element.startBinding,
    endBinding: element.endBinding ? { ...element.endBinding } : element.endBinding,
    lastCommittedPoint: element.lastCommittedPoint
      ? [element.lastCommittedPoint[0], element.lastCommittedPoint[1]]
      : element.lastCommittedPoint,
    customData: element.customData ? { ...element.customData } : element.customData,
  };
}
