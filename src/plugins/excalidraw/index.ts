import { randomUUID } from "node:crypto";
import type { CanvasPlugin, PluginToolContext } from "../../core/plugin.js";
import type {
  CanvasMetadata,
  CanvasObject,
  CanvasObjectSummary,
  CanvasObjectType,
  CanvasStyle,
  CreateObjectSpec,
  ExcalidrawElement,
  Scene,
  SerializedScene,
  UpdateObjectPatch,
} from "../../core/scene.js";
import { isElementEndpoint } from "../../core/scene.js";
import { toCanvasObject, toCanvasObjectSummary } from "./adapter.js";
import { addBoundElement, buildElement, makeBinding, touchElement } from "./elements.js";
import { deserializeScene, serializeScene } from "./format.js";
import { type Point, centerPoint, edgePoint } from "./geometry.js";
import { registerExcalidrawTools } from "./tools.js";

export function createExcalidrawPlugin(): CanvasPlugin {
  return {
    name: "excalidraw",
    createInitialScene,
    getMetadata,
    listObjects,
    getObject,
    createObject,
    updateObject,
    deleteObjects,
    clear,
    serialize,
    deserialize,
    registerTools,
  };
}

function createInitialScene(): Scene {
  return {
    elements: [],
    appState: {
      viewBackgroundColor: "#ffffff",
    },
    files: {},
    version: 0,
  };
}

function getMetadata(scene: Scene): CanvasMetadata {
  return {
    canvas: "excalidraw",
    version: scene.version,
    objectCount: listObjects(scene).length,
    viewBackgroundColor: scene.appState.viewBackgroundColor,
  };
}

function listObjects(scene: Scene, type?: CanvasObjectType): CanvasObjectSummary[] {
  return scene.elements
    .map(toCanvasObjectSummary)
    .filter((object): object is CanvasObjectSummary => Boolean(object))
    .filter((object) => !type || object.type === type);
}

function getObject(scene: Scene, id: string): CanvasObject | undefined {
  const element = findElement(scene, id);
  return element ? toCanvasObject(element) : undefined;
}

function createObject(scene: Scene, spec: CreateObjectSpec): CanvasObject {
  const element = buildElementWithBindings(scene, spec);
  scene.elements.push(element);

  if (spec.text && canCreateBoundLabel(spec.type)) {
    const label = createBoundLabel(element, spec.text, spec.style);
    scene.elements.push(label);
  }

  const object = toCanvasObject(element);
  if (!object) {
    throw new Error(`Unsupported object type: ${spec.type}`);
  }

  return object;
}

function updateObject(
  scene: Scene,
  id: string,
  patch: UpdateObjectPatch,
): CanvasObject | undefined {
  const element = findElement(scene, id);
  if (!element) {
    return undefined;
  }

  if (patch.x !== undefined) {
    element.x = patch.x;
  }
  if (patch.y !== undefined) {
    element.y = patch.y;
  }
  if (patch.width !== undefined) {
    element.width = patch.width;
  }
  if (patch.height !== undefined) {
    element.height = patch.height;
  }
  if (patch.points !== undefined) {
    element.points = patch.points;
    element.width = linearWidth(patch.points);
    element.height = linearHeight(patch.points);
  }
  if (patch.groupIds !== undefined) {
    element.groupIds = patch.groupIds;
  }
  if (patch.containerId !== undefined) {
    element.containerId = patch.containerId;
  }
  if (patch.style) {
    applyStyle(element, patch.style);
  }
  if (patch.text !== undefined) {
    if (element.type === "text") {
      element.text = patch.text;
      element.originalText = patch.text;
    } else {
      upsertContainerLabel(scene, element, patch.text, patch.style);
    }
  }

  touchElement(element);
  return toCanvasObject(element);
}

function deleteObjects(scene: Scene, ids: string[]): string[] {
  const idSet = new Set(ids);
  const before = scene.elements.length;
  scene.elements = scene.elements.filter(
    (element) => !idSet.has(element.id) && !idSet.has(element.containerId ?? ""),
  );
  return before === scene.elements.length ? [] : ids.filter((id) => !findElement(scene, id));
}

function clear(scene: Scene): void {
  scene.elements = [];
  scene.files = {};
}

function serialize(scene: Scene): SerializedScene {
  return serializeScene(scene);
}

function deserialize(raw: string): Scene {
  return deserializeScene(raw);
}

function registerTools(
  server: Parameters<CanvasPlugin["registerTools"]>[0],
  context: PluginToolContext,
): void {
  registerExcalidrawTools(server, context);
}

function buildElementWithBindings(scene: Scene, spec: CreateObjectSpec): ExcalidrawElement {
  if (spec.type !== "arrow" && spec.type !== "line") {
    return buildElement(spec);
  }

  const start = spec.start ? resolveEndpoint(scene, spec.start) : undefined;
  const end = spec.end ? resolveEndpoint(scene, spec.end) : undefined;
  const defaultStart = { x: spec.x, y: spec.y };
  const defaultEnd = {
    x: spec.x + (spec.width ?? 160),
    y: spec.y + (spec.height ?? 80),
  };
  const startCenter = start?.point ?? defaultStart;
  const endCenter = end?.point ?? defaultEnd;
  const startPoint = start?.element
    ? edgePoint(start.element, endCenter.x, endCenter.y)
    : startCenter;
  const endPoint = end?.element ? edgePoint(end.element, startCenter.x, startCenter.y) : endCenter;
  const points = spec.points ?? [
    [0, 0],
    [endPoint.x - startPoint.x, endPoint.y - startPoint.y],
  ];

  const element = buildElement(
    {
      ...spec,
      x: startPoint.x,
      y: startPoint.y,
      points,
    },
    {
      startBinding: start?.element ? makeBinding(start.element.id) : null,
      endBinding: end?.element ? makeBinding(end.element.id) : null,
    },
  );

  if (spec.type === "arrow") {
    if (start?.element) {
      addBoundElementById(scene, start.element.id, { id: element.id, type: "arrow" });
    }
    if (end?.element) {
      addBoundElementById(scene, end.element.id, { id: element.id, type: "arrow" });
    }
  }

  return element;
}

