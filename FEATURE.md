## Current server baseline

The current Agentic Canvas server is already a good foundation: it is local-first, embeds Excalidraw in the browser, exposes MCP over Streamable HTTP, and syncs scene changes over WebSocket.  It has a clean split between generic baseline tools and Excalidraw-specific tools: baseline tools cover state, list/get/create/update/delete, clear, save/open, screenshot, selection, background, undo, and redo; Excalidraw tools cover rectangle, ellipse, diamond, line, arrow, text, frames, groups, ungrouping, frame removal, and simple flowchart creation. 

The architecture also has the right extension seam. The plugin boundary owns native scene format and maps to normalized objects, while `CanvasController` owns the authoritative scene and version.   Multi-step tools should use `controller.transaction()` so the browser gets one final scene update, which is exactly what you need for higher-level diagram tools. 

The current constraints matter: HTTP MCP only, single-browser-session expected, full-scene sync rather than diffs/CRDT, and screenshot/selection requiring a connected browser.  Codex is compatible with this direction because Codex supports MCP servers in CLI and IDE, supports Streamable HTTP servers, and reads server instructions returned during MCP initialization. ([OpenAI Developers][1])

## Highest-value new MCP tools

### P0 — add first

| Tool                       |              Type | Why it is high value                                                                                                                             | Design notes                                                                                                                                                         |        |       |     |        |                                  |                                                                                         |
| -------------------------- | ----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- | --- | ------ | -------------------------------- | --------------------------------------------------------------------------------------- |
| `apply_canvas_patch`       |          Baseline | Biggest agent productivity gain. Codex can create, update, delete, group, frame, and select in one atomic call instead of making 20 small calls. | Input: `operations[]`, `dryRun`, `returnObjects`. Return `idMap`, `version`, `created`, `updated`, `deleted`, `warnings`. Implement with `controller.transaction()`. |        |       |     |        |                                  |                                                                                         |
| `find_objects`             |          Baseline | Current `list_objects` filters only by type; agents need semantic targeting without guessing IDs.                                                | Query by `textContains`, `textRegex`, `type`, `frameId`, `groupId`, bounding box, style, link, custom metadata, selected-only.                                       |        |       |     |        |                                  |                                                                                         |
| `align_distribute_objects` | Excalidraw plugin | Produces much better human-facing diagrams with low complexity.                                                                                  | Support `align: left                                                                                                                                                 | center | right | top | middle | bottom`, `distribute: horizontal | vertical`, `equalizeWidth`, `equalizeHeight`, `snapToGrid`, `ids` or current selection. |
| `auto_layout_objects`      | Excalidraw plugin | The agent can create rough content, then make it legible. This is the most visible quality improvement after batch operations.                   | Layout modes: `grid`, `tree`, `layered-dag`, `pack-frames`, `swimlanes`. Preserve IDs; move arrows/bound labels consistently.                                        |        |       |     |        |                                  |                                                                                         |
| `connect_objects`          | Excalidraw plugin | Current `draw_arrow` handles one arrow; agents often need many relationships.                                                                    | Input `edges: [{fromId,toId,label,style}]`; auto-bind endpoints; return `arrowIds`; optionally route LR/TB.                                                          |        |       |     |        |                                  |                                                                                         |

`apply_canvas_patch` should be the first PR. It fits the existing transaction model, reduces Codex tool-call churn, and gives you a safer place to add `dryRun`/preview semantics. Current individual creation/update/delete APIs are already controller-backed, so this is mostly orchestration over existing primitives. 

### P1 — high business value

