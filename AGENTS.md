# AGENTS.md

## Project purpose

Agentic Canvas is a local-first, browser-based visual canvas that an AI agent controls through a local MCP server. The first canvas plugin embeds Excalidraw. A single `npx @trohde/agentic-canvas` process serves the browser app, hosts an MCP server over Streamable HTTP, and syncs the canvas to the browser over WebSocket.

## Canvas operation guidance

- Inspect the scene with `get_canvas_state` and `find_objects` before editing an existing diagram.
- Use `get_object` before destructive updates when an id is uncertain.
- Prefer `apply_canvas_patch` for multi-object create/update/delete work so related changes are atomic.
- Prefer `connect_objects` for drawing several relationships, then use `auto_layout_objects` or `align_distribute_objects` to clean up diagram legibility.
- Do not call `clear_canvas` unless the user explicitly asks to erase the whole canvas.
- Use `save_canvas` for important results before risky edits or handoff.

## Working rules

- Make the smallest correct change.
- Keep the first version simple; follow the stack and structure in `PLAN.md`.
- Do not introduce new dependencies without a clear reason.
- The Node server must NOT import `@excalidraw/excalidraw`; all Excalidraw runtime API usage lives in `src/web`.
- Add or update tests for behavior changes.
- Run the required verification commands before reporting completion.
- Do not add features listed as Out of scope in `PLAN.md` (no auth, no DB, no stdio transport, no second plugin).
- Prefer the HTTP dev loop in `docs/mcp-dev.md` when changing MCP/server behavior.
- Do not rewrite MCP tool names or schemas without an explicit reason; document any contract change clearly.

## Commands

- Install: `npm install`
- Run locally: `npm run build && npm start -- --canvas excalidraw`
- Dev backend: `npm run dev`
- Dev web HMR: `npm run dev:web` with `npm run dev:server` running
- MCP Inspector: `npm run inspect:mcp`
- Test: `npm test`
- Verify: `npm run verify`
- Lint: `npm run lint` (fix: `npm run format`)
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Package smoke: `npm run smoke:package`
- Release dry run: `npm run release:dry-run`

## Project conventions

- Source code lives in `src/` (`cli`, `server`, `mcp`, `core`, `plugins`, `web`, `shared`).
- Tests live in `tests/`.
- The WS + scene wire contract lives in `src/shared/protocol.ts` (imported by Node AND the web bundle).
- The published package is `@trohde/agentic-canvas`; the executable and MCP server name remain `agentic-canvas`.
- Keep modules small and purpose-specific. Prefer explicit error handling (return `{ isError: true }` from tools) over silent failure.
- Server logs to stderr only; keep stdout clean.
- MCP development uses Streamable HTTP at `/mcp`; keep stdio out of v1 unless the project scope changes.

## Definition of done

- The app runs locally via `npm start` and opens a working Excalidraw canvas.
- The first-version scope in `PLAN.md` is implemented (baseline + Excalidraw MCP tools, save/open/screenshot/selection, live sync).
- Relevant tests pass; `npm run typecheck` and `npm run lint` are clean.
- `README.md` explains setup, usage, and verification, and its commands work.
