export const MCP_INSTRUCTIONS = [
  "Agentic Canvas is a shared Excalidraw canvas controlled through MCP.",
  "Inspect the scene with get_canvas_state and find_objects before editing an existing diagram.",
  "Prefer high-level tools over many primitive calls: use apply_canvas_patch for multi-object changes, connect_objects for relationships, and auto_layout_objects or align_distribute_objects for legibility cleanup.",
  "Use get_object before destructive updates when an id is uncertain. Do not call clear_canvas unless the user explicitly asks to erase the whole scene.",
  "Save important results with save_canvas.",
].join(" ");
