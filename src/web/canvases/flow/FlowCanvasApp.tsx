import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FlowDocument,
  FlowEdge,
  FlowEdgeStatus,
  FlowEdgeType,
  FlowNode,
  FlowNodeStatus,
  FlowNodeType,
  FlowPort,
} from "../../../plugins/flow/model.js";
import {
  FLOW_DOCUMENT_TYPE,
  FLOW_DOCUMENT_VERSION,
  FLOW_EDGE_TYPES,
  FLOW_NODE_DEFAULTS,
  FLOW_NODE_STATUSES,
  FLOW_NODE_TYPES,
  flowNodeBounds,
} from "../../../plugins/flow/model.js";
import type {
  ExportRequestMessage,
  SceneSetMessage,
  SelectionRequestMessage,
  SelectionSetRequestMessage,
} from "../../../shared/protocol.js";
import { CanvasWsClient, type ConnectionState } from "../../wsClient.js";

interface FlowCanvasAppProps {
  mcpUrl: string;
}

export type FlowGraphNode = Node<{
  raw: FlowNode;
  label: string;
  nodeType: FlowNodeType;
}>;
export type FlowGraphEdge = Edge<{ raw: FlowEdge }>;

export function FlowCanvasApp({ mcpUrl }: FlowCanvasAppProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasSurface mcpUrl={mcpUrl} />
    </ReactFlowProvider>
  );
}