function resolveEndpoint(
  scene: Scene,
  endpoint: NonNullable<CreateObjectSpec["start"]>,
): { point: Point; element?: ExcalidrawElement } {
  if (isElementEndpoint(endpoint)) {
    const element = findElement(scene, endpoint.elementId);
    if (!element) {
      throw new Error(`Object not found: ${endpoint.elementId}`);
    }

    return {
      point: centerPoint(element),
      element,
    };
  }

  return { point: endpoint };
}

function upsertContainerLabel(
  scene: Scene,
  container: ExcalidrawElement,
  text: string,
  style?: CreateObjectSpec["style"],
): void {
  const existing = scene.elements.find(
    (element) => element.type === "text" && element.containerId === container.id,
  );
  if (existing) {
    existing.text = text;
    existing.originalText = text;
    if (style) {
      applyStyle(existing, style);
    }
    touchElement(existing);
    return;
  }

  scene.elements.push(createBoundLabel(container, text, style));
}

function createBoundLabel(
  container: ExcalidrawElement,
  text: string,
  style?: CreateObjectSpec["style"],
): ExcalidrawElement {
  const labelStyle: CanvasStyle = { ...style, textAlign: style?.textAlign ?? "center" };
  const position = labelPosition(container, text, labelStyle);
  const label = buildElement(
    {
      type: "text",
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      text,
      style: labelStyle,
    },
    {
      containerId: container.id,
    },
  );
  label.autoResize = false;
  addBoundElement(container, { id: label.id, type: "text" });
  return label;
}

function labelPosition(
  container: ExcalidrawElement,
  text: string,
  style: CanvasStyle,
): { x: number; y: number; width: number; height: number } {
  const fontSize = style.fontSize ?? 20;
  const lineHeight = fontSize * 1.25;
  if (isLinearElement(container)) {
    const midpoint = linearMidpoint(container);
    const width = Math.max(40, text.length * fontSize * 0.6);
    const height = lineHeight;
    return {
      x: midpoint.x - width / 2,
      y: midpoint.y - height / 2,
      width,
      height,
    };
  }

  return {
    x: container.x,
    y: container.y + container.height / 2 - lineHeight / 2,
    width: Math.max(40, container.width),
    height: lineHeight,
  };
}

function isLinearElement(element: ExcalidrawElement): boolean {
  return element.type === "line" || element.type === "arrow";
}

function canCreateBoundLabel(type: CanvasObjectType): boolean {
  return type !== "text" && type !== "frame" && type !== "line";
}

function linearMidpoint(element: ExcalidrawElement): Point {
  const points = element.points ?? [
    [0, 0],
    [element.width, element.height],
  ];
  const first = points[0] ?? [0, 0];
  const last = points[points.length - 1] ?? first;
  return {
    x: element.x + (first[0] + last[0]) / 2,
    y: element.y + (first[1] + last[1]) / 2,
  };
}

function addBoundElementById(
  scene: Scene,
  elementId: string,
  bound: { id: string; type: "arrow" | "text" },
): void {
  const element = findElement(scene, elementId);
  if (element) {
    addBoundElement(element, bound);
  }
}

export function findElement(scene: Scene, id: string): ExcalidrawElement | undefined {
  return scene.elements.find((element) => element.id === id && !element.isDeleted);
}

export function setFrameOnChildren(scene: Scene, childIds: string[], frameId: string): string[] {
  const updated: string[] = [];
  for (const childId of childIds) {
    const child = findElement(scene, childId);
    if (child) {
      child.frameId = frameId;
      touchElement(child);
      updated.push(child.id);
    }
  }
  return updated;
}

export function groupElements(scene: Scene, ids: string[]): string {
  const groupId = randomUUID();
  for (const id of ids) {
    const element = findElement(scene, id);
    if (element && !element.groupIds.includes(groupId)) {
      element.groupIds = [...element.groupIds, groupId];
      touchElement(element);
    }
  }
  return groupId;
}

function applyStyle(
  element: ExcalidrawElement,
  style: NonNullable<CreateObjectSpec["style"]>,
): void {
  if (style.strokeColor !== undefined) {
    element.strokeColor = style.strokeColor;
  }
  if (style.backgroundColor !== undefined) {
    element.backgroundColor = style.backgroundColor;
  }
  if (style.fillStyle !== undefined) {
    element.fillStyle = style.fillStyle;
  }
  if (style.strokeWidth !== undefined) {
    element.strokeWidth = style.strokeWidth;
  }
  if (style.strokeStyle !== undefined) {
    element.strokeStyle = style.strokeStyle;
  }
  if (style.roughness !== undefined) {
    element.roughness = style.roughness;
  }
  if (style.opacity !== undefined) {
    element.opacity = style.opacity;
  }
  if (style.fontSize !== undefined) {
    element.fontSize = style.fontSize;
    element.height = style.fontSize * 1.25;
  }
  if (style.textAlign !== undefined) {
    element.textAlign = style.textAlign;
  }
}

function linearWidth(points: [number, number][]): number {
  const xs = points.map(([x]) => x);
  return Math.max(...xs) - Math.min(...xs);
}

function linearHeight(points: [number, number][]): number {
  const ys = points.map(([, y]) => y);
  return Math.max(...ys) - Math.min(...ys);
}
