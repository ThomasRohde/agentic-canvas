# Agentic Canvas

Agentic Canvas is a local-first visual canvas that an AI agent drives through a local MCP server. It supports Excalidraw for freeform diagrams and JSON Canvas for portable semantic knowledge maps, while a single local Node process serves the browser app, exposes MCP over Streamable HTTP, and syncs scene changes over WebSocket.

Published package: `@trohde/agentic-canvas`

Executable: `agentic-canvas`

## Prerequisites

- Node.js 20.19 or newer
- npm
- A modern browser
- An MCP-capable client, such as Codex, Claude Code, or Claude Desktop

## Setup

```bash
npm install
npm run build
```

## Run

```bash
npm start -- --canvas excalidraw
npm start -- --canvas jsoncanvas
```

For package usage after publishing:

```bash
npx @trohde/agentic-canvas --canvas excalidraw
npx @trohde/agentic-canvas --canvas jsoncanvas
```

Flags:

- `--canvas <name>`: canvas plugin, one of `excalidraw`, `jsoncanvas`
- `--port <n>`: port, default `3333`
- `--host <host>`: bind host, default `127.0.0.1`
- `--workspace <dir>`: root for save/open/screenshot files, default current directory
- `--open` / `--no-open`: open the browser on startup, default open

Optional environment overrides are `AGENTIC_CANVAS_PORT`, `AGENTIC_CANVAS_HOST`, and `AGENTIC_CANVAS_WORKSPACE`. `save_canvas`, `open_canvas`, and screenshot file writes are constrained to the configured workspace root. An HTTP MCP client config only points at an already-running server; it does not choose that server's current working directory. Start the server with `--workspace <project>` when files should be scoped to a project directory. No secrets or `.env` file are required.

## Develop

For backend, MCP tool, plugin, or workspace changes:

```bash
npm run dev
```

For browser HMR, run the backend and Vite dev server in separate terminals:

```bash
npm run dev:server
npm run dev:web
```

Open `http://127.0.0.1:5173` for the Vite UI. MCP clients should still connect to the backend at `http://127.0.0.1:3333/mcp`.

See `docs/mcp-dev.md` for Codex configuration, example profiles in `docs/codex/`,
MCP Inspector usage, and restart expectations.

## Connect An MCP Client

With the server running on the default port:

```bash
claude mcp add --transport http agentic-canvas http://127.0.0.1:3333/mcp
```

Codex example profiles are committed under `docs/codex/` for readonly, authoring, and
dangerous tool sets. Copy one into your local Codex config instead of committing an
active `.codex/config.toml`.

Example tool flow:

1. Call `get_canvas_state` to identify the active canvas type.
2. Call `get_canvas_capabilities` to discover supported tool groups and preferred workflows.
3. For `--canvas excalidraw`, call `apply_canvas_patch` to create several nodes in one atomic change.
4. Call `connect_objects` to add bound arrows between the nodes.
5. Call `auto_layout_objects` or `align_distribute_objects` to clean up spacing.
6. Call `find_objects` to locate objects by type, label text, geometry, style, link, or metadata.
7. Select an object in the browser and call `get_selected_objects`; the tool returns the selected normalized object.
8. Call `select_objects` with an object id to select it from the MCP client.
9. Call `screenshot`; the tool returns a PNG image.
10. Call `save_canvas` with `{ "path": "demo" }`; the file is written as `demo.excalidraw` inside the workspace.
11. Call `clear_canvas`, then `open_canvas` with `{ "path": "demo" }`; the saved scene is restored.

`save_canvas` and `open_canvas` append the active canvas extension when no
extension is provided and reject other extensions. `screenshot` appends `.png` for
file writes and rejects other extensions.

For `--canvas jsoncanvas`, agents can use `add_text_card`, `add_file_card`,
`add_link_card`, `create_group`, `connect_cards`, `find_cards`, `find_edges`,
`auto_layout_cards`, and `apply_jsoncanvas_patch`. A typical JSON Canvas flow:

1. Call `add_text_card` for context, risks, decisions, and next steps.
2. Call `connect_cards` with labels such as `causes`, `mitigates`, or `depends on`.
3. Call `create_group` to frame related cards.
4. Call `auto_layout_cards`.
5. Call `save_canvas` with `{ "path": "architecture-review" }`; the file is written as `architecture-review.canvas`.

The JSON Canvas plugin writes standards-compatible `.canvas` files without Agentic
Canvas metadata. Default card sizes are intentional: text cards are `360x180`,
file/link cards are `360x120`, and groups are `520x360`. `connect_cards` defaults
`toEnd` to `"arrow"`; pass `toEnd:"none"` for a plain line. `auto_layout_cards`
treats `layerSpacing` and `nodeSpacing` as gaps added to measured card sizes, so
small explicit spacing values should not overlap cards. It does not fetch link
previews, index Obsidian vaults, or render arbitrary embedded media in this
version.

## Agent Plugins

This repository bundles one Agentic Canvas plugin payload under
`plugins/agentic-canvas`, packaged for Codex, Claude Code, and GitHub Copilot.
All three formats use the same bundled skill and the same `.mcp.json` endpoint for
`http://127.0.0.1:3333/mcp`.