| Tool                    |               Type | Why it matters                                                                                              | Design notes                                                                                                                                                  |          |            |              |                |           |          |                                                  |
| ----------------------- | -----------------: | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ------------ | -------------- | --------- | -------- | ------------------------------------------------ |
| `create_diagram`        |  Excalidraw plugin | Move from drawing primitives to intent-level diagrams.                                                      | Superset of `create_flowchart`. `kind: flowchart                                                                                                              | swimlane | c4-context | c4-container | capability-map | data-flow | timeline | matrix`. Return semantic IDs and Excalidraw IDs. |
| `validate_canvas`       | Baseline or plugin | Lets Codex self-check diagrams before presenting them.                                                      | Detect overlaps, orphan arrows, duplicate labels, unlabeled diamonds, arrows crossing too much, children outside frames, inconsistent styles, missing legend. |          |            |              |                |           |          |                                                  |
| `repair_canvas`         |             Plugin | Turns validation into action.                                                                               | Input `checks[]` or `strategy`; apply layout/style/frame fixes transactionally. Keep `dryRun` mandatory/default initially.                                    |          |            |              |                |           |          |                                                  |
| `fit_frame_to_children` |  Excalidraw plugin | Frames are core to architecture diagrams, but current tools only create frames and remove frame assignment. | Add `add_to_frame`, `remove_from_frame` already exists, `fit_frame_to_children`, `create_swimlanes`. Current frame tooling is present but incomplete.         |          |            |              |                |           |          |                                                  |
| `apply_theme`           |  Excalidraw plugin | Gives diagrams consistent EA notation without repeating style objects.                                      | Named themes: `default`, `architecture`, `risk`, `capability`, `sequence`. Apply by object type, tags, frame, or selection.                                   |          |            |              |                |           |          |                                                  |

`create_diagram` should not become a huge free-form renderer. Keep it structured and deterministic. The current `create_flowchart` already has node/edge validation, deterministic LR/TB layout, and ID mapping; extend that pattern rather than replacing it.  

### P2 — strong differentiators

| Tool                               |            Type | Why it matters                                                                                      | Design notes                                                                                                                                            |     |            |      |                           |           |                                                                                        |
| ---------------------------------- | --------------: | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | ---- | ------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `import_diagram_text`              |          Plugin | Lets Codex convert Mermaid/DOT/PlantUML-ish specs into editable Excalidraw objects.                 | Start with Mermaid flowcharts only. Return parser warnings and ID map. Keep Node/browser separation: do not import Excalidraw runtime into server code. |     |            |      |                           |           |                                                                                        |
| `describe_canvas`                  |        Baseline | Makes the canvas inspectable as a semantic document, not just a list of objects.                    | Return frames, contained nodes, arrows as relationships, legends, title candidates, warnings. Useful for reviews and tests.                             |     |            |      |                           |           |                                                                                        |
| `set_object_metadata`              | Baseline/plugin | Critical for architecture work: stable semantic IDs, owners, systems, classifications, source refs. | Store under `raw.customData.agenticCanvas`. Excalidraw elements already have `customData`, `link`, and `locked` fields in the scene model.              |     |            |      |                           |           |                                                                                        |
| `link_objects` / `set_object_link` |          Plugin | Makes diagrams navigable to repos, ADRs, Jira, Confluence, system catalog entries.                  | Use native `link`; optionally validate URL schemes.                                                                                                     |     |            |      |                           |           |                                                                                        |
| `lock_objects` / `unlock_objects`  |          Plugin | Protects manually curated elements from agent layout passes.                                        | Use native `locked`; have layout tools respect `locked` by default.                                                                                     |     |            |      |                           |           |                                                                                        |
| `export_canvas`                    | Baseline/plugin | Current screenshot is PNG-only. Add export variants for integration workflows.                      | Support `format: png                                                                                                                                    | svg | excalidraw | json | summary-md`; `scope: full | selection | frame`. Write inside workspace and return path. Workspace path safety already exists.  |
| `canvas_diff` / `snapshot_canvas`  |        Baseline | Lets Codex show what changed after a large operation.                                               | Return added/removed/changed objects between versions or named snapshots. Complements undo/redo.                                                        |     |            |      |                           |           |                                                                                        |

## Codex-supported feature additions

### 1. Add MCP server instructions

Codex explicitly reads MCP `instructions` during initialization and uses them as server-wide guidance alongside tools; OpenAI recommends keeping the first 512 characters self-contained. ([OpenAI Developers][1]) Your current `buildMcpServer` only sets `name` and `version`, so this is unused headroom. 

Use instructions for stable tool-use policy, for example:

```text
Agentic Canvas is a live Excalidraw canvas. Prefer high-level tools over primitives. 
Before editing an existing diagram, call get_canvas_state and find_objects. 
Use apply_canvas_patch for multi-object changes. Use validate_canvas before final screenshots. 
Do not clear_canvas unless the user explicitly asks. Save important results to the workspace.
```

