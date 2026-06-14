import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PluginToolContext } from "../../core/plugin.js";
import type { CanvasObject, CreateObjectSpec, UpdateObjectPatch } from "../../core/scene.js";
import { endpointSchema, pointsSchema, styleSchema } from "../../mcp/schemas.js";
import { planFlowchart } from "./flowchart.js";
import { groupElements, removeFromFrame, setFrameOnChildren, ungroupElements } from "./index.js";
import {
  type LayoutObject,
  type LayoutUpdate,
  planAlignDistribute,
  planGridLayout,
} from "./layout.js";

const shapeInput = {
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  text: z.string().min(1).optional(),
  style: styleSchema.optional(),
};

const alignModeSchema = z.enum(["left", "center", "right", "top", "middle", "bottom"]);
const distributeModeSchema = z.enum(["horizontal", "vertical"]);
const autoLayoutModeSchema = z.enum(["grid", "tree", "layered-dag", "pack-frames", "swimlanes"]);

const layoutIdsInput = {
  ids: z.array(z.string()).min(1).optional(),
};

export function registerExcalidrawTools(server: McpServer, context: PluginToolContext): void {
  registerShapeTool(server, context, "draw_rectangle", "rectangle");
  registerShapeTool(server, context, "draw_ellipse", "ellipse");
  registerShapeTool(server, context, "draw_diamond", "diamond");

  server.registerTool(
    "draw_line",
    {
      description: "Draw an Excalidraw polyline.",
      inputSchema: {
        x: z.number(),
        y: z.number(),
        points: pointsSchema.min(2),
        style: styleSchema.optional(),
      },
    },
    async ({ x, y, points, style }) => {
      const object = context.controller.createObject({
        type: "line",
        x,
        y,
        points: points as CreateObjectSpec["points"],
        style,
      });
      return textResult({ id: object.id });
    },
  );

  server.registerTool(
    "connect_objects",
    {
      description: "Create one or more bound arrows between existing Excalidraw objects.",
      inputSchema: {
        edges: z
          .array(
            z.object({
              fromId: z.string(),
              toId: z.string(),
              label: z.string().min(1).optional(),
              style: styleSchema.optional(),
            }),
          )
          .min(1),
      },
    },
    async ({ edges }) => {
      try {
        const arrowIds = context.controller.transaction(() =>
          edges.map(
            (edge) =>
              context.controller.createObject({
                type: "arrow",
                x: 0,
                y: 0,
                start: { elementId: edge.fromId },
                end: { elementId: edge.toId },
                text: edge.label,
                style: edge.style,
              }).id,
          ),
        );
        return textResult({ arrowIds });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "draw_arrow",
    {
      description: "Draw an Excalidraw arrow, optionally bound to existing elements.",
      inputSchema: {
        start: endpointSchema,
        end: endpointSchema,
        text: z.string().optional(),
        style: styleSchema.optional(),
      },
    },
    async ({ start, end, text, style }) => {
      try {
        const id = context.controller.transaction(
          () =>
            context.controller.createObject({
              type: "arrow",
              x: "x" in start ? start.x : 0,
              y: "y" in start ? start.y : 0,
              start,
              end,
              text,
              style,
            }).id,
        );
        return textResult({ id });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "add_text",
    {
      description: "Add standalone text or a label bound to a container element.",
      inputSchema: {
        x: z.number().optional(),
        y: z.number().optional(),
        text: z.string().min(1),
        containerId: z.string().optional(),
        style: styleSchema.optional(),
      },
    },
    async ({ x, y, text, containerId, style }) => {
      const container = containerId ? context.controller.getObject(containerId) : undefined;
      if (containerId && !container) {
        return errorResult(`Object not found: ${containerId}`);
      }

      const object = context.controller.createObject({
        type: "text",
        x: x ?? (container ? container.x + 12 : 0),
        y: y ?? (container ? container.y + container.height / 2 - 12 : 0),
        width: container ? Math.max(40, container.width - 24) : undefined,
        text,
        containerId,
        style,
      });
      return textResult({ id: object.id });
    },
  );

  server.registerTool(
    "create_frame",
    {
      description: "Create a frame and optionally assign existing elements to it.",
      inputSchema: {
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
        name: z.string().min(1).optional(),
        childIds: z.array(z.string()).optional(),
      },
    },
    async ({ x, y, width, height, name, childIds }) => {
      const result = context.controller.transaction(() => {
        const frame = context.controller.createObject({
          type: "frame",
          x,
          y,
          width,
          height,
          text: name,
        });
        const updated = context.controller.mutateScene((scene) =>
          setFrameOnChildren(scene, childIds ?? [], frame.id),
        );
        return { id: frame.id, childIds: updated };
      });
      return textResult(result);
    },
  );

  server.registerTool(
    "group_objects",
    {
      description: "Group existing Excalidraw elements.",
      inputSchema: {
        ids: z.array(z.string()).min(2),
      },
    },
    async ({ ids }) => {
      try {
        return textResult(context.controller.mutateScene((scene) => groupElements(scene, ids)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "ungroup_objects",
    {
      description: "Remove one group, or all groups, from existing Excalidraw elements.",
      inputSchema: {
        ids: z.array(z.string()).min(1),
        groupId: z.string().optional(),
      },
    },
    async ({ ids, groupId }) => {
      try {
        return textResult(
          context.controller.mutateScene((scene) => ungroupElements(scene, ids, groupId)),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "remove_from_frame",
    {
      description: "Clear the frame assignment from existing Excalidraw elements.",
      inputSchema: {
        ids: z.array(z.string()).min(1),
      },
    },
    async ({ ids }) => {
      try {
        return textResult(context.controller.mutateScene((scene) => removeFromFrame(scene, ids)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "create_flowchart",
    {
      description: "Create a simple deterministic flowchart.",
      inputSchema: {
        nodes: z
          .array(
            z.object({
              id: z.string(),
              label: z.string().min(1),
              shape: z.enum(["rectangle", "ellipse", "diamond"]).optional(),
              x: z.number().optional(),
              y: z.number().optional(),
            }),
          )
          .min(1),
        edges: z.array(
          z.object({ from: z.string(), to: z.string(), label: z.string().min(1).optional() }),
        ),
        direction: z.enum(["TB", "LR"]).optional(),
        spacingX: z.number().positive().optional(),
        spacingY: z.number().positive().optional(),
      },
    },
    async (input) => {
      try {
        const plan = planFlowchart(input);
        const result = context.controller.transaction(() => {
          const nodeIds: Record<string, string> = {};
          for (const node of plan.nodes) {
            const object = context.controller.createObject(node.spec);
            nodeIds[node.key] = object.id;
          }

          const arrowIds: string[] = [];
          for (const edge of plan.edges) {
            const from = nodeIds[edge.from];
            const to = nodeIds[edge.to];
            if (!from || !to) {
              throw new Error(`Flowchart edge references missing node: ${edge.from} -> ${edge.to}`);
            }
            const arrow = context.controller.createObject({
              type: "arrow",
              x: 0,
              y: 0,
              start: { elementId: from },
              end: { elementId: to },
              text: edge.label,
            });
            arrowIds.push(arrow.id);
          }

          return { nodeIds, arrowIds };
        });

        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "align_distribute_objects",
    {
      description: "Align, distribute, or equalize existing Excalidraw objects.",
      inputSchema: {
        ...layoutIdsInput,
        align: alignModeSchema.optional(),
        distribute: distributeModeSchema.optional(),
        equalizeWidth: z.boolean().optional(),
        equalizeHeight: z.boolean().optional(),
        snapToGrid: z.number().positive().optional(),
      },
    },
    async ({ ids, align, distribute, equalizeWidth, equalizeHeight, snapToGrid }) => {
      if (!align && !distribute && !equalizeWidth && !equalizeHeight) {
        return errorResult("At least one alignment, distribution, or equalize option is required");
      }

      try {
        const objectIds = await resolveLayoutIds(context, ids);
        const warnings: string[] = [];
        const objects = collectLayoutObjects(context, objectIds, warnings);
        const updates = planAlignDistribute(objects, {
          align,
          distribute,
          equalizeWidth,
          equalizeHeight,
          snapToGrid,
        });
        const updated = applyLayoutUpdates(context, updates);
        return textResult({ updated, warnings });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "auto_layout_objects",
    {
      description: "Automatically lay out existing Excalidraw objects. Grid mode is supported.",
      inputSchema: {
        ...layoutIdsInput,
        mode: autoLayoutModeSchema,
        columns: z.number().int().positive().optional(),
        gapX: z.number().nonnegative().optional(),
        gapY: z.number().nonnegative().optional(),
        originX: z.number().optional(),
        originY: z.number().optional(),
      },
    },
    async ({ ids, mode, columns, gapX, gapY, originX, originY }) => {
      if (mode !== "grid") {
        return textResult({ mode, updated: [], warnings: [`mode '${mode}' not yet implemented`] });
      }

      try {
        const objectIds = await resolveLayoutIds(context, ids);
        const warnings: string[] = [];
        const objects = collectLayoutObjects(context, objectIds, warnings);
        const updates = planGridLayout(objects, { columns, gapX, gapY, originX, originY });
        const updated = applyLayoutUpdates(context, updates);
        return textResult({ mode, updated, warnings });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

function registerShapeTool(
  server: McpServer,
  context: PluginToolContext,
  name: "draw_rectangle" | "draw_ellipse" | "draw_diamond",
  type: CreateObjectSpec["type"],
): void {
  server.registerTool(
    name,
    {
      description: `Draw an Excalidraw ${type}.`,
      inputSchema: shapeInput,
    },
    async ({ x, y, width, height, text, style }) => {
      const object = context.controller.createObject({ type, x, y, width, height, text, style });
      return textResult({ id: object.id });
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

async function resolveLayoutIds(context: PluginToolContext, ids?: string[]): Promise<string[]> {
  if (ids) {
    return ids;
  }

  return (await context.requestSelection()).selectedIds;
}

function collectLayoutObjects(
  context: PluginToolContext,
  ids: string[],
  warnings: string[],
): LayoutObject[] {
  const objects: LayoutObject[] = [];
  for (const id of ids) {
    const object = context.controller.getObject(id);
    if (!object) {
      throw new Error(`Object not found: ${id}`);
    }

    const skipReason = layoutSkipReason(object);
    if (skipReason) {
      warnings.push(`${id}: ${skipReason}`);
      continue;
    }

    objects.push({
      id: object.id,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
    });
  }

  return objects;
}

function layoutSkipReason(object: CanvasObject): string | undefined {
  if (object.raw.locked) {
    return "locked objects are skipped";
  }
  if (object.type === "arrow" || object.type === "line") {
    return "linear objects are skipped";
  }
  if (object.containerId) {
    return "bound labels are skipped";
  }

  return undefined;
}

function applyLayoutUpdates(context: PluginToolContext, updates: LayoutUpdate[]): string[] {
  if (updates.length === 0) {
    return [];
  }

  return context.controller.transaction(() =>
    updates.map((update) => {
      const { id, ...patch } = update;
      const object = context.controller.updateObject(id, patch as UpdateObjectPatch);
      if (!object) {
        throw new Error(`Object not found: ${id}`);
      }
      return object.id;
    }),
  );
}
