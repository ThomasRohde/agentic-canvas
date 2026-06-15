import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MarkerType,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  JsonCanvasDocument,
  JsonCanvasEdge,
  JsonCanvasNode,
} from "../../../plugins/jsoncanvas/model.js";
import type {
  ExportRequestMessage,
  SceneSetMessage,
  SelectionRequestMessage,
  SelectionSetRequestMessage,
} from "../../../shared/protocol.js";
import { CanvasWsClient, type ConnectionState } from "../../wsClient.js";

interface JsonCanvasAppProps {
  mcpUrl: string;
}

type JsonFlowNode = Node<{ raw: JsonCanvasNode; label: string; kind: string }>;
type JsonFlowEdge = Edge<{ raw: JsonCanvasEdge }>;

export function JsonCanvasApp({ mcpUrl }: JsonCanvasAppProps) {
  return (
    <ReactFlowProvider>
      <JsonCanvasSurface mcpUrl={mcpUrl} />
    </ReactFlowProvider>
  );
}

function JsonCanvasSurface({ mcpUrl }: JsonCanvasAppProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [version, setVersion] = useState(0);
  const [nodes, setNodes] = useState<JsonFlowNode[]>([]);
  const [edges, setEdges] = useState<JsonFlowEdge[]>([]);
  const clientRef = useRef<CanvasWsClient | null>(null);
  const nodesRef = useRef<JsonFlowNode[]>([]);
  const edgesRef = useRef<JsonFlowEdge[]>([]);
  const appliedVersion = useRef(0);
  const applyingRemote = useRef(false);
  const selectedIds = useRef<string[]>([]);
  const changeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    const client = new CanvasWsClient({
      onStateChange: setConnectionState,
      onSceneSet: applyRemoteScene,
      onExportRequest: (message) => void handleExportRequest(message),
      onSelectionRequest: handleSelectionRequest,
      onSelectionSetRequest: handleSelectionSetRequest,
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      if (changeTimer.current) {
        window.clearTimeout(changeTimer.current);
      }
    };
  }, []);

  const applyRemoteScene = (message: SceneSetMessage) => {
    if (message.canvas !== "jsoncanvas") {
      return;
    }
    const document = normalizeDocument(message.scene);
    applyingRemote.current = true;
    const nextNodes = toFlowNodes(document.nodes ?? []);
    const nextEdges = toFlowEdges(document.edges ?? []);
    setNodes(nextNodes);
    setEdges(nextEdges);
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    appliedVersion.current = message.version;
    setVersion(message.version);
    window.setTimeout(() => {
      applyingRemote.current = false;
    }, 0);
  };

  const onNodesChange = (changes: NodeChange<JsonFlowNode>[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      scheduleSceneChanged(next, edgesRef.current);
      return next;
    });
  };

  const onEdgesChange = (changes: EdgeChange<JsonFlowEdge>[]) => {
    setEdges((current) => {
      const next = applyEdgeChanges(changes, current);
      scheduleSceneChanged(nodesRef.current, next);
      return next;
    });
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }
    const raw: JsonCanvasEdge = {
      id: `edge_${crypto.randomUUID().slice(0, 8)}`,
      fromNode: connection.source,
      toNode: connection.target,
      fromSide: handleToSide(connection.sourceHandle),
      toSide: handleToSide(connection.targetHandle),
      toEnd: "arrow",
    };
    setEdges((current) => {
      const next = addEdge(toFlowEdge(raw), current);
      scheduleSceneChanged(nodesRef.current, next);
      return next;
    });
  };

  const onSelectionChange = (selection: OnSelectionChangeParams<JsonFlowNode, JsonFlowEdge>) => {
    selectedIds.current = [
      ...selection.nodes.map((node) => node.id),
      ...selection.edges.map((edge) => edge.id),
    ];
  };

  const editNode = (_event: React.MouseEvent, node: JsonFlowNode) => {
    const updated = promptForNode(node.data.raw);
    if (!updated) {
      return;
    }
    setNodes((current) => {
      const next = current.map((candidate) =>
        candidate.id === node.id ? toFlowNode(updated, candidate.selected) : candidate,
      );
      scheduleSceneChanged(next, edgesRef.current);
      return next;
    });
  };

  const editEdge = (_event: React.MouseEvent, edge: JsonFlowEdge) => {
    const label = window.prompt("Edge label", edge.data?.raw.label ?? "");
    if (label === null) {
      return;
    }
    setEdges((current) => {
      const next = current.map((candidate) => {
        if (candidate.id !== edge.id) {
          return candidate;
        }
        const raw = { ...rawEdge(candidate), label: label.trim() || undefined };
        return toFlowEdge(raw, candidate.selected);
      });
      scheduleSceneChanged(nodesRef.current, next);
      return next;
    });
  };

  const scheduleSceneChanged = (nextNodes: JsonFlowNode[], nextEdges: JsonFlowEdge[]) => {
    if (applyingRemote.current) {
      return;
    }
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    if (changeTimer.current) {
      window.clearTimeout(changeTimer.current);
    }
    changeTimer.current = window.setTimeout(() => {
      clientRef.current?.sendSceneChanged(
        appliedVersion.current,
        "jsoncanvas",
        toJsonCanvasDocument(nodesRef.current, edgesRef.current),
        { selectedIds: selectedIds.current },
      );
    }, 150);
  };

  const handleExportRequest = async (message: ExportRequestMessage) => {
    try {
      const exported = exportJsonCanvasToPng(
        toJsonCanvasDocument(nodesRef.current, edgesRef.current),
        message.exportPadding ?? 16,
      );
      clientRef.current?.sendExportResult(message.id, exported.mimeType, exported.base64);
    } catch (error) {
      clientRef.current?.sendExportError(
        message.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleSelectionRequest = (message: SelectionRequestMessage) => {
    clientRef.current?.sendSelectionResult(message.id, selectedIds.current);
  };

  const handleSelectionSetRequest = (message: SelectionSetRequestMessage) => {
    const idSet = new Set(message.selectedIds);
    setNodes((current) => current.map((node) => ({ ...node, selected: idSet.has(node.id) })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: idSet.has(edge.id) })));
    selectedIds.current = message.selectedIds;
    clientRef.current?.sendSelectionSetResult(message.id, message.selectedIds);
  };

  const nodeTypes = useMemo(() => ({ jsonCanvasCard: JsonCanvasNodeCard }), []);

  return (
    <main className="canvas-shell">
      <div className="canvas-surface jsoncanvas-surface">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          onNodeDoubleClick={editNode}
          onEdgeDoubleClick={editEdge}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <footer className="status-bar">
        <span>Agentic Canvas</span>
        <span>Canvas: JSON Canvas</span>
        <span>MCP: {mcpUrl}</span>
        <span data-state={connectionState}>WS: {connectionState}</span>
        <span>Scene: v{version}</span>
      </footer>
    </main>
  );
}

