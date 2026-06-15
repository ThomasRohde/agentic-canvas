import type { FlowDocument, FlowEdge, FlowEdgeType, FlowNode } from "./model.js";

export interface FlowGraphIndex {
  nodesById: Map<string, FlowNode>;
  edgesById: Map<string, FlowEdge>;
  outgoing: Map<string, FlowEdge[]>;
  incoming: Map<string, FlowEdge[]>;
}

export interface FlowPath {
  nodeIds: string[];
  edgeIds: string[];
}

const DEFAULT_DEPTH = 8;
const DEFAULT_LIMIT = 20;
const MAX_TRAVERSAL_STEPS = 10_000;

export function buildFlowGraphIndex(document: FlowDocument): FlowGraphIndex {
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(document.edges.map((edge) => [edge.id, edge]));
  const outgoing = new Map<string, FlowEdge[]>();
  const incoming = new Map<string, FlowEdge[]>();

  for (const edge of sortedEdges(document.edges)) {
    addEdge(outgoing, edge.source, edge);
    addEdge(incoming, edge.target, edge);
    if (edge.direction === "bidirectional") {
      addEdge(outgoing, edge.target, edge);
      addEdge(incoming, edge.source, edge);
    }
  }

  return { nodesById, edgesById, outgoing, incoming };
}

export function findUpstream(
  document: FlowDocument,
  nodeId: string,
  options: { depth?: number; edgeTypes?: FlowEdgeType[]; includeEdges?: boolean } = {},
): { nodeIds: string[]; edgeIds?: string[] } {
  return traverse(document, nodeId, "incoming", options);
}

export function findDownstream(
  document: FlowDocument,
  nodeId: string,
  options: { depth?: number; edgeTypes?: FlowEdgeType[]; includeEdges?: boolean } = {},
): { nodeIds: string[]; edgeIds?: string[] } {
  return traverse(document, nodeId, "outgoing", options);
}

export function findPaths(
  document: FlowDocument,
  from: string,
  to: string,
  options: { maxDepth?: number; edgeTypes?: FlowEdgeType[]; limit?: number } = {},
): FlowPath[] {
  const index = buildFlowGraphIndex(document);
  const maxDepth = options.maxDepth ?? DEFAULT_DEPTH;
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT);
  const allowedEdgeTypes = options.edgeTypes ? new Set(options.edgeTypes) : undefined;
  const paths: FlowPath[] = [];
  let steps = 0;

  const visit = (nodeId: string, nodeIds: string[], edgeIds: string[]) => {
    steps += 1;
    if (steps > MAX_TRAVERSAL_STEPS || paths.length >= limit) {
      return;
    }
    if (nodeId === to) {
      paths.push({ nodeIds, edgeIds });
      return;
    }
    if (edgeIds.length >= maxDepth) {
      return;
    }
    for (const edge of filteredEdges(index.outgoing.get(nodeId) ?? [], allowedEdgeTypes)) {
      const nextNodeId = oppositeNode(edge, nodeId, "outgoing");
      if (nodeIds.includes(nextNodeId)) {
        continue;
      }
      visit(nextNodeId, [...nodeIds, nextNodeId], [...edgeIds, edge.id]);
    }
  };

  if (index.nodesById.has(from) && index.nodesById.has(to)) {
    visit(from, [from], []);
  }
  return paths;
}

export function findCycles(
  document: FlowDocument,
  options: { edgeTypes?: FlowEdgeType[]; limit?: number } = {},
): string[][] {
  const index = buildFlowGraphIndex(document);
  const allowedEdgeTypes = options.edgeTypes ? new Set(options.edgeTypes) : undefined;
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT);
  const cycles: string[][] = [];
  const seenCycles = new Set<string>();
  let steps = 0;

  const visit = (startId: string, nodeId: string, path: string[]) => {
    steps += 1;
    if (steps > MAX_TRAVERSAL_STEPS || cycles.length >= limit) {
      return;
    }
    for (const edge of filteredEdges(index.outgoing.get(nodeId) ?? [], allowedEdgeTypes)) {
      const nextNodeId = oppositeNode(edge, nodeId, "outgoing");
      if (nextNodeId === startId && path.length > 1) {
        const cycle = canonicalCycle([...path, startId]);
        const key = cycle.join(">");
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          cycles.push(cycle);
        }
        continue;
      }
      if (path.includes(nextNodeId) || nextNodeId.localeCompare(startId) < 0) {
        continue;
      }
      visit(startId, nextNodeId, [...path, nextNodeId]);
    }
  };

  for (const node of sortedNodes(document.nodes)) {
    visit(node.id, node.id, [node.id]);
    if (cycles.length >= limit) {
      break;
    }
  }
  return cycles;
}

function traverse(
  document: FlowDocument,
  nodeId: string,
  direction: "incoming" | "outgoing",
  options: { depth?: number; edgeTypes?: FlowEdgeType[]; includeEdges?: boolean },
): { nodeIds: string[]; edgeIds?: string[] } {
  const index = buildFlowGraphIndex(document);
  const maxDepth = options.depth ?? DEFAULT_DEPTH;
  const allowedEdgeTypes = options.edgeTypes ? new Set(options.edgeTypes) : undefined;
  const visited = new Set<string>();
  const edgeIds = new Set<string>();
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId, depth: 0 }];
  let steps = 0;

  while (queue.length > 0 && steps < MAX_TRAVERSAL_STEPS) {
    steps += 1;
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) {
      continue;
    }
    const edges = filteredEdges(index[direction].get(current.nodeId) ?? [], allowedEdgeTypes);
    for (const edge of edges) {
      edgeIds.add(edge.id);
      const nextNodeId = oppositeNode(edge, current.nodeId, direction);
      if (!visited.has(nextNodeId) && nextNodeId !== nodeId) {
        visited.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }

  return {
    nodeIds: [...visited].sort(),
    edgeIds: options.includeEdges ? [...edgeIds].sort() : undefined,
  };
}

function addEdge(map: Map<string, FlowEdge[]>, nodeId: string, edge: FlowEdge): void {
  map.set(nodeId, [...(map.get(nodeId) ?? []), edge]);
}

function oppositeNode(
  edge: FlowEdge,
  currentNodeId: string,
  direction: "incoming" | "outgoing",
): string {
  if (edge.direction === "bidirectional") {
    return edge.source === currentNodeId ? edge.target : edge.source;
  }
  return direction === "incoming" ? edge.source : edge.target;
}

function filteredEdges(edges: FlowEdge[], allowedEdgeTypes?: Set<FlowEdgeType>): FlowEdge[] {
  return sortedEdges(edges).filter((edge) => !allowedEdgeTypes || allowedEdgeTypes.has(edge.type));
}

function sortedNodes(nodes: FlowNode[]): FlowNode[] {
  return [...nodes].sort((left, right) => left.id.localeCompare(right.id));
}

function sortedEdges(edges: FlowEdge[]): FlowEdge[] {
  return [...edges].sort(
    (left, right) =>
      left.type.localeCompare(right.type) ||
      (left.label ?? "").localeCompare(right.label ?? "") ||
      left.id.localeCompare(right.id),
  );
}

function canonicalCycle(cycle: string[]): string[] {
  const body = cycle.slice(0, -1);
  const minIndex = body.reduce(
    (best, _nodeId, index) => (body[index].localeCompare(body[best]) < 0 ? index : best),
    0,
  );
  const rotated = [...body.slice(minIndex), ...body.slice(0, minIndex)];
  return [...rotated, rotated[0]];
}