function FlowCanvasSurface({ mcpUrl }: FlowCanvasAppProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [version, setVersion] = useState(0);
  const [nodes, setNodes] = useState<FlowGraphNode[]>([]);
  const [edges, setEdges] = useState<FlowGraphEdge[]>([]);
  const [inspectorId, setInspectorId] = useState<string | undefined>();
  const clientRef = useRef<CanvasWsClient | null>(null);
  const nodesRef = useRef<FlowGraphNode[]>([]);
  const edgesRef = useRef<FlowGraphEdge[]>([]);
  const appliedVersion = useRef(0);
  const applyingRemote = useRef(false);
  const selectedIds = useRef<string[]>([]);
  const programmaticSelection = useRef<string[] | undefined>(undefined);
  const programmaticSelectionTimer = useRef<number | undefined>(undefined);
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
      if (programmaticSelectionTimer.current) {
        window.clearTimeout(programmaticSelectionTimer.current);
      }
    };
  }, []);

  const applyRemoteScene = (message: SceneSetMessage) => {
    if (message.canvas !== "flow") {
      return;
    }
    const document = normalizeDocument(message.scene);
    applyingRemote.current = true;
    const nextNodes = toReactFlowNodes(document.nodes);
    const nextEdges = toReactFlowEdges(document.edges);
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

  const onNodesChange = (changes: NodeChange<FlowGraphNode>[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      nodesRef.current = next;
      if (shouldSyncNodeChanges(changes)) {
        scheduleSceneChanged(next, edgesRef.current);
      }
      return next;
    });
  };

  const onEdgesChange = (changes: EdgeChange<FlowGraphEdge>[]) => {
    setEdges((current) => {
      const next = applyEdgeChanges(changes, current);
      edgesRef.current = next;
      if (shouldSyncEdgeChanges(changes)) {
        scheduleSceneChanged(nodesRef.current, next);
      }
      return next;
    });
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }
    const raw: FlowEdge = {
      id: `edge_${crypto.randomUUID().slice(0, 8)}`,
      type: "generic",
      source: connection.source,
      target: connection.target,
      sourcePort: reactHandleToFlowPort(connection.sourceHandle),
      targetPort: reactHandleToFlowPort(connection.targetHandle),
    };
    setEdges((current) => {
      const next = addEdge(toReactFlowEdge(raw), current);
      edgesRef.current = next;
      scheduleSceneChanged(nodesRef.current, next);
      return next;
    });
  };

  const onSelectionChange = (selection: OnSelectionChangeParams<FlowGraphNode, FlowGraphEdge>) => {
    const nextSelectedIds = [
      ...selection.nodes.map((node) => node.id),
      ...selection.edges.map((edge) => edge.id),
    ];
    const resolved = resolveSelectionChange(nextSelectedIds, programmaticSelection.current);
    selectedIds.current = resolved.selectedIds;
    setInspectorId(resolved.selectedIds[0]);
    if (resolved.keepProgrammaticSelection) {
      return;
    }
    if (programmaticSelection.current) {
      clearProgrammaticSelection();
    }
  };

  const scheduleSceneChanged = (nextNodes: FlowGraphNode[], nextEdges: FlowGraphEdge[]) => {
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
        "flow",
        toFlowDocument(nodesRef.current, edgesRef.current),
        { selectedIds: selectedIds.current },
      );
    }, 175);
  };

  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    setNodes((current) => {
      const next = current.map((node) => {
        if (node.id !== id) {
          return node;
        }
        return toReactFlowNode({ ...node.data.raw, ...patch }, node.selected);
      });
      nodesRef.current = next;
      scheduleSceneChanged(next, edgesRef.current);
      return next;
    });
  };

  const updateEdge = (id: string, patch: Partial<FlowEdge>) => {
    setEdges((current) => {
      const next = current.map((edge) => {
        if (edge.id !== id) {
          return edge;
        }
        return toReactFlowEdge({ ...rawEdge(edge), ...patch }, edge.selected);
      });
      edgesRef.current = next;
      scheduleSceneChanged(nodesRef.current, next);
      return next;
    });
  };

  const addPort = (nodeId: string, direction: FlowPort["direction"], side: FlowPort["side"]) => {
    const node = nodesRef.current.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    const port: FlowPort = {
      id: `port_${crypto.randomUUID().slice(0, 8)}`,
      direction,
      side,
    };
    updateNode(nodeId, { ports: [...(node.data.raw.ports ?? []), port] });
  };

  const removePort = (nodeId: string, portId: string) => {
    const node = nodesRef.current.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    updateNode(nodeId, {
      ports: (node.data.raw.ports ?? []).filter((port) => port.id !== portId),
    });
    setEdges((current) => {
      const next = current.map((edge) =>
        toReactFlowEdge({
          ...rawEdge(edge),
          sourcePort:
            edge.source === nodeId && reactHandleToFlowPort(edge.sourceHandle) === portId
              ? undefined
              : rawEdge(edge).sourcePort,
          targetPort:
            edge.target === nodeId && reactHandleToFlowPort(edge.targetHandle) === portId
              ? undefined
              : rawEdge(edge).targetPort,
        }),
      );
      edgesRef.current = next;
      scheduleSceneChanged(nodesRef.current, next);
      return next;
    });
  };

  const handleExportRequest = async (message: ExportRequestMessage) => {
    try {
      const exported = exportFlowToPng(
        toFlowDocument(nodesRef.current, edgesRef.current),
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
    const nextNodes = nodesRef.current.map((node) => ({ ...node, selected: idSet.has(node.id) }));
    const nextEdges = edgesRef.current.map((edge) => ({ ...edge, selected: idSet.has(edge.id) }));
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    selectedIds.current = message.selectedIds;
    setInspectorId(message.selectedIds[0]);
    programmaticSelection.current = message.selectedIds;
    if (programmaticSelectionTimer.current) {
      window.clearTimeout(programmaticSelectionTimer.current);
    }
    programmaticSelectionTimer.current = window.setTimeout(clearProgrammaticSelection, 500);
    setNodes(nextNodes);
    setEdges(nextEdges);
    clientRef.current?.sendSelectionSetResult(message.id, message.selectedIds);
  };

  const clearProgrammaticSelection = () => {
    programmaticSelection.current = undefined;
    if (programmaticSelectionTimer.current) {
      window.clearTimeout(programmaticSelectionTimer.current);
      programmaticSelectionTimer.current = undefined;
    }
  };

  const nodeTypes = useMemo(() => ({ flowNode: FlowNodeCard, boundary: FlowBoundaryNode }), []);
  const selectedNode = nodes.find((node) => node.id === inspectorId);
  const selectedEdge = edges.find((edge) => edge.id === inspectorId);

  return (
    <main className="canvas-shell flow-shell">
      <div className="canvas-surface flow-surface">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <FlowInspector
          node={selectedNode}
          edge={selectedEdge}
          onNodeChange={updateNode}
          onEdgeChange={updateEdge}
          onAddPort={addPort}
          onRemovePort={removePort}
        />
      </div>
      <footer className="status-bar">
        <span>Agentic Canvas</span>
        <span>Canvas: Flow</span>
        <span>MCP: {mcpUrl}</span>
        <span data-state={connectionState}>WS: {connectionState}</span>
        <span>Scene: v{version}</span>
      </footer>
    </main>
  );
}

export function FlowNodeCard({ data }: NodeProps<FlowGraphNode>) {
  const node = data.raw;
  const ports = node.ports ?? [];
  return (
    <div
      className={`flow-node-card flow-node-${data.nodeType}`}
      data-status={node.status ?? "unknown"}
    >
      <FlowDefaultHandle type="target" />
      {ports.map((port) => (
        <FlowPortHandle key={`${port.id}-target`} port={port} type="target" />
      ))}
      <div className="flow-node-heading">
        <span>{data.nodeType}</span>
        <strong>{data.label}</strong>
      </div>
      {node.description ? <p>{node.description}</p> : null}
      {node.tags?.length ? <div className="flow-node-tags">{node.tags.join(", ")}</div> : null}
      {ports.map((port) => (
        <FlowPortHandle key={`${port.id}-source`} port={port} type="source" />
      ))}
      <FlowDefaultHandle type="source" />
    </div>
  );
}

export function FlowBoundaryNode({ data }: NodeProps<FlowGraphNode>) {
  return (
    <div className="flow-boundary-card">
      <FlowDefaultHandle type="target" />
      <span>{data.raw.status ?? "boundary"}</span>
      <strong>{data.label}</strong>
      <FlowDefaultHandle type="source" />
    </div>
  );
}

function FlowDefaultHandle({ type }: { type: "source" | "target" }) {
  const side = type === "source" ? "right" : "left";
  return (
    <Handle
      type={type}
      position={type === "source" ? Position.Right : Position.Left}
      className={`flow-port flow-port-default flow-port-${side}`}
      title={`${type} edge`}
    />
  );
}

function FlowPortHandle({ port, type }: { port: FlowPort; type: "source" | "target" }) {
  if (type === "source" && port.direction === "in") {
    return null;
  }
  if (type === "target" && port.direction === "out") {
    return null;
  }
  return (
    <Handle
      id={flowPortToReactHandle(type, port.id)}
      type={type}
      position={positionForSide(port.side)}
      className={`flow-port flow-port-${port.side}`}
      title={port.label ?? port.id}
    />
  );
}

function FlowInspector({
  node,
  edge,
  onNodeChange,
  onEdgeChange,
  onAddPort,
  onRemovePort,
}: {
  node?: FlowGraphNode;
  edge?: FlowGraphEdge;
  onNodeChange(id: string, patch: Partial<FlowNode>): void;
  onEdgeChange(id: string, patch: Partial<FlowEdge>): void;
  onAddPort(nodeId: string, direction: FlowPort["direction"], side: FlowPort["side"]): void;
  onRemovePort(nodeId: string, portId: string): void;
}) {
  if (!node && !edge) {
    return <aside className="flow-inspector" />;
  }
  if (node) {
    const raw = node.data.raw;
    return (
      <aside className="flow-inspector">
        <input
          aria-label="Node label"
          value={raw.label}
          onChange={(event) => onNodeChange(raw.id, { label: event.target.value })}
        />
        <select
          aria-label="Node type"
          value={raw.type}
          onChange={(event) => onNodeChange(raw.id, { type: event.target.value as FlowNodeType })}
        >
          {FLOW_NODE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          aria-label="Node status"
          value={raw.status ?? "unknown"}
          onChange={(event) =>
            onNodeChange(raw.id, { status: event.target.value as FlowNodeStatus })
          }
        >
          {FLOW_NODE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <textarea
          aria-label="Node description"
          value={raw.description ?? ""}
          onChange={(event) =>
            onNodeChange(raw.id, { description: event.target.value || undefined })
          }
        />
        <input
          aria-label="Owner"
          value={raw.owner ?? ""}
          onChange={(event) => onNodeChange(raw.id, { owner: event.target.value || undefined })}
        />
        <input
          aria-label="System"
          value={raw.system ?? ""}
          onChange={(event) => onNodeChange(raw.id, { system: event.target.value || undefined })}
        />
        <input
          aria-label="Tags"
          value={(raw.tags ?? []).join(", ")}
          onChange={(event) =>
            onNodeChange(raw.id, {
              tags: event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
        />
        <div className="flow-inspector-ports">
          {(raw.ports ?? []).map((port) => (
            <div key={port.id} className="flow-inspector-port">
              <span>{port.label ?? port.id}</span>
              <button type="button" onClick={() => onRemovePort(raw.id, port.id)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onAddPort(raw.id, "in", "left")}>
            Add input
          </button>
          <button type="button" onClick={() => onAddPort(raw.id, "out", "right")}>
            Add output
          </button>
        </div>
      </aside>
    );
  }

  const raw = edge?.data?.raw;
  if (!edge || !raw) {
    return null;
  }
  return (
    <aside className="flow-inspector">
      <input
        aria-label="Edge label"
        value={raw.label ?? ""}
        onChange={(event) => onEdgeChange(raw.id, { label: event.target.value || undefined })}
      />
      <select
        aria-label="Edge type"
        value={raw.type}
        onChange={(event) => onEdgeChange(raw.id, { type: event.target.value as FlowEdgeType })}
      >
        {FLOW_EDGE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select
        aria-label="Edge status"
        value={raw.status ?? "unknown"}
        onChange={(event) => onEdgeChange(raw.id, { status: event.target.value as FlowEdgeStatus })}
      >
        {["unknown", "proposed", "active", "deprecated"].map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <textarea
        aria-label="Edge description"
        value={raw.description ?? ""}
        onChange={(event) => onEdgeChange(raw.id, { description: event.target.value || undefined })}
      />
    </aside>
  );
}

export function toReactFlowNodes(nodes: FlowNode[]): FlowGraphNode[] {
  return nodes.map((node) => toReactFlowNode(node));
}

export function toReactFlowNode(node: FlowNode, selected?: boolean): FlowGraphNode {
  const bounds = flowNodeBounds(node);
  return {
    id: node.id,
    type: node.type === "boundary" ? "boundary" : "flowNode",
    position: { x: node.x, y: node.y },
    parentId: node.parentId,
    width: bounds.width,
    height: bounds.height,
    selected,
    data: { raw: node, label: node.label, nodeType: node.type },
    style: { width: bounds.width, height: bounds.height },
  };
}

export function toReactFlowEdges(edges: FlowEdge[]): FlowGraphEdge[] {
  return edges.map((edge) => toReactFlowEdge(edge));
}

export function toReactFlowEdge(edge: FlowEdge, selected?: boolean): FlowGraphEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourcePort ? flowPortToReactHandle("source", edge.sourcePort) : undefined,
    targetHandle: edge.targetPort ? flowPortToReactHandle("target", edge.targetPort) : undefined,
    label: edge.label ?? edge.type,
    selected,
    animated: edge.status === "proposed",
    markerEnd: edge.direction === "bidirectional" ? undefined : { type: MarkerType.ArrowClosed },
    markerStart: edge.direction === "bidirectional" ? { type: MarkerType.ArrowClosed } : undefined,
    data: { raw: edge },
  };
}

export function toFlowDocument(nodes: FlowGraphNode[], edges: FlowGraphEdge[]): FlowDocument {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    type: FLOW_DOCUMENT_TYPE,
    version: FLOW_DOCUMENT_VERSION,
    nodes: nodes.map((node) => {
      const raw = node.data.raw;
      return {
        ...raw,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        width: Math.round(readNumber(node.width, raw.width ?? FLOW_NODE_DEFAULTS[raw.type].width)),
        height: Math.round(
          readNumber(node.height, raw.height ?? FLOW_NODE_DEFAULTS[raw.type].height),
        ),
      };
    }),
    edges: edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({
        ...rawEdge(edge),
        source: edge.source,
        target: edge.target,
        sourcePort: reactHandleToFlowPort(edge.sourceHandle),
        targetPort: reactHandleToFlowPort(edge.targetHandle),
      })),
  };
}

function flowPortToReactHandle(type: "source" | "target", portId: string): string {
  return `${type}:${portId}`;
}

function reactHandleToFlowPort(handleId: string | null | undefined): string | undefined {
  if (!handleId) {
    return undefined;
  }
  const separator = handleId.indexOf(":");
  return separator >= 0 ? handleId.slice(separator + 1) : handleId;
}

export function shouldSyncNodeChanges(changes: NodeChange<FlowGraphNode>[]): boolean {
  return changes.some((change) => change.type !== "select" && change.type !== "dimensions");
}

export function shouldSyncEdgeChanges(changes: EdgeChange<FlowGraphEdge>[]): boolean {
  return changes.some((change) => change.type !== "select");
}

export function resolveSelectionChange(
  nextSelectedIds: string[],
  expectedProgrammaticSelection?: string[],
): { selectedIds: string[]; keepProgrammaticSelection: boolean } {
  if (
    expectedProgrammaticSelection &&
    !sameStringSet(nextSelectedIds, expectedProgrammaticSelection)
  ) {
    return { selectedIds: expectedProgrammaticSelection, keepProgrammaticSelection: true };
  }
  return { selectedIds: nextSelectedIds, keepProgrammaticSelection: false };
}

function rawEdge(edge: FlowGraphEdge): FlowEdge {
  return (
    edge.data?.raw ?? { id: edge.id, type: "generic", source: edge.source, target: edge.target }
  );
}

function normalizeDocument(scene: unknown): FlowDocument {
  if (typeof scene !== "object" || scene === null) {
    return { type: FLOW_DOCUMENT_TYPE, version: FLOW_DOCUMENT_VERSION, nodes: [], edges: [] };
  }
  const document = scene as FlowDocument;
  return {
    type: FLOW_DOCUMENT_TYPE,
    version: FLOW_DOCUMENT_VERSION,
    settings: document.settings,
    nodes: Array.isArray(document.nodes) ? document.nodes : [],
    edges: Array.isArray(document.edges) ? document.edges : [],
  };
}

function positionForSide(side: FlowPort["side"]): Position {
  if (side === "top") {
    return Position.Top;
  }
  if (side === "bottom") {
    return Position.Bottom;
  }
  if (side === "left") {
    return Position.Left;
  }
  return Position.Right;
}

function readNumber(value: number | string | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

function exportFlowToPng(document: FlowDocument, padding: number) {
  const canvas = globalThis.document.createElement("canvas");
  const bounds = boundsForNodes(document.nodes);
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
  context.font = "13px sans-serif";
  context.strokeStyle = "#475569";
  context.fillStyle = "#475569";
  for (const edge of document.edges) {
    const source = document.nodes.find((node) => node.id === edge.source);
    const target = document.nodes.find((node) => node.id === edge.target);
    if (!source || !target) {
      continue;
    }
    const sourceBounds = flowNodeBounds(source);
    const targetBounds = flowNodeBounds(target);
    const start = {
      x: sourceBounds.x + sourceBounds.width,
      y: sourceBounds.y + sourceBounds.height / 2,
    };
    const end = { x: targetBounds.x, y: targetBounds.y + targetBounds.height / 2 };
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.fillText(edge.label ?? edge.type, (start.x + end.x) / 2 + 4, (start.y + end.y) / 2 - 4);
  }
  for (const node of document.nodes) {
    const nodeBounds = flowNodeBounds(node);
    context.fillStyle = colorForNode(node);
    context.strokeStyle = node.type === "boundary" ? "#64748b" : "#334155";
    context.fillRect(nodeBounds.x, nodeBounds.y, nodeBounds.width, nodeBounds.height);
    context.strokeRect(nodeBounds.x, nodeBounds.y, nodeBounds.width, nodeBounds.height);
    context.fillStyle = "#0f172a";
    context.fillText(node.label.slice(0, 80), nodeBounds.x + 10, nodeBounds.y + 24);
    context.fillText(node.status ?? node.type, nodeBounds.x + 10, nodeBounds.y + 44);
  }
  return {
    mimeType: "image/png",
    base64: canvas.toDataURL("image/png").split(",")[1] ?? "",
  };
}

function boundsForNodes(nodes: FlowNode[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const bounds = nodes.map(flowNodeBounds);
  const left = Math.min(...bounds.map((node) => node.x));
  const top = Math.min(...bounds.map((node) => node.y));
  const right = Math.max(...bounds.map((node) => node.x + node.width));
  const bottom = Math.max(...bounds.map((node) => node.y + node.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function colorForNode(node: FlowNode): string {
  if (node.type === "boundary") {
    return "rgba(226,232,240,0.55)";
  }
  if (node.status === "at-risk") {
    return "#fee2e2";
  }
  if (node.status === "proposed") {
    return "#fef9c3";
  }
  if (node.type === "database") {
    return "#dbeafe";
  }
  if (node.type === "queue" || node.type === "topic") {
    return "#dcfce7";
  }
  if (node.type === "risk" || node.type === "control") {
    return "#ffedd5";
  }
  return "#fffef7";
}
