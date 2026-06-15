import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CanvasPlugin,
  CanvasPluginCapabilities,
  PluginToolContext,
} from "../../core/plugin.js";
import type {
  CanvasMetadata,
  CanvasObjectDetail,
  CanvasObjectSummary,
  Scene,
} from "../../core/scene.js";
import { getFlowObject, listFlowObjects } from "./adapter.js";
import { deserializeFlowDocument, serializeFlowDocument } from "./format.js";
import type { FlowAppState, FlowDocument } from "./model.js";
import { FLOW_DOCUMENT_TYPE, FLOW_DOCUMENT_VERSION, FLOW_EXTENSION } from "./model.js";
import { registerFlowTools } from "./tools.js";
import { validateFlowDocument } from "./validation.js";

export function createFlowPlugin(): CanvasPlugin {
  return {
    name: "flow",
    fileExtension: FLOW_EXTENSION,
    createInitialScene,
    getCapabilities,
    getMetadata,
    listObjects,
    getObject,
    deleteObjects,
    clear,
    normalizeBrowserScene,
    serialize,
    deserialize,
    registerTools,
  };
}

function createInitialScene(): Scene<FlowDocument, FlowAppState> {
  return {
    native: emptyDocument(),
    appState: {},
    version: 0,
  };
}

function getCapabilities(): CanvasPluginCapabilities {
  const pluginTools = [
    "add_flow_node",
    "add_port",
    "update_port",
    "delete_port",
    "connect_flow_nodes",
    "update_flow_node",
    "update_flow_edge",
    "find_flow_nodes",
    "find_flow_edges",
    "find_upstream",
    "find_downstream",
    "find_paths",
    "find_cycles",
    "validate_flow",
    "auto_layout_flow",
    "export_mermaid",
    "apply_flow_patch",
  ];
  return {
    pluginTools,
    preferredTools: {
      inspect: [
        "get_canvas_state",
        "get_canvas_capabilities",
        "list_objects",
        "get_object",
        "find_flow_nodes",
        "find_flow_edges",
        "validate_flow",
      ],
      create: ["add_flow_node", "add_port", "apply_flow_patch"],
      update: ["update_flow_node", "update_flow_edge", "update_port", "apply_flow_patch"],
      connect: ["connect_flow_nodes"],
      layout: ["auto_layout_flow"],
      file: ["save_canvas", "open_canvas", "screenshot", "export_mermaid"],
    },
    usageGuidance: [
      "Use Flow for typed system, workflow, data-lineage, and risk/control graphs.",
      "Prefer Flow-specific tools over generic shape tools; this canvas does not expose create_object or update_object.",
      "Use apply_flow_patch for large agent-generated graphs, then validate_flow and auto_layout_flow.",
      "Flow is an Agentic Canvas-native format, not BPMN, ArchiMate, UML, or C4 in v1.",
    ],
  };
}

function getMetadata(scene: Scene): CanvasMetadata {
  const document = native(scene);
  return {
    canvas: "flow",
    version: scene.version,
    objectCount:
      document.nodes.length +
      document.edges.length +
      document.nodes.reduce((count, node) => count + (node.ports?.length ?? 0), 0),
  };
}

function listObjects(scene: Scene, type?: string): CanvasObjectSummary[] {
  return listFlowObjects(native(scene), type);
}

function getObject(scene: Scene, id: string): CanvasObjectDetail | undefined {
  return getFlowObject(native(scene), id);
}

function deleteObjects(scene: Scene, ids: string[]): string[] {
  const document = native(scene);
  const idSet = new Set(ids);
  const deleted: string[] = [];
  const deletedNodeIds = new Set<string>();

  document.nodes = document.nodes.filter((node) => {
    if (idSet.has(node.id)) {
      deleted.push(node.id);
      deletedNodeIds.add(node.id);
      return false;
    }
    const beforePorts = node.ports?.length ?? 0;
    node.ports = (node.ports ?? []).filter((port) => {
      const objectId = `${node.id}#${port.id}`;
      if (idSet.has(objectId)) {
        deleted.push(objectId);
        return false;
      }
      return true;
    });
    if (beforePorts > 0 && node.ports.length === 0) {
      node.ports = undefined;
    }
    return true;
  });

  for (const node of document.nodes) {
    if (node.parentId && deletedNodeIds.has(node.parentId)) {
      node.parentId = undefined;
    }
  }

  document.edges = document.edges.filter((edge) => {
    if (
      idSet.has(edge.id) ||
      deletedNodeIds.has(edge.source) ||
      deletedNodeIds.has(edge.target) ||
      (edge.sourcePort && idSet.has(`${edge.source}#${edge.sourcePort}`)) ||
      (edge.targetPort && idSet.has(`${edge.target}#${edge.targetPort}`))
    ) {
      deleted.push(edge.id);
      if (idSet.has(edge.id) && edge.type === "contains") {
        const target = document.nodes.find((node) => node.id === edge.target);
        if (target?.parentId === edge.source) {
          target.parentId = undefined;
        }
      }
      return false;
    }
    return true;
  });

  return deleted;
}

function clear(scene: Scene): void {
  scene.native = emptyDocument();
  scene.appState = {};
}

function normalizeBrowserScene(
  incomingNative: unknown,
  appState: unknown,
): { native: FlowDocument; appState: Record<string, unknown> } {
  const result = validateFlowDocument(incomingNative);
  if (!result.valid) {
    throw new Error(result.errors.map((issue) => issue.message).join("; "));
  }
  return {
    native: result.document,
    appState: browserAppState(appState),
  };
}

function serialize(scene: Scene): string {
  return serializeFlowDocument(native(scene));
}

function deserialize(raw: string, options?: { repair?: boolean }): Scene {
  const result = deserializeFlowDocument(raw, options);
  return {
    native: result.document,
    appState: {},
    version: 0,
  };
}

function registerTools(server: McpServer, context: PluginToolContext): void {
  registerFlowTools(server, context);
}

function native(scene: Scene): FlowDocument {
  return scene.native as FlowDocument;
}

function emptyDocument(): FlowDocument {
  return { type: FLOW_DOCUMENT_TYPE, version: FLOW_DOCUMENT_VERSION, nodes: [], edges: [] };
}

function browserAppState(appState: unknown): Record<string, unknown> {
  const entries =
    typeof appState === "object" && appState !== null
      ? Object.entries(appState as Record<string, unknown>)
      : [];
  return Object.fromEntries(entries.filter(([key]) => key !== "selectedIds"));
}