function toFlowNodes(nodes: JsonCanvasNode[]): JsonFlowNode[] {
  return nodes.map((node) => toFlowNode(node));
}

function toFlowNode(node: JsonCanvasNode, selected?: boolean): JsonFlowNode {
  return {
    id: node.id,
    type: "jsonCanvasCard",
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    selected,
    data: {
      raw: node,
      label: nodeLabel(node),
      kind: node.type,
    },
    style: {
      width: node.width,
      height: node.height,
      background: node.type === "group" ? "rgba(226,232,240,0.55)" : colorForNode(node),
    },
  };
}

export function JsonCanvasNodeCard({ data }: NodeProps<JsonFlowNode>) {
  return (
    <div className={`jsoncanvas-card jsoncanvas-card-${data.kind}`}>
      <div className="jsoncanvas-card-label">{data.label}</div>
    </div>
  );
}

function toFlowEdges(edges: JsonCanvasEdge[]): JsonFlowEdge[] {
  return edges.map((edge) => toFlowEdge(edge));
}

function toFlowEdge(edge: JsonCanvasEdge, selected?: boolean): JsonFlowEdge {
  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    sourceHandle: edge.fromSide,
    targetHandle: edge.toSide,
    label: edge.label,
    selected,
    markerEnd: edge.toEnd === "none" ? undefined : { type: MarkerType.ArrowClosed },
    data: { raw: edge },
  };
}

