import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  CanvasObject,
  CanvasObjectType,
  CreateObjectSpec,
  UpdateObjectPatch,
} from "../core/scene.js";
import type { CanvasController } from "../server/canvasController.js";
import type { Workspace } from "../server/workspace.js";
import { canvasObjectTypeSchema, createObjectShape, updateObjectShape } from "./schemas.js";

export interface ExportResult {
  mimeType: string;
  base64: string;
}

export interface SelectionResult {
  selectedIds: string[];
}

export interface BaselineToolContext {
  controller: CanvasController;
  workspace: Workspace;
  clientsConnected(): number;
  requestExport(options: { exportPadding?: number }): Promise<ExportResult>;
  requestSelection(options?: { timeoutMs?: number }): Promise<SelectionResult>;
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