This is one of the cheapest high-value upgrades because it improves Codex behavior without adding many tools.

### 2. Add Codex config profiles

Codex supports project-scoped or user-scoped MCP config, shared by CLI and IDE, with Streamable HTTP URL config. ([OpenAI Developers][1]) It also supports `enabled_tools`, `disabled_tools`, startup/tool timeouts, default tool approval, and per-tool approval overrides. ([OpenAI Developers][1])

Do not commit `.codex/config.toml` as an active config, which your docs already warn against.  But do commit examples:

```toml
# docs/codex/agentic-canvas-authoring.toml
[mcp_servers.agentic-canvas]
url = "http://127.0.0.1:3333/mcp"
startup_timeout_sec = 20
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"

enabled_tools = [
  "get_canvas_state",
  "list_objects",
  "get_object",
  "find_objects",
  "apply_canvas_patch",
  "auto_layout_objects",
  "align_distribute_objects",
  "connect_objects",
  "validate_canvas",
  "screenshot",
  "save_canvas"
]

[mcp_servers.agentic-canvas.tools.get_canvas_state]
approval_mode = "approve"

[mcp_servers.agentic-canvas.tools.list_objects]
approval_mode = "approve"

[mcp_servers.agentic-canvas.tools.find_objects]
approval_mode = "approve"
```

Have three profiles: `readonly`, `authoring`, and `dangerous`. Put `clear_canvas`, `open_canvas`, `delete_object`, and future bulk-delete behavior outside the default authoring profile.

### 3. Add a canvas-specific `AGENTS.md` playbook

Codex reads `AGENTS.md` before work and layers global/project guidance. ([OpenAI Developers][2]) Your repo already has AGENTS guidance for implementation work, including “do not add auth, DB, stdio transport, or second plugin” and “do not rewrite MCP tool names or schemas without an explicit reason.” 

Add a section specifically for **using** Agentic Canvas from Codex, not only developing it:

```md
## Canvas operation guidance

- Prefer find_objects before editing existing diagrams.
- Prefer apply_canvas_patch for multi-object changes.
- Use auto_layout_objects after creating more than 3 related objects.
- Use validate_canvas before screenshot or save.
- Never call clear_canvas unless explicitly requested.
- Save final diagrams with save_canvas and include a screenshot path when useful.
```

### 4. Package a Codex plugin later

Codex supports plugin-provided MCP servers, where installed plugins can bundle MCP servers and user config can still control enabled state and tool policy. ([OpenAI Developers][1]) This would be a strong distribution path once the tool surface stabilizes.

I would not do this before `apply_canvas_patch`, `find_objects`, `auto_layout_objects`, and config profiles. Otherwise you package a useful demo instead of a durable workflow.

### 5. Keep the server tool-first; avoid unsupported MCP surface area for now

For Codex, base the roadmap on **MCP tools, Streamable HTTP, server instructions, and Codex config**. The Codex MCP page I found lists STDIO, Streamable HTTP, auth options, and server instructions as supported MCP features. ([OpenAI Developers][1]) I would not invest yet in MCP resources, prompts, sampling, elicitation, or subscriptions for this canvas until you verify Codex client behavior directly.

## Recommended implementation order

1. **Codex behavior layer:** add MCP `instructions`, `docs/codex/*.toml` profiles, and canvas-use guidance in `AGENTS.md`.
2. **Agent efficiency layer:** add `find_objects` and `apply_canvas_patch`.
3. **Diagram quality layer:** add `align_distribute_objects`, `connect_objects`, and `auto_layout_objects`.
4. **Architecture semantics layer:** add `create_diagram`, `set_object_metadata`, `set_object_link`, and `apply_theme`.
5. **Governance layer:** add `validate_canvas`, `repair_canvas`, `canvas_diff`, and richer export.

The sharpest first move is: **`apply_canvas_patch` + `find_objects` + MCP server instructions**. That combination will make Codex substantially better at using the canvas without forcing you to broaden Excalidraw coverage prematurely.

[1]: https://developers.openai.com/codex/mcp "Model Context Protocol – Codex | OpenAI Developers"
[2]: https://developers.openai.com/codex/guides/agents-md "Custom instructions with AGENTS.md – Codex | OpenAI Developers"
