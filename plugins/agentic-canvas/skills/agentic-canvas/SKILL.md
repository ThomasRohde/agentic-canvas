---
name: agentic-canvas
description: Use when the user asks to create, inspect, update, save, or screenshot diagrams on Agentic Canvas, or mentions the local Agentic Canvas MCP server, Excalidraw canvas, canvas patches, object search, or diagram layout.
---

# Agentic Canvas

Agentic Canvas is a local-first browser canvas controlled through MCP. The plugin
expects a running server at:

```text
http://127.0.0.1:3333/mcp
```

The plugin MCP config connects to that URL; it does not launch the server by itself.
If the tools are unavailable, ask the user to start Agentic Canvas or start it from a
local shell when appropriate:

```powershell
npx @trohde/agentic-canvas@latest --canvas excalidraw --workspace <project-dir>
```

Use an explicit `--workspace` when save/open/screenshot files should live under a
project directory.

## Operating Pattern

1. Call `get_canvas_state` before editing an existing canvas.
2. Use `find_objects`, `list_objects`, and `get_object` to locate existing content.
3. Prefer `apply_canvas_patch` for multi-object create/update/delete changes.
4. Prefer high-level Excalidraw tools for common workflows:
   - `draw_rectangle`, `draw_ellipse`, `draw_diamond`, `draw_line`, `draw_arrow`
   - `connect_objects`
   - `create_flowchart`
   - `align_distribute_objects`
   - `auto_layout_objects`
5. Use `select_objects` and `get_selected_objects` when browser selection matters.
6. Save durable work with `save_canvas`; paths without an extension become
   `.excalidraw`.
7. Use `screenshot` for visual output; file paths without an extension become `.png`.

Do not call `clear_canvas`, `delete_object`, or `open_canvas` unless the user clearly
asks for a destructive or replacing action.

## Useful Defaults

- Use `apply_canvas_patch` with `returnObjects: true` while building complex diagrams.
- After creating related objects, run `auto_layout_objects` or
  `align_distribute_objects` to improve spacing.
- Reject or revise self-loop arrows unless the user explicitly asks for another
  visual representation.
- Keep diagram edits atomic where possible so failed operations roll back cleanly.
