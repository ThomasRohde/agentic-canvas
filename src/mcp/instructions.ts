export const MCP_INSTRUCTIONS = [
  "Agentic Canvas is a shared visual canvas controlled through MCP.",
  "Inspect the scene with get_canvas_state before editing, then call get_canvas_capabilities when choosing canvas-specific tools.",
  "Use the tools advertised in get_canvas_capabilities for the active canvas type instead of assuming one canvas engine.",
  "Use get_object before destructive updates when an id is uncertain. Do not call clear_canvas unless the user explicitly asks to erase the whole scene.",
  "Save important results with save_canvas.",
].join(" ");
