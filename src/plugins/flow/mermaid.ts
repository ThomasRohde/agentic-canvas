import type { FlowDirection, FlowDocument } from "./model.js";

export function exportFlowMermaid(
  document: FlowDocument,
  options: { direction?: FlowDirection; includeDescriptions?: boolean } = {},
): string {
  const direction = options.direction ?? document.settings?.direction ?? "LR";
  const lines = [`flowchart ${direction}`];
  for (const node of [...document.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    lines.push(`  ${safeId(node.id)}["${escapeLabel(node.label)}"]`);
    if (options.includeDescriptions && node.description) {
      lines.push(`  %% ${node.id}: ${node.description.replace(/\r?\n/g, " ")}`);
    }
  }
  for (const edge of [...document.edges].sort((left, right) => left.id.localeCompare(right.id))) {
    const arrow = edge.direction === "bidirectional" ? "<-->" : "-->";
    const label = edge.label ? `|${escapeLabel(edge.label)}|` : "";
    lines.push(`  ${safeId(edge.source)} ${arrow}${label} ${safeId(edge.target)}`);
  }
  return `${lines.join("\n")}\n`;
}

function safeId(id: string): string {
  const normalized = id.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(normalized) ? normalized : `flow_${normalized}`;
}

function escapeLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}
