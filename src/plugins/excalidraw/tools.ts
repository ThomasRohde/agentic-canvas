import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PluginToolContext } from "../../core/plugin.js";
import type { CreateObjectSpec } from "../../core/scene.js";
import { endpointSchema, pointsSchema, styleSchema } from "../../mcp/schemas.js";
import { planFlowchart } from "./flowchart.js";
import { groupElements, setFrameOnChildren } from "./index.js";

const shapeInput = {
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  text: z.string().optional(),
  style: styleSchema.optional(),
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
        text: z.string(),
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
        width: z.number(),
        height: z.number(),
        name: z.string().optional(),
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
        ids: z.array(z.string()).min(1),
      },
    },
    async ({ ids }) => {
      const groupId = context.controller.mutateScene((scene) => groupElements(scene, ids));
      return textResult({ groupId });
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
              label: z.string(),
              shape: z.enum(["rectangle", "ellipse", "diamond"]).optional(),
              x: z.number().optional(),
              y: z.number().optional(),
            }),
          )
          .min(1),
        edges: z.array(
          z.object({ from: z.string(), to: z.string(), label: z.string().optional() }),
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