function toJsonCanvasDocument(nodes: JsonFlowNode[], edges: JsonFlowEdge[]): JsonCanvasDocument {
  return {
    nodes: nodes.map((node) => {
      const raw = node.data.raw;
      return {
        ...raw,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        width: Math.round(readDimension(node.width, raw.width)),
        height: Math.round(readDimension(node.height, raw.height)),
      };
    }),
    edges: edges.map((edge) => ({
      ...rawEdge(edge),
      fromNode: edge.source,
      toNode: edge.target,
      fromSide: handleToSide(edge.sourceHandle),
      toSide: handleToSide(edge.targetHandle),
    })),
  };
}

function rawEdge(edge: JsonFlowEdge): JsonCanvasEdge {
  return edge.data?.raw ?? { id: edge.id, fromNode: edge.source, toNode: edge.target };
}

function normalizeDocument(scene: unknown): JsonCanvasDocument {
  if (typeof scene !== "object" || scene === null) {
    return { nodes: [], edges: [] };
  }
  const document = scene as JsonCanvasDocument;
  return {
    nodes: Array.isArray(document.nodes) ? document.nodes : [],
    edges: Array.isArray(document.edges) ? document.edges : [],
  };
}

function promptForNode(node: JsonCanvasNode): JsonCanvasNode | undefined {
  if (node.type === "text") {
    const text = window.prompt("Text", node.text);
    return text === null ? undefined : { ...node, text };
  }
  if (node.type === "file") {
    const file = window.prompt("File", node.file);
    return file === null ? undefined : { ...node, file };
  }
  if (node.type === "link") {
    const url = window.prompt("URL", node.url);
    return url === null ? undefined : { ...node, url };
  }
  const label = window.prompt("Group label", node.label ?? "");
  return label === null ? undefined : { ...node, label: label.trim() || undefined };
}

function nodeLabel(node: JsonCanvasNode): string {
  if (node.type === "text") {
    return node.text;
  }
  if (node.type === "file") {
    return `${node.file}${node.subpath ?? ""}`;
  }
  if (node.type === "link") {
    return node.url;
  }
  return node.label ?? "Group";
}

function colorForNode(node: JsonCanvasNode): string {
  if (!node.color) {
    return "#fffef7";
  }
  const preset: Record<string, string> = {
    "1": "#fee2e2",
    "2": "#ffedd5",
    "3": "#fef9c3",
    "4": "#dcfce7",
    "5": "#dbeafe",
    "6": "#f3e8ff",
  };
  return preset[node.color] ?? node.color;
}

function handleToSide(value: string | null | undefined): JsonCanvasEdge["fromSide"] {
  return value === "top" || value === "right" || value === "bottom" || value === "left"
    ? value
    : undefined;
}

function readDimension(value: number | string | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function exportJsonCanvasToPng(document: JsonCanvasDocument, padding: number) {
  const nodes = document.nodes ?? [];
  const canvas = globalThis.document.createElement("canvas");
  const bounds = boundsForNodes(nodes);
  const width = Math.max(1, bounds.width + padding * 2);
  const height = Math.max(1, bounds.height + padding * 2);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas export context is unavailable");
  }
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, width, height);
  context.translate(padding - bounds.x, padding - bounds.y);
  context.strokeStyle = "#475569";
  context.fillStyle = "#475569";
  context.font = "13px sans-serif";
  for (const edge of document.edges ?? []) {
    const from = nodes.find((node) => node.id === edge.fromNode);
    const to = nodes.find((node) => node.id === edge.toNode);
    if (!from || !to) {
      continue;
    }
    const start = { x: from.x + from.width, y: from.y + from.height / 2 };
    const end = { x: to.x, y: to.y + to.height / 2 };
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    if (edge.label) {
      context.fillText(edge.label, (start.x + end.x) / 2 + 4, (start.y + end.y) / 2 - 4);
    }
  }
  for (const node of nodes) {
    context.fillStyle = colorForNode(node);
    context.strokeStyle = node.type === "group" ? "#64748b" : "#334155";
    context.fillRect(node.x, node.y, node.width, node.height);
    context.strokeRect(node.x, node.y, node.width, node.height);
    context.fillStyle = "#0f172a";
    context.fillText(nodeLabel(node).slice(0, 80), node.x + 10, node.y + 24);
  }
  return {
    mimeType: "image/png",
    base64: canvas.toDataURL("image/png").split(",")[1] ?? "",
  };
}

function boundsForNodes(nodes: JsonCanvasNode[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
