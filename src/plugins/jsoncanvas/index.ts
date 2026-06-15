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
import { getJsonCanvasObject, listJsonCanvasObjects } from "./adapter.js";
import { deserializeJsonCanvasDocument, serializeJsonCanvasDocument } from "./format.js";
import type {
  JsonCanvasAppState,
  JsonCanvasDocument,
  JsonCanvasEdge,
  JsonCanvasNode,
} from "./model.js";
import { JSON_CANVAS_EXTENSION } from "./model.js";
import { registerJsonCanvasTools } from "./tools.js";
import { validateJsonCanvasDocument } from "./validation.js";

const BROWSER_GEOMETRY_EPSILON = 4;

export function createJsonCanvasPlugin(): CanvasPlugin {
  return {
    name: "jsoncanvas",
    fileExtension: JSON_CANVAS_EXTENSION,
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

function createInitialScene(): Scene<JsonCanvasDocument, JsonCanvasAppState> {
  return {
    native: { nodes: [], edges: [] },
    appState: {},
    version: 0,
  };
}

function getCapabilities(): CanvasPluginCapabilities {
  return {
    pluginTools: [
      "add_text_card",
      "add_file_card",
      "add_link_card",
      "create_group",
      "connect_cards",
      "update_card",
      "update_edge",
      "find_cards",
      "find_edges",
      "auto_layout_cards",
      "apply_jsoncanvas_patch",
    ],
    preferredTools: {
      inspect: [
        "get_canvas_state",
        "get_canvas_capabilities",
        "find_cards",
        "find_edges",
        "list_objects",
        "get_object",
      ],
      create: [
        "add_text_card",
        "add_file_card",
        "add_link_card",
        "create_group",
        "apply_jsoncanvas_patch",
      ],
      update: ["update_card", "update_edge", "apply_jsoncanvas_patch"],
      connect: ["connect_cards"],
      layout: ["auto_layout_cards"],
      file: ["save_canvas", "open_canvas", "screenshot"],
    },
    usageGuidance: [
      "Use JSON Canvas for portable semantic knowledge maps made of text, file, link, and group cards.",
      "Prefer add_text_card, add_file_card, add_link_card, create_group, and connect_cards over generic shape tools.",
      "Use apply_jsoncanvas_patch for multi-card or multi-edge changes that need atomic rollback.",
    ],
  };
}

function getMetadata(scene: Scene): CanvasMetadata {
  const document = native(scene);
  return {
    canvas: "jsoncanvas",
    version: scene.version,
    objectCount: (document.nodes ?? []).length + (document.edges ?? []).length,
  };
}

function listObjects(scene: Scene, type?: string): CanvasObjectSummary[] {
  return listJsonCanvasObjects(native(scene), type);
}

function getObject(scene: Scene, id: string): CanvasObjectDetail | undefined {
  return getJsonCanvasObject(native(scene), id);
}

function deleteObjects(scene: Scene, ids: string[]): string[] {
  const document = native(scene);
  const idSet = new Set(ids);
  const nodeIds = new Set((document.nodes ?? []).map((node) => node.id));
  const deletedNodes = new Set<string>();
  const deletedEdges = new Set<string>();

  document.nodes = (document.nodes ?? []).filter((node) => {
    if (idSet.has(node.id)) {
      deletedNodes.add(node.id);
      return false;
    }
    return true;
  });

  document.edges = (document.edges ?? []).filter((edge) => {
    if (
      idSet.has(edge.id) ||
      deletedNodes.has(edge.fromNode) ||
      deletedNodes.has(edge.toNode) ||
      !nodeIds.has(edge.fromNode) ||
      !nodeIds.has(edge.toNode)
    ) {
      deletedEdges.add(edge.id);
      return false;
    }
    return true;
  });

  return [...deletedNodes, ...deletedEdges];
}

function clear(scene: Scene): void {
  scene.native = { nodes: [], edges: [] };
  scene.appState = {};
}

function normalizeBrowserScene(
  incomingNative: unknown,
  appState: unknown,
  currentScene: Scene,
): { native: JsonCanvasDocument; appState: Record<string, unknown> } {
  const result = validateJsonCanvasDocument(incomingNative);
  const currentDocument = native(currentScene);
  return {
    native: isTinyGeometryOnlyEcho(result.document, currentDocument)
      ? currentDocument
      : result.document,
    appState: browserAppState(appState),
  };
}

function browserAppState(appState: unknown): Record<string, unknown> {
  const entries =
    typeof appState === "object" && appState !== null
      ? Object.entries(appState as Record<string, unknown>)
      : [];
  return Object.fromEntries(entries.filter(([key]) => key !== "selectedIds"));
}

function serialize(scene: Scene): string {
  return serializeJsonCanvasDocument(native(scene));
}

function deserialize(raw: string, options?: { repair?: boolean }): Scene {
  const result = deserializeJsonCanvasDocument(raw, options);
  return {
    native: result.document,
    appState: {},
    version: 0,
  };
}

function registerTools(_server: McpServer, _context: PluginToolContext): void {
  registerJsonCanvasTools(_server, _context);
}

function native(scene: Scene): JsonCanvasDocument {
  return scene.native as JsonCanvasDocument;
}

function isTinyGeometryOnlyEcho(
  incoming: JsonCanvasDocument,
  current: JsonCanvasDocument,
): boolean {
  const incomingNodes = incoming.nodes ?? [];
  const currentNodes = current.nodes ?? [];
  const incomingEdges = incoming.edges ?? [];
  const currentEdges = current.edges ?? [];

  if (
    incomingNodes.length !== currentNodes.length ||
    incomingEdges.length !== currentEdges.length
  ) {
    return false;
  }

  const currentNodesById = new Map(currentNodes.map((node) => [node.id, node]));
  for (const incomingNode of incomingNodes) {
    const currentNode = currentNodesById.get(incomingNode.id);
    if (!currentNode) {
      return false;
    }
    if (!sameNodeContent(incomingNode, currentNode)) {
      return false;
    }
    if (
      !near(incomingNode.x, currentNode.x) ||
      !near(incomingNode.y, currentNode.y) ||
      !near(incomingNode.width, currentNode.width) ||
      !near(incomingNode.height, currentNode.height)
    ) {
      return false;
    }
  }

  const currentEdgesById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  for (const incomingEdge of incomingEdges) {
    const currentEdge = currentEdgesById.get(incomingEdge.id);
    if (!currentEdge || !sameEdge(incomingEdge, currentEdge)) {
      return false;
    }
  }

  return true;
}

function sameNodeContent(left: JsonCanvasNode, right: JsonCanvasNode): boolean {
  if (left.type !== right.type || left.color !== right.color) {
    return false;
  }
  if (left.type === "text" && right.type === "text") {
    return left.text === right.text;
  }
  if (left.type === "file" && right.type === "file") {
    return left.file === right.file && left.subpath === right.subpath;
  }
  if (left.type === "link" && right.type === "link") {
    return left.url === right.url;
  }
  if (left.type === "group" && right.type === "group") {
    return (
      left.label === right.label &&
      left.background === right.background &&
      left.backgroundStyle === right.backgroundStyle
    );
  }
  return false;
}

function sameEdge(left: JsonCanvasEdge, right: JsonCanvasEdge): boolean {
  return (
    left.fromNode === right.fromNode &&
    left.toNode === right.toNode &&
    left.fromSide === right.fromSide &&
    left.toSide === right.toSide &&
    left.fromEnd === right.fromEnd &&
    left.toEnd === right.toEnd &&
    left.color === right.color &&
    left.label === right.label
  );
}

function near(left: number, right: number): boolean {
  return Math.abs(left - right) <= BROWSER_GEOMETRY_EPSILON;
}