Marketplace and manifest files:

- Codex: `.agents/plugins/marketplace.json` and
  `plugins/agentic-canvas/.codex-plugin/plugin.json`
- Claude Code: `.claude-plugin/marketplace.json` and
  `plugins/agentic-canvas/.claude-plugin/plugin.json`
- GitHub Copilot CLI / VS Code Agent Plugins: `.github/plugin/marketplace.json`
  and `plugins/agentic-canvas/plugin.json`
- Compatibility: `plugins/agentic-canvas/.plugin/plugin.json`

Install for Codex from a checkout of this repository:

```bash
codex plugin marketplace add .
codex plugin add agentic-canvas@agentic-canvas
```

Install for GitHub Copilot CLI from a checkout or GitHub repository:

```bash
copilot plugin marketplace add .
copilot plugin install agentic-canvas@agentic-canvas
```

Install for Claude Code from a checkout or GitHub repository:

```bash
claude plugin marketplace add .
claude plugin install agentic-canvas@agentic-canvas
```

Start a new agent thread/session after installing so plugin skills and MCP tools are
loaded. The plugin connects to `http://127.0.0.1:3333/mcp`, so start Agentic Canvas
before using it. Select the canvas type when starting the server:

```bash
npx @trohde/agentic-canvas@latest --canvas excalidraw --workspace <project-dir>
npx @trohde/agentic-canvas@latest --canvas jsoncanvas --workspace <project-dir>
```

The plugin is one marketplace entry for all Agentic Canvas canvas types. It does not
encode the canvas type in `.mcp.json`; agents should call `get_canvas_state` and
`get_canvas_capabilities` to select Excalidraw, JSON Canvas, or future
canvas-specific workflows. For parallel canvases, run separate Agentic Canvas
servers on different ports and configure additional MCP entries manually.

## Test And Build

```bash
npm run verify
npm run build
```

Individual checks:

```bash
npm run typecheck
npm run lint
npm test
```

Built-server smoke test:

```bash
node dist/cli/index.js --no-open --port 3939
```

Then probe `http://127.0.0.1:3939/healthz` and call `get_canvas_state` through an MCP Streamable HTTP client.

MCP Inspector:

```bash
npm run inspect:mcp
```

## Manual UI Verification

1. Run `npm run build && npm start -- --canvas excalidraw`.
2. Connect an MCP client to `http://127.0.0.1:3333/mcp`.
3. Call `draw_rectangle`, `add_text`, `draw_arrow`, and `create_flowchart`.
4. Confirm the shapes appear live in the browser.
5. Call `save_canvas`, `clear_canvas`, and `open_canvas`; confirm the scene clears and reloads.
6. Select a shape in the browser, then call `get_selected_objects`; confirm the selected object id is returned.
7. Call `select_objects`; confirm the browser selection changes.
8. Call `undo` and `redo`; confirm the browser scene follows the server history.
9. Call `screenshot`; confirm a PNG is returned and, when `path` is provided, written in the workspace.
10. Drag or edit a shape by hand in the browser, then call `list_objects`; confirm the listing reflects the human edit.

For JSON Canvas, run `npm run build && npm start -- --canvas jsoncanvas --workspace <tmp-dir>`, then call `add_text_card`, `connect_cards`, `auto_layout_cards`, `save_canvas`, `clear_canvas`, `open_canvas`, and `screenshot`. Confirm cards and edges appear in the browser, drag a card, and verify `get_object` reflects the updated `x`/`y`.

## Release Checks

This project follows Semantic Versioning. Version scripts update `package.json` and `package-lock.json` without committing or tagging:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

Before publishing, run:

```bash
npm run release:dry-run
```

See `docs/release.md` for the GitHub Actions and npm trusted publishing flow.

## Project Structure

```text
src/cli/                 CLI entry
src/server/              Express, MCP HTTP, WebSocket bridge, workspace safety
src/mcp/                 MCP server registration and baseline tools
src/core/                Plugin interface and normalized scene types
src/plugins/excalidraw/  Excalidraw plugin, element builder, adapter, tools
src/plugins/jsoncanvas/  JSON Canvas model, adapter, validation, tools
src/web/                 React browser app and canvas renderers
src/shared/              Shared protocol and logger
tests/                   Vitest unit and integration tests
docs/                    Architecture notes, MCP development docs, Codex profiles
scripts/                 Release and package smoke scripts
.github/workflows/       CI and npm publish workflows
```

## Known Limitations

- HTTP MCP transport only; no stdio transport in v1.
- Single browser session is the expected mode.
- Full-scene sync is used instead of diffs or CRDT collaboration.
- Screenshot and selection tools require a connected browser. Selection is
  ephemeral browser UI state, may be cleared by mutations or undo/redo, and is not
  persisted in `.canvas` files.
- MCP `version` fields are monotonic scene revision counters, not package versions,
  scene hashes, or optimistic-concurrency tokens.
- The Excalidraw tool surface is intentionally small: shapes, text, frames, groups, arrows, flowcharts, object search, atomic patches, layout cleanup, save/open, and screenshot.
- The JSON Canvas tool surface is semantic-card focused: text/file/link cards, groups, edges, search, layout, atomic patches, save/open, and screenshot.
