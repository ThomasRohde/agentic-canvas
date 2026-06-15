# Agentic Canvas

Agentic Canvas is a local-first visual canvas that an AI agent drives through a local MCP server. The first plugin embeds Excalidraw in a browser page, while a single local Node process serves the page, exposes MCP over Streamable HTTP, and syncs scene changes over WebSocket.

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
```

For package usage after publishing:

```bash
npx @trohde/agentic-canvas --canvas excalidraw
```

Flags:

- `--canvas <name>`: canvas plugin, currently only `excalidraw`
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

1. Call `apply_canvas_patch` to create several nodes in one atomic change.
2. Call `connect_objects` to add bound arrows between the nodes.
3. Call `auto_layout_objects` or `align_distribute_objects` to clean up spacing.
4. Call `find_objects` to locate objects by type, label text, geometry, style, link, or metadata.
5. Select an object in the browser and call `get_selected_objects`; the tool returns the selected normalized object.
6. Call `select_objects` with an object id to select it from the MCP client.
7. Call `screenshot`; the tool returns a PNG image.
8. Call `save_canvas` with `{ "path": "demo" }`; the file is written as `demo.excalidraw` inside the workspace.
9. Call `clear_canvas`, then `open_canvas` with `{ "path": "demo" }`; the saved scene is restored.

`save_canvas` and `open_canvas` append `.excalidraw` when no extension is provided and reject other extensions. `screenshot` appends `.png` for file writes and rejects other extensions.

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
src/web/                 React + Excalidraw browser app
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
- Screenshot and selection tools require a connected browser.
- The Excalidraw tool surface is intentionally small: shapes, text, frames, groups, arrows, flowcharts, object search, atomic patches, layout cleanup, save/open, and screenshot.
