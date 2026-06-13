# Agentic Canvas

Agentic Canvas is a local-first visual canvas that an AI agent drives through a local MCP server. The first plugin embeds Excalidraw in a browser page, while a single local Node process serves the page, exposes MCP over Streamable HTTP, and syncs scene changes over WebSocket.

Published package: `@trohde/agentic-canvas`

Executable: `agentic-canvas`

## Prerequisites

- Node.js 20 or newer
- npm
- A modern browser
- An MCP-capable client, such as Claude Code or Claude Desktop

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

Optional environment overrides are `AGENTIC_CANVAS_PORT`, `AGENTIC_CANVAS_HOST`, and `AGENTIC_CANVAS_WORKSPACE`. No secrets or `.env` file are required.

## Connect An MCP Client

With the server running on the default port:

```bash
claude mcp add --transport http agentic-canvas http://127.0.0.1:3333/mcp
```

Example tool flow:

1. Call `draw_rectangle` with `{ "x": 100, "y": 100, "width": 200, "height": 120, "text": "Hello" }`; a labeled rectangle appears in the browser.
2. Call `screenshot`; the tool returns a PNG image.
3. Call `save_canvas` with `{ "path": "demo.excalidraw" }`; the file is written inside the workspace.
4. Call `clear_canvas`, then `open_canvas` with `{ "path": "demo.excalidraw" }`; the saved scene is restored.

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

## Manual UI Verification

1. Run `npm run build && npm start -- --canvas excalidraw`.
2. Connect an MCP client to `http://127.0.0.1:3333/mcp`.
3. Call `draw_rectangle`, `add_text`, `draw_arrow`, and `create_flowchart`.
4. Confirm the shapes appear live in the browser.
5. Call `save_canvas`, `clear_canvas`, and `open_canvas`; confirm the scene clears and reloads.
6. Call `screenshot`; confirm a PNG is returned and, when `path` is provided, written in the workspace.
7. Drag or edit a shape by hand in the browser, then call `list_objects`; confirm the listing reflects the human edit.

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
docs/                    Architecture notes
scripts/                 Release and package smoke scripts
.github/workflows/       CI and npm publish workflows
```

## Known Limitations

- HTTP MCP transport only; no stdio transport in v1.
- Single browser session is the expected mode.
- Full-scene sync is used instead of diffs or CRDT collaboration.
- Screenshot requires a connected browser.
- The Excalidraw tool surface is intentionally small: shapes, text, frames, groups, arrows, flowcharts, save/open, and screenshot.
