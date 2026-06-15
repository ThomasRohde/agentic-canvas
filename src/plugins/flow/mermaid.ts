import type { FlowDirection, FlowDocument, FlowNode } from "./model.js";

export function exportFlowMermaid(
  document: FlowDocument,
  options: { direction?: FlowDirection; includeDescriptions?: boolean } = {},
): string {
  const direction = options.direction ?? document.settings?.direction ?? "LR";
  const lines = [`flowchart ${direction}`];
  const nodes = [...document.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const parentByNodeId = containmentParents(document);
  const childrenByParentId = new Map<string, FlowNode[]>();
  for (const node of nodes) {
    const parentId = parentByNodeId.get(node.id);
    if (parentId) {
      childrenByParentId.set(parentId, [...(childrenByParentId.get(parentId) ?? []), node]);
    }
  }
  const emitted = new Set<string>();
  for (const node of nodes) {
    if (parentByNodeId.has(node.id)) {
      continue;
    }
    emitNode(node, "  ", lines, childrenByParentId, emitted, Boolean(options.includeDescriptions));
  }
  for (const edge of [...document.edges].sort((left, right) => left.id.localeCompare(right.id))) {
    if (edge.type === "contains") {
      continue;
    }
    const arrow = edge.direction === "bidirectional" ? "<-->" : "-->";
    const label = edge.label ? `|${escapeMermaidText(edge.label)}|` : "";
    lines.push(`  ${safeId(edge.source)} ${arrow}${label} ${safeId(edge.target)}`);
  }
  return `${lines.join("\n")}\n`;
}

function emitNode(
  node: FlowNode,
  indent: string,
  lines: string[],
  childrenByParentId: Map<string, FlowNode[]>,
  emitted: Set<string>,
  includeDescriptions: boolean,
): void {
  if (emitted.has(node.id)) {
    return;
  }
  emitted.add(node.id);
  if (node.type === "boundary") {
    lines.push(`${indent}subgraph ${safeId(node.id)}["${escapeMermaidText(node.label)}"]`);
    if (includeDescriptions && node.description) {
      lines.push(`${indent}  %% ${node.id}: ${commentText(node.description)}`);
    }
    for (const child of [...(childrenByParentId.get(node.id) ?? [])].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      emitNode(child, `${indent}  `, lines, childrenByParentId, emitted, includeDescriptions);
    }
    lines.push(`${indent}end`);
    return;
  }
  lines.push(`${indent}${safeId(node.id)}["${escapeMermaidText(node.label)}"]`);
  if (includeDescriptions && node.description) {
    lines.push(`${indent}%% ${node.id}: ${commentText(node.description)}`);
  }
}

function containmentParents(document: FlowDocument): Map<string, string> {
  const boundaryIds = new Set(
    document.nodes.filter((node) => node.type === "boundary").map((node) => node.id),
  );
  const parentByNodeId = new Map<string, string>();
  for (const node of document.nodes) {
    if (node.parentId && boundaryIds.has(node.parentId)) {
      parentByNodeId.set(node.id, node.parentId);
    }
  }
  for (const edge of document.edges) {
    if (
      edge.type === "contains" &&
      boundaryIds.has(edge.source) &&
      !parentByNodeId.has(edge.target)
    ) {
      parentByNodeId.set(edge.target, edge.source);
    }
  }
  return parentByNodeId;
}

function safeId(id: string): string {
  const normalized = id.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(normalized) ? normalized : `flow_${normalized}`;
}

function escapeMermaidText(label: string): string {
  return label.replace(/\r?\n/g, " ").replace(/[\\#"|<>&{}\[\]]/g, (character) => {
    switch (character) {
      case "\\":
        return "#92;";
      case "#":
        return "#35;";
      case '"':
        return "#34;";
      case "|":
        return "#124;";
      case "<":
        return "#60;";
      case ">":
        return "#62;";
      case "&":
        return "#38;";
      case "{":
        return "#123;";
      case "}":
        return "#125;";
      case "[":
        return "#91;";
      case "]":
        return "#93;";
      default:
        return character;
    }
  });
}

function commentText(text: string): string {
  return text.replace(/\r?\n/g, " ");
}
