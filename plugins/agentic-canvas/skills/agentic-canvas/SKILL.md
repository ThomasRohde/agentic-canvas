---
name: agentic-canvas
description: Use when the user asks to create, inspect, update, save, or screenshot diagrams or knowledge maps on Agentic Canvas, or mentions the local Agentic Canvas MCP server, Excalidraw, JSON Canvas, canvas patches, object search, or diagram layout.
---

# Agentic Canvas

Agentic Canvas is a local-first browser canvas controlled through MCP. The same
Codex plugin works with every canvas type that the running Agentic Canvas server
selects. The plugin expects a running server at:

```text
http://127.0.0.1:3333/mcp
```

The plugin MCP config connects to that URL; it does not launch the server by itself.
If the tools are unavailable, ask the user to start Agentic Canvas or start it from a
local shell when appropriate:

```powershell
npx @trohde/agentic-canvas@latest --canvas excalidraw --workspace <project-dir>
npx @trohde/agentic-canvas@latest --canvas jsoncanvas --workspace <project-dir>
```

Use an explicit `--workspace` when save/open/screenshot files should live under a
project directory.

## Operating Pattern

1. Call `get_canvas_state` before editing an existing canvas.
2. Read the returned `canvas` value.
3. Call `get_canvas_capabilities` when choosing creation, update, connection,
   layout, or file tools.
4. Use `list_objects` and `get_object` to inspect content. Use canvas-specific
   search tools when the capability response advertises them.
5. Use `select_objects` and `get_selected_objects` when browser selection matters.
6. Save durable work with `save_canvas`; paths without an extension use the active
   canvas file extension.
7. Use `screenshot` for visual output; file paths without an extension become `.png`.

## Canvas-Specific Guidance

For `canvas: "excalidraw"`, prefer high-level shape and diagram tools:

- `apply_canvas_patch`, `create_object`, `update_object`, `find_objects`
- `draw_rectangle`, `draw_ellipse`, `draw_diamond`, `draw_line`, `draw_arrow`
- `connect_objects`
- `create_flowchart`
- `align_distribute_objects`
- `auto_layout_objects`

For `canvas: "jsoncanvas"`, prefer semantic card and edge tools:

- `add_text_card`, `add_file_card`, `add_link_card`, `create_group`
- `connect_cards`
- `update_card`, `update_edge`
- `find_cards`, `find_edges`
- `auto_layout_cards`
- `apply_jsoncanvas_patch`

For an unknown future canvas type, use only baseline tools and
`get_canvas_capabilities` guidance until the server advertises a canvas-specific
tool workflow.

Do not call `clear_canvas`, `delete_object`, or `open_canvas` unless the user clearly
asks for a destructive or replacing action.

## Useful Defaults

- Use the active canvas's advertised atomic patch tool while building complex diagrams
  or maps.
- After creating related objects, run the active canvas's advertised layout tool.
- Reject or revise self-loop arrows unless the user explicitly asks for another
  visual representation.
- Keep diagram edits atomic where possible so failed operations roll back cleanly.
