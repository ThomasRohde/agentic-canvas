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
import { isCanvasColor } from "../../shared/colors.js";
import { toCanvasObject, toCanvasObjectSummary } from "./adapter.js";
import { addBoundElement, buildElement, makeBinding, touchElement } from "./elements.js";
import { deserializeScene, serializeScene } from "./format.js";
import { type Point, centerPoint, edgePoint } from "./geometry.js";
import { measureTextBounds } from "./textMetrics.js";
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
  validateCreateSpec(spec);
  if (spec.containerId && !findElement(scene, spec.containerId)) {
    throw new Error(`Object not found: ${spec.containerId}`);
  }

  const element = buildElementWithBindings(scene, spec);
  scene.elements.push(element);

  if (spec.type === "text" && spec.containerId) {
    addBoundElementById(scene, spec.containerId, { id: element.id, type: "text" });
  }

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

  validateUpdatePatch(element, patch);

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
    if (element.type === "text") {
      resizeTextElement(element);
    } else {
      applyTextStyleToBoundLabels(scene, element, patch.style);
    }
  }
  if (patch.text !== undefined) {
    if (element.type === "text") {
      element.text = patch.text;
      element.originalText = patch.text;
      resizeTextElement(element);
      if (element.containerId) {
        const container = findElement(scene, element.containerId);
        if (container) {
          relayoutBoundLabels(scene, container);
        }
      }
    } else {
      upsertContainerLabel(scene, element, patch.text, patch.style);
    }
  }

  touchElement(element);
  syncBoundElements(scene, element);
  return toCanvasObject(element);
}

