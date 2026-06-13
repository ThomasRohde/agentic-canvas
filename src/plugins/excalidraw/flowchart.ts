import type { CreateObjectSpec } from "../../core/scene.js";

export interface FlowchartNodeInput {
  id: string;
  label: string;
  shape?: "rectangle" | "ellipse" | "diamond";
  x?: number;
  y?: number;
}

export interface FlowchartEdgeInput {
  from: string;
  to: string;
  label?: string;
}

export interface FlowchartInput {
  nodes: FlowchartNodeInput[];
  edges: FlowchartEdgeInput[];
  direction?: "TB" | "LR";
  spacingX?: number;
  spacingY?: number;
}

export interface FlowchartPlan {
  nodes: Array<{ key: string; spec: CreateObjectSpec }>;
  edges: Array<{ from: string; to: string; label?: string }>;
}

export function planFlowchart(input: FlowchartInput): FlowchartPlan {
  const direction = input.direction ?? "LR";
  const spacingX = input.spacingX ?? 220;
  const spacingY = input.spacingY ?? 140;
  const levels = assignLevels(input);
  const levelGroups = groupLevels(input.nodes, levels);

  return {
    nodes: input.nodes.map((node, index) => {
      const level = levels.get(node.id) ?? index;
      const peers = levelGroups.get(level) ?? [node.id];
      const peerIndex = Math.max(0, peers.indexOf(node.id));
      const crossAxisOffset = peerOffset(
        peerIndex,
        peers.length,
        direction === "LR" ? spacingY : spacingX,
      );
      return {
        key: node.id,
        spec: {
          type: node.shape ?? "rectangle",
          x: node.x ?? (direction === "LR" ? level * spacingX : crossAxisOffset),
          y: node.y ?? (direction === "TB" ? level * spacingY : crossAxisOffset),
          width: 160,
          height: 60,
          text: node.label,
        },
      };
    }),
    edges: input.edges,
  };
}

function assignLevels(input: FlowchartInput): Map<string, number> {
  const nodeIds = new Set(input.nodes.map((node) => node.id));
  const indegrees = new Map(input.nodes.map((node) => [node.id, 0]));
  for (const edge of input.edges) {
    if (nodeIds.has(edge.to)) {
      indegrees.set(edge.to, (indegrees.get(edge.to) ?? 0) + 1);
    }
  }

  const roots = input.nodes.filter((node) => (indegrees.get(node.id) ?? 0) === 0);
  const levels = new Map<string, number>();
  for (const root of roots.length > 0 ? roots : input.nodes.slice(0, 1)) {
    levels.set(root.id, 0);
  }

  for (let pass = 0; pass < input.nodes.length; pass += 1) {
    let changed = false;
    for (const edge of input.edges) {
      const fromLevel = levels.get(edge.from);
      if (fromLevel === undefined || !nodeIds.has(edge.to)) {
        continue;
      }

      const nextLevel = fromLevel + 1;
      if ((levels.get(edge.to) ?? -1) < nextLevel) {
        levels.set(edge.to, nextLevel);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  for (const [index, node] of input.nodes.entries()) {
    if (!levels.has(node.id)) {
      levels.set(node.id, index);
    }
  }

  return levels;
}

function groupLevels(
  nodes: FlowchartNodeInput[],
  levels: Map<string, number>,
): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    groups.set(level, [...(groups.get(level) ?? []), node.id]);
  }
  return groups;
}

function peerOffset(index: number, count: number, spacing: number): number {
  return (index - (count - 1) / 2) * spacing;
}
