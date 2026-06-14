import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  CanvasObject,
  CanvasObjectType,
  CanvasStyle,
  CreateObjectSpec,
  UpdateObjectPatch,
} from "../core/scene.js";
import type { CanvasController } from "../server/canvasController.js";
import type { Workspace } from "../server/workspace.js";
import {
  applyCanvasPatchShape,
  canvasObjectTypeSchema,
  colorSchema,
  createObjectShape,
  findObjectsShape,
  updateObjectShape,
} from "./schemas.js";
import type { ApplyCanvasPatchInput, FindObjectsInput } from "./schemas.js";

export interface ExportResult {
  mimeType: string;
  base64: string;
}

export interface SelectionResult {
  selectedIds: string[];
}

export interface SelectionSetResult {
  selectedIds: string[];
}

export interface BaselineToolContext {
  controller: CanvasController;
  workspace: Workspace;
  clientsConnected(): number;
  requestExport(options: { exportPadding?: number }): Promise<ExportResult>;
  requestSelection(options?: { timeoutMs?: number }): Promise<SelectionResult>;
  requestSetSelection(
    selectedIds: string[],
    options?: { timeoutMs?: number },
  ): Promise<SelectionSetResult>;
}

export function registerBaselineTools(server: McpServer, context: BaselineToolContext): void {
  server.registerTool(
    "get_canvas_state",
    {
      description: "Get canvas metadata and current scene state summary.",
      inputSchema: {},
    },
    async () => textResult(context.controller.getMetadata(context.clientsConnected())),
  );

  server.registerTool(
    "list_objects",
    {
      description: "List normalized canvas objects.",
      inputSchema: {
        type: canvasObjectTypeSchema.optional(),
      },
    },
    async ({ type }) =>
      textResult(context.controller.listObjects(type as CanvasObjectType | undefined)),
  );

  server.registerTool(
    "get_object",
    {
      description: "Get one normalized canvas object by id.",
      inputSchema: {
        id: z.string(),
      },
    },
    async ({ id }) => {
      const object = context.controller.getObject(id);
      return object ? textResult(object) : errorResult(`Object not found: ${id}`);
    },
  );

  server.registerTool(
    "find_objects",
    {
      description: "Find normalized canvas objects by text, type, geometry, style, or metadata.",
      inputSchema: findObjectsShape,
    },
    async (input) => findObjects(context, input as FindObjectsInput),
  );

  server.registerTool(
    "create_object",
    {
      description: "Create a normalized canvas object.",
      inputSchema: createObjectShape,
    },
    async (input) => {
      try {
        const object = context.controller.createObject(input as CreateObjectSpec);
        return textResult({ id: object.id });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "apply_canvas_patch",
    {
      description: "Atomically apply ordered create, update, and delete operations to the canvas.",
      inputSchema: applyCanvasPatchShape,
    },
    async (input) => applyCanvasPatch(context, input as ApplyCanvasPatchInput),
  );

  server.registerTool(
    "update_object",
    {
      description: "Patch a normalized canvas object.",
      inputSchema: updateObjectShape,
    },
    async ({ id, ...patch }) => {
      const object = context.controller.updateObject(id, patch as UpdateObjectPatch);
      return object ? textResult({ id: object.id }) : errorResult(`Object not found: ${id}`);
    },
  );

  server.registerTool(
    "delete_object",
    {
      description: "Delete one or more canvas objects.",
      inputSchema: {
        ids: z.array(z.string()).min(1),
      },
    },
    async ({ ids }) => textResult({ deleted: context.controller.deleteObjects(ids) }),
  );

  server.registerTool(
    "clear_canvas",
    {
      description: "Clear all canvas objects.",
      inputSchema: {},
    },
    async () => {
      context.controller.clear();
      return textResult({ cleared: true });
    },
  );

  server.registerTool(
    "save_canvas",
    {
      description: "Save the current canvas to a .excalidraw file inside the workspace.",
      inputSchema: {
        path: z.string().optional(),
      },
    },
    async ({ path }) => {
      try {
        const written = await context.workspace.writeText(
          path ?? "canvas.excalidraw",
          context.controller.serialize(),
        );
        return textResult({ path: written });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "set_canvas_background",
    {
      description: "Set the canvas background color.",
      inputSchema: {
        color: colorSchema,
      },
    },
    async ({ color }) => {
      context.controller.mutateScene((scene) => {
        scene.appState.viewBackgroundColor = color;
      });
      return textResult({ viewBackgroundColor: color });
    },
  );

  server.registerTool(
    "open_canvas",
    {
      description: "Open a .excalidraw file from inside the workspace.",
      inputSchema: {
        path: z.string(),
      },
    },
    async ({ path }) => {
      try {
        const file = await context.workspace.readText(path);
        context.controller.deserialize(file.text);
        return textResult({
          path: file.path,
          objectCount: context.controller.listObjects().length,
        });
      } catch (error) {
        return errorResult(friendlyOpenError(error, path));
      }
    },
  );

  server.registerTool(
    "screenshot",
    {
      description: "Export a PNG screenshot through a connected browser.",
      inputSchema: {
        path: z.string().optional(),
        exportPadding: z.number().min(0).max(200).optional(),
      },
    },
    async ({ path, exportPadding }) => {
      try {
        const exported = await context.requestExport({ exportPadding });
        const content: Array<
          { type: "image"; data: string; mimeType: string } | { type: "text"; text: string }
        > = [{ type: "image", data: exported.base64, mimeType: exported.mimeType }];
        if (path) {
          const written = await context.workspace.writeBinary(
            path,
            Buffer.from(exported.base64, "base64"),
          );
          content.push({ type: "text", text: JSON.stringify({ path: written }) });
        }
        return { content };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_selected_objects",
    {
      description: "Return normalized objects currently selected in the connected browser.",
      inputSchema: {},
    },
    async () => {
      try {
        const selection = await context.requestSelection();
        const objects: CanvasObject[] = [];
        const missingIds: string[] = [];
        for (const id of selection.selectedIds) {
          const object = context.controller.getObject(id);
          if (object) {
            objects.push(object);
          } else {
            missingIds.push(id);
          }
        }

        return textResult({
          version: context.controller.currentVersion(),
          selectedIds: selection.selectedIds,
          objects,
          missingIds,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "select_objects",
    {
      description: "Select existing objects in the connected browser.",
      inputSchema: {
        ids: z.array(z.string()),
      },
    },
    async ({ ids }) => {
      try {
        const selectedIds: string[] = [];
        const missingIds: string[] = [];
        for (const id of ids) {
          if (context.controller.getObject(id)) {
            selectedIds.push(id);
          } else {
            missingIds.push(id);
          }
        }

        const result = await context.requestSetSelection(selectedIds);
        return textResult({
          selectedIds: result.selectedIds,
          missingIds,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "undo",
    {
      description: "Undo the most recent authoritative scene change.",
      inputSchema: {},
    },
    async () => {
      const undone = context.controller.undo();
      return textResult({ version: context.controller.currentVersion(), undone });
    },
  );

  server.registerTool(
    "redo",
    {
      description: "Redo the most recently undone authoritative scene change.",
      inputSchema: {},
    },
    async () => {
      const redone = context.controller.redo();
      return textResult({ version: context.controller.currentVersion(), redone });
    },
  );
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

function friendlyOpenError(error: unknown, requestedPath: string): unknown {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  ) {
    return `No such canvas file: ${requestedPath}`;
  }

  return error;
}

async function findObjects(context: BaselineToolContext, input: FindObjectsInput) {
  let regex: RegExp | undefined;
  if (input.textRegex !== undefined) {
    try {
      regex = new RegExp(input.textRegex);
    } catch (error) {
      return errorResult(error);
    }
  }

  let selectedIds: Set<string> | undefined;
  if (input.selectedOnly) {
    try {
      selectedIds = new Set((await context.requestSelection()).selectedIds);
    } catch (error) {
      return errorResult(error);
    }
  }

  const objects = context.controller
    .listObjects(input.type as CanvasObjectType | undefined)
    .map((summary) => context.controller.getObject(summary.id))
    .filter((object): object is CanvasObject => Boolean(object));
  const boundTextByContainerId = collectBoundText(context.controller);
  const matched = objects.filter((object) =>
    matchesFindInput(object, input, regex, selectedIds, boundTextByContainerId),
  );
  const limited = input.limit ? matched.slice(0, input.limit) : matched;

  return textResult({
    count: limited.length,
    ids: limited.map((object) => object.id),
    objects: limited,
  });
}

function matchesFindInput(
  object: CanvasObject,
  input: FindObjectsInput,
  regex?: RegExp,
  selectedIds?: Set<string>,
  boundTextByContainerId?: Map<string, string[]>,
): boolean {
  const searchableText = textForSearch(object, boundTextByContainerId);
  if (selectedIds && !selectedIds.has(object.id)) {
    return false;
  }
  if (input.textContains !== undefined && !searchableText.includes(input.textContains)) {
    return false;
  }
  if (regex && !regex.test(searchableText)) {
    return false;
  }
  if (input.frameId !== undefined && object.frameId !== input.frameId) {
    return false;
  }
  if (input.groupId !== undefined && !object.groupIds.includes(input.groupId)) {
    return false;
  }
  if (input.bbox && !matchesBoundingBox(object, input.bbox, input.bboxMode ?? "intersects")) {
    return false;
  }
  if (input.style && !matchesStyle(object, input.style)) {
    return false;
  }
  if (input.link !== undefined && !(object.raw.link ?? "").includes(input.link)) {
    return false;
  }
  if (input.metadata && !matchesMetadata(object, input.metadata)) {
    return false;
  }

  return true;
}

function collectBoundText(controller: CanvasController): Map<string, string[]> {
  const byContainerId = new Map<string, string[]>();
  for (const summary of controller.listObjects("text")) {
    const object = controller.getObject(summary.id);
    if (!object?.containerId || !object.text) {
      continue;
    }

    byContainerId.set(object.containerId, [
      ...(byContainerId.get(object.containerId) ?? []),
      object.text,
    ]);
  }
  return byContainerId;
}

function textForSearch(
  object: CanvasObject,
  boundTextByContainerId?: Map<string, string[]>,
): string {
  return [object.text, ...(boundTextByContainerId?.get(object.id) ?? [])]
    .filter((text): text is string => Boolean(text))
    .join("\n");
}

function matchesBoundingBox(
  object: CanvasObject,
  bbox: NonNullable<FindObjectsInput["bbox"]>,
  mode: NonNullable<FindObjectsInput["bboxMode"]>,
): boolean {
  const objectRight = object.x + object.width;
  const objectBottom = object.y + object.height;
  const bboxRight = bbox.x + bbox.width;
  const bboxBottom = bbox.y + bbox.height;

  if (mode === "contains") {
    return (
      object.x >= bbox.x &&
      object.y >= bbox.y &&
      objectRight <= bboxRight &&
      objectBottom <= bboxBottom
    );
  }

  return (
    object.x <= bboxRight &&
    objectRight >= bbox.x &&
    object.y <= bboxBottom &&
    objectBottom >= bbox.y
  );
}

function matchesStyle(
  object: CanvasObject,
  style: NonNullable<FindObjectsInput["style"]>,
): boolean {
  return Object.entries(style).every(([field, value]) => {
    const styleField = field as keyof CanvasStyle;
    return object.style[styleField] === value;
  });
}

function matchesMetadata(
  object: CanvasObject,
  metadata: NonNullable<FindObjectsInput["metadata"]>,
): boolean {
  const customData = object.raw.customData ?? {};
  if (!Object.prototype.hasOwnProperty.call(customData, metadata.key)) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(metadata, "value")) {
    return customData[metadata.key] === metadata.value;
  }

  return true;
}

interface PatchResult {
  idMap: Record<string, string>;
  created: string[];
  updated: string[];
  deleted: string[];
  warnings: string[];
  objects?: CanvasObject[];
}

class DryRunComplete extends Error {
  constructor(readonly payload: PatchResult) {
    super("Dry run complete");
  }
}

function applyCanvasPatch(context: BaselineToolContext, input: ApplyCanvasPatchInput) {
  try {
    const result = context.controller.transaction(() => {
      const payload = executePatchOperations(context.controller, input);
      if (input.dryRun) {
        throw new DryRunComplete(payload);
      }
      return payload;
    });

    return textResult({ ...result, version: context.controller.currentVersion() });
  } catch (error) {
    if (error instanceof DryRunComplete) {
      return textResult({
        ...error.payload,
        dryRun: true,
        version: context.controller.currentVersion(),
      });
    }

    return errorResult(error);
  }
}

function executePatchOperations(
  controller: CanvasController,
  input: ApplyCanvasPatchInput,
): PatchResult {
  const idMap: Record<string, string> = {};
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const warnings: string[] = [];

  for (const operation of input.operations) {
    if (operation.op === "create") {
      if (operation.key && idMap[operation.key]) {
        throw new Error(`Duplicate patch key: ${operation.key}`);
      }

      const object = controller.createObject(
        resolveCreateSpec(operation.spec as CreateObjectSpec, idMap),
      );
      created.push(object.id);
      if (operation.key) {
        idMap[operation.key] = object.id;
      }
      continue;
    }

    if (operation.op === "update") {
      const id = resolveId(operation.id, idMap);
      const object = controller.updateObject(
        id,
        resolveUpdatePatch(operation.patch as UpdateObjectPatch, idMap),
      );
      if (!object) {
        throw new Error(`Object not found: ${id}`);
      }
      updated.push(object.id);
      continue;
    }

    const ids = operation.ids.map((id) => resolveId(id, idMap));
    assertObjectsExist(controller, ids);
    deleted.push(...controller.deleteObjects(ids));
  }

  const result: PatchResult = { idMap, created, updated, deleted, warnings };
  if (input.returnObjects) {
    result.objects = [...new Set([...created, ...updated])]
      .map((id) => controller.getObject(id))
      .filter((object): object is CanvasObject => Boolean(object));
  }

  return result;
}

function resolveCreateSpec(
  spec: CreateObjectSpec,
  idMap: Record<string, string>,
): CreateObjectSpec {
  return {
    ...spec,
    containerId: spec.containerId ? resolveId(spec.containerId, idMap) : undefined,
    start: resolveEndpoint(spec.start, idMap),
    end: resolveEndpoint(spec.end, idMap),
  };
}

function resolveUpdatePatch(
  patch: UpdateObjectPatch,
  idMap: Record<string, string>,
): UpdateObjectPatch {
  return {
    ...patch,
    containerId: patch.containerId ? resolveId(patch.containerId, idMap) : undefined,
    start: resolveEndpoint(patch.start, idMap),
    end: resolveEndpoint(patch.end, idMap),
  };
}

function resolveEndpoint<T extends CreateObjectSpec["start"] | undefined>(
  endpoint: T,
  idMap: Record<string, string>,
): T {
  if (!endpoint || !("elementId" in endpoint)) {
    return endpoint;
  }

  return { elementId: resolveId(endpoint.elementId, idMap) } as T;
}

function resolveId(id: string, idMap: Record<string, string>): string {
  return idMap[id] ?? id;
}

function assertObjectsExist(controller: CanvasController, ids: string[]): void {
  const missingIds = ids.filter((id) => !controller.getObject(id));
  if (missingIds.length > 0) {
    throw new Error(`Object not found: ${missingIds.join(", ")}`);
  }
}