function deleteObjects(scene: Scene, ids: string[]): string[] {
  const idSet = new Set(ids);
  const deleted = new Set<string>();
  for (const element of scene.elements) {
    if (idSet.has(element.id) || idSet.has(element.containerId ?? "")) {
      deleted.add(element.id);
    }
  }

  if (deleted.size === 0) {
    return [];
  }

  scene.elements = scene.elements.filter((element) => !deleted.has(element.id));
  for (const element of scene.elements) {
    if (!element.boundElements) {
      continue;
    }

    const kept = element.boundElements.filter((bound) => !deleted.has(bound.id));
    if (kept.length !== element.boundElements.length) {
      element.boundElements = kept.length > 0 ? kept : null;
      touchElement(element);
    }
  }

  return [...deleted];
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
    positionBoundLabel(existing, container);
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
  const measured = measureTextBounds(text, style);
  if (isLinearElement(container)) {
    const midpoint = linearMidpoint(container);
    return {
      x: midpoint.x - measured.width / 2,
      y: midpoint.y - measured.height / 2,
      width: measured.width,
      height: measured.height,
    };
  }

  return {
    x: container.x,
    y: container.y + container.height / 2 - measured.height / 2,
    width: Math.max(40, container.width),
    height: measured.height,
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

export function groupElements(scene: Scene, ids: string[]): { groupId: string; ids: string[] } {
  const elements = resolveElements(scene, ids);
  if (elements.length < 2) {
    throw new Error("At least two existing objects are required to create a group");
  }

  const groupId = randomUUID();
  for (const element of elements) {
    if (!element.groupIds.includes(groupId)) {
      element.groupIds = [...element.groupIds, groupId];
      touchElement(element);
    }
  }
  return { groupId, ids: elements.map((element) => element.id) };
}

export function ungroupElements(
  scene: Scene,
  ids: string[],
  groupId?: string,
): { ids: string[]; groupId?: string } {
  const elements = resolveElements(scene, ids);
  for (const element of elements) {
    const nextGroupIds = groupId
      ? element.groupIds.filter((candidate) => candidate !== groupId)
      : [];
    if (nextGroupIds.length !== element.groupIds.length) {
      element.groupIds = nextGroupIds;
      touchElement(element);
    }
  }
  return { ids: elements.map((element) => element.id), groupId };
}

export function removeFromFrame(scene: Scene, ids: string[]): { ids: string[] } {
  const elements = resolveElements(scene, ids);
  for (const element of elements) {
    if (element.frameId !== null) {
      element.frameId = null;
      touchElement(element);
    }
  }
  return { ids: elements.map((element) => element.id) };
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
    if (element.type !== "text") {
      return;
    }
    element.fontSize = style.fontSize;
  }
  if (style.textAlign !== undefined) {
    if (element.type !== "text") {
      return;
    }
    element.textAlign = style.textAlign;
  }
}

function validateCreateSpec(spec: CreateObjectSpec): void {
  validateStyle(spec.style);
  validateText(spec.type, spec.text, { required: spec.type === "text" });
  validateDimensions(spec.type, spec.width, spec.height);
  validateArrowSelfLoop(spec);
  if ((spec.type === "line" || spec.type === "arrow") && spec.points) {
    validateLinearPoints(spec.points);
  }
}

function validateUpdatePatch(element: ExcalidrawElement, patch: UpdateObjectPatch): void {
  const type = element.type as CanvasObjectType;
  validateStyle(patch.style);
  validateText(type, patch.text);
  validateUpdateFields(element, patch);
  validateDimensions(type, patch.width, patch.height);
  if (patch.points) {
    validateLinearPoints(patch.points);
  }
}

function validateStyle(style?: CanvasStyle): void {
  for (const [field, value] of [
    ["strokeColor", style?.strokeColor],
    ["backgroundColor", style?.backgroundColor],
  ] as const) {
    if (value !== undefined && !isCanvasColor(value)) {
      throw new Error(`Invalid ${field}: ${value}`);
    }
  }
}

function validateText(
  type: CanvasObjectType,
  text?: string,
  options: { required?: boolean } = {},
): void {
  if (
    (options.required && type === "text" && text === undefined) ||
    (text !== undefined && text.trim().length === 0 && type !== "frame")
  ) {
    throw new Error("Text must not be empty");
  }
}

function validateUpdateFields(element: ExcalidrawElement, patch: UpdateObjectPatch): void {
  if (patch.start !== undefined || patch.end !== undefined) {
    throw new Error("Arrow endpoints cannot be updated; recreate the arrow instead");
  }
  if (patch.points !== undefined && !isLinearElement(element)) {
    throw new Error("Points can only update line or arrow objects");
  }
  if (isLinearElement(element) && (patch.width !== undefined || patch.height !== undefined)) {
    throw new Error("Line and arrow dimensions cannot be updated directly; use points instead");
  }
  if (patch.containerId !== undefined && element.type !== "text") {
    throw new Error("containerId can only be updated on text objects");
  }
}

function validateArrowSelfLoop(spec: CreateObjectSpec): void {
  if (
    spec.type === "arrow" &&
    spec.start &&
    spec.end &&
    isElementEndpoint(spec.start) &&
    isElementEndpoint(spec.end) &&
    spec.start.elementId === spec.end.elementId
  ) {
    throw new Error("Arrow self-loops are not supported");
  }
}

function validateDimensions(type: CanvasObjectType, width?: number, height?: number): void {
  if (type === "line" || type === "arrow" || type === "text") {
    if (width !== undefined && height !== undefined && width === 0 && height === 0) {
      throw new Error("Linear geometry must not be zero length");
    }
    return;
  }

  if (width !== undefined && width <= 0) {
    throw new Error("Width must be greater than zero");
  }
  if (height !== undefined && height <= 0) {
    throw new Error("Height must be greater than zero");
  }
}

function validateLinearPoints(points: [number, number][]): void {
  if (points.length < 2) {
    throw new Error("Line and arrow points must contain at least two points");
  }
  const [firstX, firstY] = points[0] ?? [0, 0];
  if (points.every(([x, y]) => x === firstX && y === firstY)) {
    throw new Error("Line and arrow points must not be zero length");
  }
}

function resizeTextElement(element: ExcalidrawElement): void {
  const bounds = measureTextBounds(element.text ?? "", styleFromElement(element));
  element.width = bounds.width;
  element.height = bounds.height;
  element.fontSize = bounds.fontSize;
  element.lineHeight = bounds.lineHeight;
}

function syncBoundElements(scene: Scene, element: ExcalidrawElement): void {
  relayoutBoundLabels(scene, element);
  rerouteBoundArrows(scene, element);
}

function relayoutBoundLabels(scene: Scene, container: ExcalidrawElement): void {
  for (const label of scene.elements.filter(
    (candidate) => candidate.type === "text" && candidate.containerId === container.id,
  )) {
    positionBoundLabel(label, container);
    touchElement(label);
  }
}

function applyTextStyleToBoundLabels(
  scene: Scene,
  container: ExcalidrawElement,
  style: CanvasStyle,
): void {
  if (style.fontSize === undefined && style.textAlign === undefined) {
    return;
  }

  for (const label of scene.elements.filter(
    (candidate) => candidate.type === "text" && candidate.containerId === container.id,
  )) {
    applyStyle(label, {
      fontSize: style.fontSize,
      textAlign: style.textAlign,
    });
    resizeTextElement(label);
    positionBoundLabel(label, container);
    touchElement(label);
  }
}

function positionBoundLabel(label: ExcalidrawElement, container: ExcalidrawElement): void {
  const position = labelPosition(container, label.text ?? "", styleFromElement(label));
  label.x = position.x;
  label.y = position.y;
  label.width = position.width;
  label.height = position.height;
  label.autoResize = false;
}

function rerouteBoundArrows(scene: Scene, changedElement: ExcalidrawElement): void {
  const arrowIds = new Set<string>(
    (changedElement.boundElements ?? [])
      .filter((bound) => bound.type === "arrow")
      .map((bound) => bound.id),
  );

  for (const candidate of scene.elements) {
    if (
      isLinearElement(candidate) &&
      (candidate.startBinding?.elementId === changedElement.id ||
        candidate.endBinding?.elementId === changedElement.id)
    ) {
      arrowIds.add(candidate.id);
    }
  }

  for (const arrowId of arrowIds) {
    const arrow = findElement(scene, arrowId);
    if (!arrow || !isLinearElement(arrow)) {
      continue;
    }

    rerouteArrow(scene, arrow);
    relayoutBoundLabels(scene, arrow);
  }
}

function rerouteArrow(scene: Scene, arrow: ExcalidrawElement): void {
  const startTarget = arrow.startBinding
    ? findElement(scene, arrow.startBinding.elementId)
    : undefined;
  const endTarget = arrow.endBinding ? findElement(scene, arrow.endBinding.elementId) : undefined;
  if (!startTarget && !endTarget) {
    return;
  }

  const currentStart = absoluteStartPoint(arrow);
  const currentEnd = absoluteEndPoint(arrow);
  const startReference = endTarget ? centerPoint(endTarget) : currentEnd;
  const endReference = startTarget ? centerPoint(startTarget) : currentStart;
  const startPoint = startTarget
    ? edgePoint(startTarget, startReference.x, startReference.y)
    : currentStart;
  const endPoint = endTarget ? edgePoint(endTarget, endReference.x, endReference.y) : currentEnd;

  arrow.x = startPoint.x;
  arrow.y = startPoint.y;
  arrow.points = [
    [0, 0],
    [endPoint.x - startPoint.x, endPoint.y - startPoint.y],
  ];
  arrow.width = linearWidth(arrow.points);
  arrow.height = linearHeight(arrow.points);
  touchElement(arrow);
}

function absoluteStartPoint(element: ExcalidrawElement): Point {
  const first = element.points?.[0] ?? [0, 0];
  return { x: element.x + first[0], y: element.y + first[1] };
}

function absoluteEndPoint(element: ExcalidrawElement): Point {
  const points = element.points ?? [[0, 0]];
  const last = points[points.length - 1] ?? [0, 0];
  return { x: element.x + last[0], y: element.y + last[1] };
}

function styleFromElement(element: ExcalidrawElement): CanvasStyle {
  return {
    strokeColor: element.strokeColor,
    backgroundColor: element.backgroundColor,
    fillStyle: element.fillStyle as CanvasStyle["fillStyle"],
    strokeWidth: element.strokeWidth as CanvasStyle["strokeWidth"],
    strokeStyle: element.strokeStyle,
    roughness: element.roughness as CanvasStyle["roughness"],
    opacity: element.opacity,
    fontSize: element.fontSize,
    textAlign: element.textAlign,
  };
}

function resolveElements(scene: Scene, ids: string[]): ExcalidrawElement[] {
  const missingIds = ids.filter((id) => !findElement(scene, id));
  if (missingIds.length > 0) {
    throw new Error(`Object not found: ${missingIds.join(", ")}`);
  }
  return ids
    .map((id) => findElement(scene, id))
    .filter((element): element is ExcalidrawElement => Boolean(element));
}

function linearWidth(points: [number, number][]): number {
  const xs = points.map(([x]) => x);
  return Math.max(...xs) - Math.min(...xs);
}

function linearHeight(points: [number, number][]): number {
  const ys = points.map(([, y]) => y);
  return Math.max(...ys) - Math.min(...ys);
}
