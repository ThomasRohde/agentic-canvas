# PLAN.md — Agentic Canvas

> Status: first-version blueprint for an autonomous implementation agent. Build the **smallest coherent version** that proves the full loop. Do not add anything in "Out of scope". Follow milestones in order; verify after each.

## 1. Product outcome

Agentic Canvas is a **local-first** desktop-in-the-browser application that gives an AI agent and a human a shared visual drawing surface. A human runs one command (`npx agentic-canvas`), a browser canvas opens, and an MCP-capable agent connects to a local MCP server to draw, inspect, modify, save, load, and screenshot objects on that canvas — with every change visible live in the browser. The first canvas type is **Excalidraw**. It is built as a small plugin system (one plugin shipped: Excalidraw) so other canvas engines can be added later without redesign. Success, locally, means: the app starts, the browser shows the canvas, an MCP client creates/edits objects that appear in the browser, a human edit is reflected back to the agent's view of the scene, and `save`/`open`/`screenshot` work — all with passing automated tests and clean lint/typecheck.

## 2. First-version scope

### In scope
- A `npx agentic-canvas`-style CLI that boots a single local Node process and (by default) opens the browser.
- A local HTTP server that: serves the built browser app, exposes an **MCP server over Streamable HTTP** at `/mcp`, and exposes a **WebSocket** at `/ws` for browser↔server scene sync.
- A browser app (React + Vite) that embeds **Excalidraw** and stays in sync with the server.
- A **server-authoritative scene model** (canonical Excalidraw element array held in Node) with bidirectional WS sync and echo-loop protection.
- An internal **plugin interface** (`CanvasPlugin`) with exactly one implementation: Excalidraw.
- **Baseline MCP tools** (shared contract, plugin-agnostic): `get_canvas_state`, `list_objects`, `get_object`, `create_object`, `update_object`, `delete_object`, `clear_canvas`, `save_canvas`, `open_canvas`, `screenshot`.
- **Excalidraw-specific MCP tools:** `draw_rectangle`, `draw_ellipse`, `draw_diamond`, `draw_line`, `draw_arrow` (optionally bound between two elements), `add_text` (standalone or bound into a container as a label), `create_frame`, `group_objects`, and a higher-level `create_flowchart(nodes, edges)`.
- File-based **save/open** of `.excalidraw` JSON inside a sandboxed workspace directory.
- **Screenshot** to PNG (returned inline to the agent and optionally written to a file), produced by the connected browser.
- Automated tests (Vitest) for the canvas core, the Excalidraw adapter/element builder, the baseline + Excalidraw MCP tools (via in-memory MCP transport), the WS sync hub, and workspace path safety. Lint (Biome), typecheck (`tsc`).
- `README.md` and `AGENTS.md`.

### Out of scope (do **not** build)
- Authentication, accounts, payments, admin tooling, analytics/telemetry.
- Cloud hosting/deployment pipelines, collaboration servers, multi-user persistence, real-time multi-client conflict resolution beyond simple last-write-wins.
- A database (use files only). Background jobs, queues, microservices.
- A second canvas plugin (e.g. tldraw), a plugin **marketplace**, remote plugin registry, or dynamic/remote plugin loading.
- **stdio** MCP transport (HTTP only in v1 — see Future Work), and the old HTTP+SSE transport.
- Internationalization, theming systems, a broad configuration framework, feature flags.
- Full Excalidraw feature coverage (images/embeds, libraries, rich text, laser pointer, presentation mode, custom fonts). Prefer a small reliable subset.

## 3. Recommended stack

| Layer | Choice | Rationale | Alternatives rejected |
|---|---|---|---|
| Language | **TypeScript** | One language across CLI, server, and browser; types make the MCP/scene/WS contracts explicit. | JS (loses contract safety) |
| Runtime | **Node.js ≥ 20** | LTS; required by MCP SDK; native ESM, `fetch`, `node:util parseArgs`, `crypto.randomUUID`. | Bun/Deno (less universal for `npx`) |
| Web framework | **React 19 + Vite 5** | Excalidraw **is** a React component; Vite is the standard fast bundler/dev server. | Next.js (server framework overkill for a local single-page canvas) |
| Server framework | **Express 4** + **`ws`** | Tiny, boring; MCP SDK has first-class Express Streamable-HTTP examples; `ws` for the sync socket. | Fastify (fine, less example coverage); raw `http` (more boilerplate) |
| MCP | **`@modelcontextprotocol/sdk@^1.29.0`** | Official SDK; provides `McpServer`, `StreamableHTTPServerTransport`, `StdioServerTransport`, `InMemoryTransport`, `Client`. Pinned to v1.x for deterministic imports. | v2 split packages (newer; pin-and-note instead — see §3 note); custom JSON-RPC (reinventing) |
| Canvas engine | **`@excalidraw/excalidraw@^0.18`** | The product mandates Excalidraw; ships `convertToExcalidrawElements`, `restore`/`restoreElements`, `exportToBlob`, `serializeAsJSON`. | tldraw (explicitly future) |
| Package manager | **npm** | Ubiquitous; `npx` distribution is the product's entry point. | pnpm/yarn (extra prereq for end users) |
| CLI parsing | **`node:util` `parseArgs`** (built-in) | Zero dependency; sufficient for a handful of flags. | commander/yargs (unnecessary deps) |
| Browser launch | **`open`** (npm) | Tiny, cross-platform browser launcher; `--no-open` disables. | hand-rolled `start`/`xdg-open` (brittle) |
| Validation | **Zod** | MCP SDK uses Zod for tool input schemas; reuse for scene/spec validation. | ajv/manual (more boilerplate) |
| Testing | **Vitest** (+ **jsdom** for adapter tests) | Fast, TS-native, shares Vite config; `jsdom` lets the element-builder round-trip through Excalidraw's `restoreElements` in tests. | Jest (slower TS setup); Playwright required (kept optional) |
| Lint/format | **Biome** | Single fast binary for lint **and** format, minimal config — lowest moving-part count. | ESLint + Prettier (more deps/config) |
| Typecheck | **`tsc --noEmit`** | Canonical; no extra dependency (TypeScript already present). | — |
| Build | **Vite** (web → `dist/web`) + **tsup** (server/CLI → `dist`) + **tsx** (dev runner) | Vite must bundle the React/Excalidraw app; tsup emits ESM Node output with a preserved shebang for the `bin`; tsx runs TS directly in dev. | tsc-only (can't bundle the web app; Node-ESM `.js`-extension friction) |
| Storage | **Local files** (`.excalidraw` JSON via `fs`) | Local-first; the Excalidraw save format is plain JSON. | SQLite/DB (not needed) |
| UI approach | **Single embedded Excalidraw canvas page** | Matches the product; no routing/design system needed. | Multi-page SPA (unnecessary) |
| Packaging | **npm package with a `bin`**, prebuilt `dist/` shipped | Enables `npx agentic-canvas`; end users install only runtime deps. | Electron (heavier; browser is sufficient) |

**MCP SDK version note (important for the implementer):** Install **`@modelcontextprotocol/sdk@^1.29.0`** and use the v1 subpath imports in §6/§7. A newer **v2** exists where the SDK is split into `@modelcontextprotocol/server`, `@modelcontextprotocol/node` (`NodeStreamableHTTPServerTransport`), `@modelcontextprotocol/express` (`createMcpExpressApp`), and `@modelcontextprotocol/client`, and where `registerTool` requires `inputSchema: z.object({...})`. If you deliberately adopt v2, map: `StreamableHTTPServerTransport` → `NodeStreamableHTTPServerTransport`; raw Zod shape → `z.object(shape)`; manual Express wiring → `createMcpExpressApp()`. **Default to v1.x** unless v1 fails to install.

## 4. Project structure

```text
agentic-canvas/
  README.md
  AGENTS.md
  PLAN.md
  package.json
  tsconfig.json                # base + typecheck (jsx: react-jsx)
  tsconfig.server.json         # tsup/tsc input for Node code (excludes src/web)
  vite.config.ts               # builds src/web -> dist/web; root index.html
  tsup.config.ts               # builds src/cli + server/mcp/core/plugins -> dist
  biome.json
  vitest.config.ts
  .gitignore
  index.html                   # Vite entry for the browser app
  src/
    cli/
      index.ts                 # #!/usr/bin/env node — parse flags, start server, open browser
    server/
      httpServer.ts            # create http.Server, mount Express + ws upgrade
      app.ts                   # Express app: static dist/web, /healthz, /mcp routes
      mcpHttp.ts               # StreamableHTTPServerTransport wiring (single local session)
      wsBridge.ts              # WebSocket sync hub: broadcast scene, request/await export
      canvasController.ts      # holds active plugin + Scene + version; applies ops; emits sync
      workspace.ts             # safe path resolution for save/open/screenshot
    mcp/
      buildServer.ts           # create McpServer, register baseline + plugin tools
      baselineTools.ts         # registers the 10 baseline tools against CanvasController
      schemas.ts               # Zod shapes for normalized object specs + tool inputs
    core/
      plugin.ts                # CanvasPlugin interface + in-process registry
      scene.ts                 # Scene type, versioning, normalized CanvasObject types
    plugins/
      excalidraw/
        index.ts               # CanvasPlugin impl (baseline ops over element array)
        elements.ts            # buildElement(): element schema + defaults (NO @excalidraw import)
        adapter.ts             # native element <-> normalized CanvasObject mapping
        tools.ts               # Excalidraw-specific MCP tools (incl. create_flowchart)
        flowchart.ts           # deterministic layout for create_flowchart
        format.ts              # .excalidraw serialize/deserialize (plain JSON, no @excalidraw import)
    web/
      main.tsx                 # React root; mounts CanvasApp
      CanvasApp.tsx            # <Excalidraw>, wires WS + export round-trip
      wsClient.ts              # browser WS client (apply scene:set, send scene:changed)
      exportImage.ts           # exportToBlob -> base64 PNG on demand
    shared/
      protocol.ts              # WS message types + Scene wire types (imported by server AND web)
      logger.ts                # tiny leveled logger (stderr)
  tests/
    elements.test.ts           # buildElement round-trips through restoreElements (jsdom)
    adapter.test.ts            # native <-> normalized mapping
    plugin-baseline.test.ts    # plugin baseline ops (create/update/delete/clear/list/get)
    mcp-baseline.test.ts       # MCP Client over InMemoryTransport calls each baseline tool
    mcp-excalidraw.test.ts     # Excalidraw-specific tools incl. create_flowchart
    wsBridge.test.ts           # broadcast + export request/response + loop guard
    workspace.test.ts          # save/open round trip + path-traversal rejection
  docs/
    architecture.md            # short diagram + data-flow notes (optional, generated last)
```

| Path | Purpose |
|---|---|
| `src/cli/index.ts` | The `bin` entry. Parses flags with `parseArgs`, starts the HTTP server, optionally opens the browser, prints the canvas + MCP URLs. |
| `src/server/canvasController.ts` | Single source of truth: holds the active plugin and current `Scene` (+ integer `version`), applies all mutations (from tools or WS), and notifies the WS bridge to broadcast. |
| `src/server/wsBridge.ts` | Manages browser WebSocket clients; broadcasts `scene:set`; performs `screenshot` as a correlated `export:request`/`export:result` round-trip with timeout. |
| `src/server/workspace.ts` | Resolves user-supplied paths against the workspace root and **rejects traversal outside it**; the only place that touches `fs` for save/open/screenshot. |
| `src/plugins/excalidraw/elements.ts` | Builds Excalidraw element JSON with all required fields/defaults. **Must not import `@excalidraw/excalidraw`** (keeps Node free of DOM-bound code). |
| `src/plugins/excalidraw/adapter.ts` | Translates between Excalidraw native elements and the plugin-agnostic `CanvasObject` used by baseline tools. |
| `src/shared/protocol.ts` | The WS message + Scene wire contract shared by Node and the browser bundle — the one file both build targets import. |
| `src/web/CanvasApp.tsx` | Mounts Excalidraw, applies server scenes via `updateScene`, echoes user edits, and answers export requests. The **only** place Excalidraw's runtime API is used. |
| `AGENTS.md` | Concise build/run/test guidance for this and future implementation agents (content in §8). |

## 5. Architecture and design

**Topology (one process):**
```
            ┌──────────────────────────── Node process (npx agentic-canvas) ───────────────────────────┐
 MCP client │  Express  ──/mcp (Streamable HTTP)──►  McpServer ──► CanvasController (authoritative Scene)│
 (agent) ──►│     │                                                      │  ▲                            │
            │     ├──/ (static dist/web)                                  │  │ apply ops / read           │
 Browser ◄──┼─────┘                                              broadcast│  │                            │
 (human)  ◄─┼──────────────── /ws (WebSocket) ◄──── wsBridge ◄────────────┘  └── user edits (scene:changed)
            └──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Main components:** CLI → HTTP server (Express static + `/mcp` + `/ws` upgrade) → `McpServer` (tools) → `CanvasController` (authoritative scene + versioning) ↔ `wsBridge` (browser sync + export) ↔ browser `CanvasApp` (Excalidraw).

**Data flow & state:**
- **Canonical state = Excalidraw native element array** held in `CanvasController` as plain JSON (`Scene = { elements, appState:{viewBackgroundColor}, files }`) plus a monotonically increasing integer `version`.
- **Agent write** (`create_object`, `draw_*`, etc.): tool handler → `CanvasController.apply(mutator)` → mutate elements, `version++` → `wsBridge.broadcast({type:'scene:set', version, elements, appState})` to **all** browser clients.
- **Agent read** (`list_objects`, `get_object`, `get_canvas_state`): resolved directly from the controller's in-memory scene via the adapter — no browser round-trip; works even if the browser momentarily disconnects.
- **Human edit:** Excalidraw `onChange` (debounced ~200ms) → browser sends `{type:'scene:changed', elements, appState}` → controller replaces scene, `version++`, broadcasts `scene:set` to **other** clients only.
- **Echo-loop guard:** when the browser applies a server `scene:set` it sets `applyingRemote=true` and skips the next `onChange`-driven `scene:changed`; the server never rebroadcasts a `scene:changed` to its originator. Browser uses `captureUpdate: "IMMEDIATELY"` so agent changes are human-undoable.
- **Element construction:** server builds elements by hand (`buildElement`) using the documented schema (§6 Data models). For bound arrows/labels it sets `startBinding`/`endBinding`/`containerId`/`boundElements` loosely; the browser's `updateScene` runs Excalidraw `restore({ repairBindings: true })` to finalize geometry. *(Fallback if fidelity is poor — see Risk register.)*
- **Screenshot:** `screenshot` tool → `wsBridge.requestExport(opts)` sends `{type:'export:request', id}` to one connected client → browser `exportToBlob` → `{type:'export:result', id, mimeType, base64}` → tool returns an MCP `image` content block (`{type:'image', data, mimeType}`) and, if `path` given, `workspace` writes the PNG. If no client is connected, return a clear MCP error.
- **Save/open:** `save_canvas` serializes `{type:'excalidraw',version:2,source:'agentic-canvas',elements,appState,files}` (plain `JSON.stringify`, **no `@excalidraw` import in Node**) to a workspace-resolved path; `open_canvas` reads/validates JSON, sets it as the scene (`version++`, broadcast). Browser normalizes on apply.

**Error handling:** tool handlers validate inputs with Zod and return `{ isError: true, content:[{type:'text', text}] }` on bad input / missing object id / no connected browser / export timeout / path outside workspace. The server logs to **stderr** only (stdout stays clean). Startup validates the workspace dir and port.

**Configuration:** CLI flags (with optional env fallbacks, §10). No config file in v1.

**Security/privacy:** local-only — bind to `127.0.0.1` by default; enable the SDK's DNS-rebinding protection with `allowedHosts: ['127.0.0.1','localhost']`. All file I/O is confined to the workspace root via `workspace.ts` (reject `..` escapes and absolute paths outside root). No secrets, no network calls, no telemetry.

**Accessibility:** Excalidraw provides its own canvas a11y; the app shell adds a visible "MCP: connected/url" status line and keeps the page keyboard-focusable. No custom complex UI.

**Intentionally simple:** full-scene replace on every change (no diffing/CRDT); single browser session assumed (broadcast supports several but no conflict UI); naive flowchart layout; no undo coordination beyond Excalidraw's own.

## 6. Data, API, and interface contracts

### UI screens or views
| View | Purpose | Main elements | Empty/error states |
|---|---|---|---|
| Canvas page (`/`) | The shared drawing surface | Full-window `<Excalidraw>`; small status bar showing canvas type, MCP URL, and WS connection state | Empty canvas on first load; "Disconnected — retrying…" banner if WS drops (auto-reconnect) |

### User interactions
| Interaction | Trigger | Expected behavior | Validation/error behavior |
|---|---|---|---|
| Human draws/edits/moves/deletes | Mouse/keyboard in Excalidraw | Debounced `scene:changed` to server; server becomes consistent; other clients update | If WS down, edits stay local and resync on reconnect (full scene) |
| Agent mutates scene | MCP tool call | `scene:set` broadcast; change appears live; human can Ctrl+Z | Invalid input → tool returns `isError` text; scene unchanged |
| Agent requests screenshot | `screenshot` tool | Browser exports PNG; returned inline (+ optional file) | No client/timeout → `isError` with guidance |
| WS reconnect | Browser reconnect | On `hello`, server replies full `scene:set` at current version | — |

### API endpoints (HTTP)
| Method | Path | Purpose | Request | Response | Error cases |
|---|---|---|---|---|---|
| GET | `/` and `/assets/*` | Serve built browser app (`dist/web`) | — | HTML/JS/CSS | 404 if asset missing |
| GET | `/healthz` | Liveness/readiness probe for tests | — | `200 {"status":"ok","canvas":"excalidraw","version":N}` | — |
| POST | `/mcp` | MCP Streamable HTTP requests | JSON-RPC (MCP) | JSON-RPC / SSE stream | `400` no/invalid session on non-initialize; `405` per SDK |
| GET | `/mcp` | MCP server→client SSE stream (session) | `mcp-session-id` header | `text/event-stream` | `400` missing session |
| DELETE | `/mcp` | Terminate MCP session | `mcp-session-id` header | `200` | `400` missing session |
| (WS) | `/ws` | Browser↔server scene sync | WS upgrade | JSON messages (see protocol) | Auto-reconnect on drop |

**Streamable HTTP wiring (v1.x):** maintain a single local session. On `POST /mcp`, reuse the existing `StreamableHTTPServerTransport` by `mcp-session-id`, or, when the body is an `initialize` request (`isInitializeRequest` from `@modelcontextprotocol/sdk/types.js`), create one with `sessionIdGenerator: () => randomUUID()`, `enableDnsRebindingProtection: true`, `allowedHosts: ['127.0.0.1','localhost']`, connect the `McpServer`, then `await transport.handleRequest(req, res, req.body)`. `GET`/`DELETE` look the transport up by session id. Reference: `@modelcontextprotocol/typescript-sdk` Streamable-HTTP server example.

**WS protocol (`src/shared/protocol.ts`):**
```ts
// browser -> server
type Hello       = { type: 'hello' };
type SceneChanged= { type: 'scene:changed'; elements: ExcalidrawElement[]; appState?: { viewBackgroundColor?: string } };
type ExportResult= { type: 'export:result'; id: string; mimeType: string; base64: string };
type ExportError = { type: 'export:error'; id: string; message: string };
// server -> browser
type SceneSet    = { type: 'scene:set'; version: number; elements: ExcalidrawElement[]; appState?: { viewBackgroundColor?: string } };
type ExportRequest = { type: 'export:request'; id: string; mimeType?: 'image/png'; exportPadding?: number };
```

### CLI commands
| Command | Purpose | Arguments/options | Output | Error behavior |
|---|---|---|---|---|
| `agentic-canvas` | Start server + open browser | `--canvas <name>` (default `excalidraw`), `--port <n>` (default `3333`), `--host <h>` (default `127.0.0.1`), `--workspace <dir>` (default cwd), `--open`/`--no-open` (default open), `-h/--help`, `-v/--version` | Prints `Canvas: http://host:port` and `MCP: http://host:port/mcp`; stays running | Unknown `--canvas` → list available + exit 1; port in use → try next free port and print chosen one; bad workspace → exit 1 with message |

### Data models
**Scene (canonical, in `CanvasController`):**
| Model | Fields | Validation | Storage |
|---|---|---|---|
| `Scene` | `elements: ExcalidrawElement[]`, `appState: { viewBackgroundColor: string }`, `files: BinaryFiles`, `version: number` | `version` strictly increasing; elements conform to element schema | In memory; persisted on `save_canvas` |

**Normalized `CanvasObject` (baseline-tool projection; `core/scene.ts`):**
```ts
type CanvasObjectType = 'rectangle'|'ellipse'|'diamond'|'line'|'arrow'|'text'|'frame';
interface CanvasObjectSummary { id: string; type: CanvasObjectType; x: number; y: number; width: number; height: number; text?: string; }
interface CreateObjectSpec {
  type: CanvasObjectType;
  x: number; y: number; width?: number; height?: number;
  text?: string;                         // text content (text type) or label
  points?: [number, number][];           // line/arrow, relative to x,y
  style?: { strokeColor?: string; backgroundColor?: string;
            fillStyle?: 'hachure'|'cross-hatch'|'solid';
            strokeWidth?: 1|2|4; strokeStyle?: 'solid'|'dashed'|'dotted';
            roughness?: 0|1|2; opacity?: number; fontSize?: number; textAlign?: 'left'|'center'|'right'; };
  start?: { elementId: string } | { x: number; y: number };  // arrow start
  end?:   { elementId: string } | { x: number; y: number };  // arrow end
  containerId?: string;                  // bind text into a container
  groupIds?: string[];
}
type UpdateObjectPatch = Partial<Omit<CreateObjectSpec,'type'>>;
```

**Excalidraw element schema essentials (`elements.ts` `buildElement` defaults — build by hand, no `@excalidraw` import):**
- Common (every element): `id` (string), `type`, `x`, `y`, `width`, `height`, `angle:0`, `strokeColor:'#1e1e1e'`, `backgroundColor:'transparent'`, `fillStyle:'solid'`, `strokeWidth:2`, `strokeStyle:'solid'`, `roughness:1`, `opacity:100`, `groupIds:[]`, `frameId:null`, `roundness:null`, `seed` (random int), `version:1`, `versionNonce` (random int), `isDeleted:false`, `boundElements:null`, `updated` (ms), `link:null`, `locked:false`.
- Text adds: `text`, `fontSize:20`, `fontFamily:1`, `textAlign:'left'`, `verticalAlign:'top'`, `containerId:null`, `originalText`, `lineHeight:1.25`, `autoResize:true`.
- Linear/arrow adds: `points:[[0,0],[dx,dy]]`, `lastCommittedPoint:null`, `startBinding:null`, `endBinding:null`, `startArrowhead:null`, `endArrowhead:'arrow'` (arrows) / `null` (lines). Bindings: `{ elementId, focus:0, gap:4 }`, and push `{ id, type:'arrow' }` into each bound shape's `boundElements`.
- IDs/seeds use `crypto.randomUUID()` / random 31-bit ints. Excalidraw `restore({repairBindings:true})` in the browser fills any gaps and fixes binding geometry.

### MCP tool contracts

**Baseline (shared by all plugins — defined in `mcp/baselineTools.ts`):**
| Tool | Purpose | Input (Zod shape) | Output |
|---|---|---|---|
| `get_canvas_state` | Canvas metadata/state | `{}` | text JSON: `{ canvas, version, objectCount, viewBackgroundColor, clientsConnected }` |
| `list_objects` | List object summaries | `{ type?: CanvasObjectType }` | text JSON: `CanvasObjectSummary[]` |
| `get_object` | Full normalized object | `{ id: string }` | text JSON: object detail, or `isError` if missing |
| `create_object` | Create one object | `CreateObjectSpec` | text JSON: `{ id }` |
| `update_object` | Patch an object | `{ id: string } & UpdateObjectPatch` | text JSON: `{ id }`, or `isError` |
| `delete_object` | Delete object(s) | `{ ids: string[] }` | text JSON: `{ deleted: string[] }` |
| `clear_canvas` | Remove all elements | `{}` | text JSON: `{ cleared: true }` |
| `save_canvas` | Save `.excalidraw` to workspace | `{ path?: string }` (default `canvas.excalidraw`) | text JSON: `{ path }` (absolute), or `isError` |
| `open_canvas` | Load `.excalidraw` from workspace | `{ path: string }` | text JSON: `{ path, objectCount }`, or `isError` |
| `screenshot` | PNG of current scene | `{ path?: string, exportPadding?: number }` | `image` content block + optional `{ path }`; `isError` if no client/timeout |

**Excalidraw-specific (defined in `plugins/excalidraw/tools.ts`):**
| Tool | Purpose | Input (Zod shape) | Output |
|---|---|---|---|
| `draw_rectangle` | Rectangle (optional label) | `{ x,y,width,height, text?, style? }` | `{ id }` |
| `draw_ellipse` | Ellipse (optional label) | `{ x,y,width,height, text?, style? }` | `{ id }` |
| `draw_diamond` | Diamond (optional label) | `{ x,y,width,height, text?, style? }` | `{ id }` |
| `draw_line` | Polyline | `{ x,y, points:[[number,number]...], style? }` | `{ id }` |
| `draw_arrow` | Arrow, optionally bound | `{ start:{elementId}|{x,y}, end:{elementId}|{x,y}, text?, style? }` | `{ id }` |
| `add_text` | Standalone text or container label | `{ x?,y?, text, containerId?, style? }` | `{ id }` |
| `create_frame` | Frame grouping elements | `{ x,y,width,height, name?, childIds?: string[] }` | `{ id }` |
| `group_objects` | Group existing elements | `{ ids: string[] }` | `{ groupId }` |
| `create_flowchart` | Nodes + edges → laid-out, arrow-wired diagram | `{ nodes:[{id,label,shape?,x?,y?}], edges:[{from,to,label?}], direction?:'TB'|'LR', spacingX?, spacingY? }` | `{ nodeIds: Record<string,string>, arrowIds: string[] }` |

`create_flowchart` layout (`flowchart.ts`, deterministic): if a node has `x`/`y`, honor it; otherwise place nodes by insertion order along `direction` (TB = stacked rows, LR = columns) on a fixed grid (`spacingX≈220`, `spacingY≈140`, default node `160×60`). Create node shapes (default `rectangle`) with labels, then bound arrows for each edge via `startBinding`/`endBinding`. Layout is intentionally simple — no edge-crossing minimization.

## 7. Implementation milestones

### Milestone M1: Repository scaffold and agent guidance
**Goal:** An installable, lintable, type-checkable, testable empty skeleton.
**Files to create or change:**
- `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `tsup.config.ts`, `biome.json`, `vitest.config.ts`, `.gitignore`, `index.html`, `README.md` (skeleton), `AGENTS.md` (from §8), `src/shared/logger.ts`, `tests/smoke.test.ts` (trivial passing test).

**Reference patterns or docs to inspect first:**
- Vite "React + TS" template; Biome `init` defaults; Vitest config docs; `@modelcontextprotocol/sdk` README (install + imports).

**Implementation steps:**
1. `npm init`; add scripts: `dev`, `build`, `build:web`, `build:server`, `start`, `typecheck`, `lint`, `format`, `test`, `prepare`.
2. Add deps: runtime `@modelcontextprotocol/sdk@^1.29.0 express ws zod open`; dev `typescript @types/node @types/express @types/ws vite @vitejs/plugin-react react react-dom @excalidraw/excalidraw tsup tsx vitest jsdom @biomejs/biome`.
3. Configure `tsconfig.json` (`strict`, `jsx:'react-jsx'`, `moduleResolution:'Bundler'`, `noEmit`), `tsconfig.server.json` (excludes `src/web`), `tsup.config.ts` (entry `src/cli/index.ts`, `format:['esm']`, `target:'node20'`, shebang preserved, `clean`), `vite.config.ts` (react plugin, `build.outDir:'dist/web'`), `biome.json`, `vitest.config.ts` (`environment:'node'`, jsdom per-file via comment).
4. Add `bin: { "agentic-canvas": "dist/cli/index.js" }`, `type: "module"`, `files: ["dist"]`, `engines.node: ">=20"`.
5. Add the trivial smoke test.

**Tests/checks for this milestone:**
- Run: `npm install`
- Run: `npm run typecheck` → no errors.
- Run: `npm run lint` → clean.
- Run: `npm test` → smoke test passes.

**Acceptance criteria:**
- [ ] `npm install` succeeds.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all pass.
- [ ] `AGENTS.md` and skeleton `README.md` exist.

**Rollback/safety note:** Pure scaffold; if tooling misbehaves, delete generated config and regenerate from the Vite/Biome defaults. No product code yet.

### Milestone M2: Canvas core + Excalidraw plugin baseline ops (headless)
**Goal:** Pure, fully-tested domain layer — build/list/get/create/update/delete/clear/serialize/deserialize over an Excalidraw element array, with no server or browser.
**Files to create or change:**
- `src/core/scene.ts`, `src/core/plugin.ts`, `src/plugins/excalidraw/{index.ts,elements.ts,adapter.ts,format.ts}`, `tests/{elements,adapter,plugin-baseline}.test.ts`.

**Reference patterns or docs to inspect first:**
- §6 element schema; Excalidraw `restoreElements`/`convertToExcalidrawElements` docs; `.excalidraw` JSON shape.

**Implementation steps:**
1. Define `Scene`, `CanvasObject*`, `CreateObjectSpec`, `CanvasPlugin` interface (`createInitialScene`, `listObjects`, `getObject`, `createObject`, `updateObject`, `deleteObjects`, `clear`, `getMetadata`, `serialize`, `deserialize`, `registerTools`).
2. Implement `elements.ts` `buildElement(spec)` with all defaults (§6). No `@excalidraw` import.
3. Implement `adapter.ts` (native ↔ normalized).
4. Implement `index.ts` baseline ops over the elements array; `format.ts` save/open JSON (plain).
5. In `tests/elements.test.ts` add `// @vitest-environment jsdom`, import `restoreElements` from `@excalidraw/excalidraw`, and assert built elements survive normalization (ids stable, types preserved, bindings intact). If `restoreElements` cannot run in jsdom, fall back to asserting structural validity against the schema and record the limitation (this is the empirical answer to "can Node/jsdom run Excalidraw restore").

**Tests/checks for this milestone:**
- Run: `npm test` → `elements`, `adapter`, `plugin-baseline` pass.
- Expected result: create→list→get→update→delete→clear behave; save→deserialize round-trips identical elements.

**Acceptance criteria:**
- [ ] Baseline ops covered by tests and passing.
- [ ] `buildElement` output validated (via `restoreElements` or schema).
- [ ] `.excalidraw` serialize/deserialize round-trips.

**Rollback/safety note:** No I/O or network; revert by deleting `plugins/excalidraw` and `core`. The jsdom finding informs later milestones.

### Milestone M3: MCP server + baseline tools over in-memory transport
**Goal:** A working `McpServer` whose baseline tools mutate a `CanvasController`, proven via an in-process MCP client.
**Files to create or change:**
- `src/server/canvasController.ts`, `src/mcp/{buildServer.ts,baselineTools.ts,schemas.ts}`, `src/server/workspace.ts`, `tests/{mcp-baseline,workspace}.test.ts`.

**Reference patterns or docs to inspect first:**
- MCP SDK v1 `McpServer.registerTool` (raw Zod shape `inputSchema`), `InMemoryTransport.createLinkedPair`, `Client.callTool`; image content `{type:'image',data,mimeType}`.

**Implementation steps:**
1. `CanvasController`: holds plugin + `Scene` + `version`; `apply(mutator)` bumps version and invokes an injected `onChange` (wsBridge later); read methods for tools.
2. `workspace.ts`: `resolveInWorkspace(p)` rejecting traversal/abs-escape; `readFile`/`writeFile` helpers.
3. `baselineTools.ts`: register the 10 baseline tools; `screenshot` calls an injected `exporter` (stubbed in this milestone to return `isError: 'no canvas client'`).
4. `buildServer.ts`: create `McpServer`, register baseline tools, then `plugin.registerTools(server, ctx)`.
5. `tests/mcp-baseline.test.ts`: link `Client`↔`McpServer` via `InMemoryTransport`; call each baseline tool; assert controller state + responses. `tests/workspace.test.ts`: save/open round trip + traversal rejection.

**Tests/checks for this milestone:**
- Run: `npm test` → `mcp-baseline`, `workspace` pass.
- Expected result: each baseline tool callable in-process; `save_canvas`/`open_canvas` hit the sandboxed workspace; traversal rejected.

**Acceptance criteria:**
- [ ] All baseline tools callable via MCP `Client` in-process.
- [ ] Workspace path safety enforced and tested.
- [ ] `screenshot` returns a clear error when no exporter/client.

**Rollback/safety note:** No HTTP/browser; entirely in-memory + temp-dir file tests. Revert by removing `src/mcp` and `canvasController.ts`.

### Milestone M4: HTTP server, Streamable-HTTP MCP, WS bridge, CLI
**Goal:** `npx`-able process serving the (placeholder) web app, MCP over HTTP, and a working WS sync hub + screenshot round-trip.
**Files to create or change:**
- `src/server/{httpServer.ts,app.ts,mcpHttp.ts,wsBridge.ts}`, `src/cli/index.ts`, `src/shared/protocol.ts`, `tests/wsBridge.test.ts`.

**Reference patterns or docs to inspect first:**
- SDK Streamable-HTTP Express example (session by `mcp-session-id`, `isInitializeRequest`, `enableDnsRebindingProtection`/`allowedHosts`); `ws` server `handleUpgrade`.

**Implementation steps:**
1. `wsBridge.ts`: track clients; `broadcast(sceneSet, exceptClient?)`; `requestExport(opts)` → send `export:request` with `randomUUID`, await `export:result`/`export:error` with timeout (default 10s); on `hello` send current `scene:set`; on `scene:changed` call `controller.apply` (origin-tagged, rebroadcast to others). Wire `controller.onChange → broadcast`.
2. `mcpHttp.ts`: implement the single-session Streamable-HTTP handlers (POST/GET/DELETE) per §6.
3. `app.ts`: Express serving `dist/web` (fallback to a minimal placeholder page if not built), `/healthz`, mount `/mcp`.
4. `httpServer.ts`: create `http.Server`, attach Express, handle `/ws` upgrade.
5. `cli/index.ts`: parse flags (`parseArgs`), pick a free port if needed, start server, `open` the canvas URL unless `--no-open`, print URLs; `--help`/`--version`.
6. `tests/wsBridge.test.ts`: drive the bridge with a fake WS client object — assert broadcast on apply, export round-trip success, export timeout error, and loop-guard (no rebroadcast to origin).

**Tests/checks for this milestone:**
- Run: `npm test` → `wsBridge` passes.
- Run: `npm run build:server && node dist/cli/index.js --no-open --port 3939` (background), then `GET /healthz` → `{"status":"ok"}`; connect an MCP `Client` over `StreamableHTTPClientTransport` to `http://127.0.0.1:3939/mcp` and call `get_canvas_state` → success. Stop the process.

**Acceptance criteria:**
- [ ] Server boots; `/healthz` ok; `/mcp` initialize + tool call works over HTTP.
- [ ] WS bridge broadcasts, performs export round-trip, enforces loop guard (tested).
- [ ] CLI parses flags, selects a free port, prints Canvas + MCP URLs.

**Rollback/safety note:** Bind to `127.0.0.1` only. If port logic misbehaves, hard-set `--port`. Web app can be a placeholder here.

### Milestone M5: Browser app (React + Excalidraw) with live sync + export
**Goal:** The real canvas — Excalidraw mounted, applying server scenes, echoing human edits, answering export requests. Completes the visible loop.
**Files to create or change:**
- `index.html`, `src/web/{main.tsx,CanvasApp.tsx,wsClient.ts,exportImage.ts}`.

**Reference patterns or docs to inspect first:**
- Excalidraw `excalidrawAPI` prop, `updateScene({elements,appState,captureUpdate})`, `onChange`, `exportToBlob`; required CSS import `@excalidraw/excalidraw/index.css`.

**Implementation steps:**
1. `wsClient.ts`: connect to `/ws`, auto-reconnect; on open send `hello`; dispatch `scene:set`/`export:request`; expose `sendSceneChanged`, `sendExportResult`.
2. `exportImage.ts`: `exportToBlob({elements,appState,files,mimeType:'image/png',exportPadding})` → strip the `data:` prefix → base64.
3. `CanvasApp.tsx`: mount `<Excalidraw excalidrawAPI initialData onChange>`; apply `scene:set` via `updateScene` (`captureUpdate:'IMMEDIATELY'`, set `applyingRemote`); debounce `onChange`→`scene:changed` (skip while `applyingRemote`); handle `export:request`→`sendExportResult`; render a status bar (canvas type, MCP URL, WS state).
4. `main.tsx`/`index.html`: React root.

**Tests/checks for this milestone:**
- Run: `npm run build` (web + server).
- Manual (see §11 Manual verification): start app, drive via MCP client, confirm shapes appear, screenshot returns PNG, save/open work, and a hand edit is reflected in `list_objects`.

**Acceptance criteria:**
- [ ] Browser shows Excalidraw; agent `create_object`/`draw_*` appear live.
- [ ] `screenshot` returns a non-empty PNG of the scene.
- [ ] A human edit changes the server scene (visible via `list_objects`).
- [ ] `npm run build` produces `dist/web` + `dist` server output.

**Rollback/safety note:** Web is isolated under `src/web`; if Excalidraw integration breaks, the server/MCP layers (M1–M4) still pass their tests. Verify `restoreElements` behavior learned in M2 informs binding handling.

### Milestone M6: Excalidraw-specific tools (incl. create_flowchart)
**Goal:** High-value Excalidraw constructs beyond the baseline.
**Files to create or change:**
- `src/plugins/excalidraw/{tools.ts,flowchart.ts}`, `tests/mcp-excalidraw.test.ts`.

**Reference patterns or docs to inspect first:**
- §6 tool contracts; arrow binding fields; container-bound text; §6 `create_flowchart` layout.

**Implementation steps:**
1. `tools.ts`: register `draw_rectangle/ellipse/diamond/line`, `draw_arrow` (resolve `start`/`end` element ids → bindings + update `boundElements`), `add_text` (standalone or `containerId` label), `create_frame` (set `frameId` on children), `group_objects` (shared `groupId`).
2. `flowchart.ts`: deterministic layout; `create_flowchart` creates node shapes (+labels) then bound edge arrows; returns id maps.
3. `tests/mcp-excalidraw.test.ts`: via in-memory `Client`, assert each tool produces the expected element(s); for `draw_arrow`/`create_flowchart` assert bindings reference real ids and `boundElements` updated.

**Tests/checks for this milestone:**
- Run: `npm test` → `mcp-excalidraw` passes.
- Manual: `create_flowchart` renders connected boxes with arrows in the browser.

**Acceptance criteria:**
- [ ] All Excalidraw-specific tools callable and tested.
- [ ] Bound arrows reference existing elements; flowchart wires edges.

**Rollback/safety note:** Additive to M3's registration; if bindings render poorly, fall back to browser-side `convertToExcalidrawElements` (Risk register) without changing tool signatures.

### Milestone M7: Hardening — errors, edge cases, screenshot-to-file, docs
**Goal:** Production-minded robustness and complete docs.
**Files to create or change:**
- `src/server/workspace.ts` (screenshot file write), `src/mcp/baselineTools.ts` (error paths), `README.md` (final), `docs/architecture.md`, `tests/*` (edge cases).

**Implementation steps:**
1. Finalize error messages: missing id, no connected client, export timeout, path outside workspace, unknown `--canvas`.
2. `screenshot` writes PNG to workspace when `path` given (decode base64) and returns absolute path.
3. Finalize `README.md` (§9) and `docs/architecture.md`.
4. Add edge-case tests (empty scene state, delete missing id, open malformed JSON).

**Tests/checks for this milestone:**
- Run: `npm run typecheck && npm run lint && npm test && npm run build` → all green.

**Acceptance criteria:**
- [ ] Clear, tested error behavior across tools.
- [ ] `screenshot --path` writes a real PNG file.
- [ ] README instructions match reality; full verification suite passes.

**Rollback/safety note:** Hardening only; each change is independently testable.

## 8. `AGENTS.md` content

~~~markdown
# AGENTS.md

## Project purpose

Agentic Canvas is a local-first, browser-based visual canvas that an AI agent controls through a local MCP server. The first canvas plugin embeds Excalidraw. A single `npx agentic-canvas` process serves the browser app, hosts an MCP server over Streamable HTTP, and syncs the canvas to the browser over WebSocket.

## Working rules

- Make the smallest correct change.
- Keep the first version simple; follow the stack and structure in `PLAN.md`.
- Do not introduce new dependencies without a clear reason.
- The Node server must NOT import `@excalidraw/excalidraw`; all Excalidraw runtime API usage lives in `src/web`.
- Add or update tests for behavior changes.
- Run the required verification commands before reporting completion.
- Do not add features listed as Out of scope in `PLAN.md` (no auth, no DB, no stdio transport, no second plugin).

## Commands

- Install: `npm install`
- Run locally: `npm run build && npm start -- --canvas excalidraw`  (dev: `npm run dev`)
- Test: `npm test`
- Lint: `npm run lint`   (fix: `npm run format`)
- Typecheck: `npm run typecheck`
- Build: `npm run build`

## Project conventions

- Source code lives in `src/` (`cli`, `server`, `mcp`, `core`, `plugins`, `web`, `shared`).
- Tests live in `tests/`.
- The WS + scene wire contract lives in `src/shared/protocol.ts` (imported by Node AND the web bundle).
- Keep modules small and purpose-specific. Prefer explicit error handling (return `{ isError: true }` from tools) over silent failure.
- Server logs to stderr only; keep stdout clean.

## Definition of done

- The app runs locally via `npm start` and opens a working Excalidraw canvas.
- The first-version scope in `PLAN.md` is implemented (baseline + Excalidraw MCP tools, save/open/screenshot, live sync).
- Relevant tests pass; `npm run typecheck` and `npm run lint` are clean.
- `README.md` explains setup, usage, and verification, and its commands work.
~~~

## 9. README requirements

`README.md` must include:
- **Name & description:** Agentic Canvas — a local-first visual canvas an AI agent drives via a local MCP server; first plugin embeds Excalidraw.
- **Prerequisites:** Node.js ≥ 20, npm; a modern browser; an MCP-capable client (e.g. Claude Code/Desktop).
- **Setup:** `npm install` then `npm run build`.
- **Run:** `npm start -- --canvas excalidraw` (or `npx agentic-canvas`). Document flags `--port`, `--host`, `--workspace`, `--no-open`.
- **Test/build:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- **Connect an MCP client (example):** `claude mcp add --transport http agentic-canvas http://127.0.0.1:3333/mcp`.
- **Usage example + expected output:** call `draw_rectangle {x:100,y:100,width:200,height:120,text:"Hello"}` → a labeled rectangle appears in the browser; `screenshot` → returns a PNG; `save_canvas {path:"demo.excalidraw"}` → writes the file; `clear_canvas` then `open_canvas {path:"demo.excalidraw"}` → restores it.
- **Manual verification path (UI):** the §11 manual loop.
- **Configuration/env:** §10 (none required; optional overrides).
- **Project structure summary:** condensed §4 tree.
- **Known limitations (v1):** HTTP transport only (no stdio); single browser session; full-scene sync (no diffing); screenshot requires a connected browser; Excalidraw subset only (no images/rich text/libraries).

## 10. Environment and configuration

`No environment variables are required for the first version.` Optional overrides (flags take precedence) may be supported for convenience:

| Variable/config | Required? | Default | Purpose | Where used |
|---|---:|---|---|---|
| `AGENTIC_CANVAS_PORT` | No | `3333` | Default server port | `src/cli/index.ts` |
| `AGENTIC_CANVAS_HOST` | No | `127.0.0.1` | Bind host (keep loopback) | `src/cli/index.ts` |
| `AGENTIC_CANVAS_WORKSPACE` | No | current working dir | Root for save/open/screenshot | `src/cli/index.ts`, `src/server/workspace.ts` |

No secrets and no `.env` are needed. Add `.env` and `dist/` to `.gitignore` regardless. Validate port/workspace at startup and exit non-zero with a clear message on failure.

## 11. Test and verification plan

### Required checks
1. `npm install`
   - Purpose: install dependencies.
   - Expected result: completes; `@modelcontextprotocol/sdk` resolves to a 1.x version.
2. `npm run typecheck`
   - Purpose: static type safety across CLI/server/web.
   - Expected result: no type errors.
3. `npm run lint`
   - Purpose: Biome lint/format check.
   - Expected result: no errors.
4. `npm test`
   - Purpose: unit + integration suite.
   - Expected result: all suites pass (`elements`, `adapter`, `plugin-baseline`, `mcp-baseline`, `mcp-excalidraw`, `wsBridge`, `workspace`).
5. `npm run build`
   - Purpose: produce `dist/web` (Vite) and `dist` server/CLI (tsup).
   - Expected result: both build; `dist/cli/index.js` has a Node shebang.
6. `node dist/cli/index.js --no-open --port 3939` (then probe, then stop)
   - Purpose: smoke-test the built server.
   - Expected result: `GET http://127.0.0.1:3939/healthz` → `{"status":"ok",...}`; an MCP `Client` over Streamable HTTP can `initialize` and call `get_canvas_state`.

### Targeted tests
- `tests/mcp-baseline.test.ts` — every baseline tool over `InMemoryTransport`.
- `tests/mcp-excalidraw.test.ts` — Excalidraw tools incl. `create_flowchart` bindings.
- `tests/wsBridge.test.ts` — broadcast, export round-trip, timeout, loop guard.
- `tests/elements.test.ts` — `buildElement` survives `restoreElements` (jsdom).
- `tests/workspace.test.ts` — save/open round trip + traversal rejection.

### Manual verification
- Step: `npm run build && npm start -- --canvas excalidraw` → browser opens to the canvas.
- Step: `claude mcp add --transport http agentic-canvas http://127.0.0.1:3333/mcp`, then from the client call `draw_rectangle`, `add_text`, `draw_arrow` (bound), `create_flowchart`.
- Expected observation: shapes/labels/arrows/flowchart appear live in the browser.
- Step: call `save_canvas {path:"demo.excalidraw"}`, then `clear_canvas`, then `open_canvas {path:"demo.excalidraw"}`.
- Expected observation: canvas clears, then the saved scene reloads; `demo.excalidraw` exists in the workspace.
- Step: call `screenshot`.
- Expected observation: a PNG of the current scene is returned (and written if `path` provided).
- Step: drag/edit a shape by hand, then call `list_objects`.
- Expected observation: the listing reflects the human edit (server stayed in sync).

### Verification fallback
If a command is unavailable, too slow, or fails on environment setup, the implementation agent should: (1) report the exact command and failure; (2) run the nearest narrower check (e.g. a single test file); (3) explain what remains unverified (especially anything needing a live browser); (4) not claim success for unverified behavior.

### Quality bar
Do not claim completion unless: the project installs; `npm start` runs and serves a working canvas; baseline + Excalidraw tools and sync are covered by passing tests; typecheck and lint are clean; and the README instructions work.

## 12. Implementation agent execution instructions

~~~text
Create the new project described in PLAN.md from scratch.

Follow the milestones in order. Before editing, inspect the current directory. If files already exist (e.g. PLAN.md, the two prompt files), preserve user work and adapt minimally. If the directory is otherwise empty, create the structure in PLAN.md.

Constraints:
- Implement the smallest coherent first version.
- Follow the stack, structure, and scope in PLAN.md.
- Pin @modelcontextprotocol/sdk to ^1.29.0 and use the v1 subpath imports; do not switch to the v2 split packages unless v1 fails to install (then apply the mapping in PLAN.md §3).
- The Node server must NOT import @excalidraw/excalidraw; all Excalidraw runtime API usage stays in src/web.
- Create AGENTS.md and README.md using the content/spec in PLAN.md.
- Do not add features listed as Out of scope (no auth, no DB, no stdio transport, no second plugin, no telemetry).
- Do not introduce extra dependencies beyond those listed unless required for in-scope behavior.
- Do not create cloud resources, real secrets, paid services, or external accounts.
- Add tests for core behavior; run the verification commands in PLAN.md §11.
- If a verification command fails, diagnose whether it is your change, missing setup, or an environment limitation.
- Do not mark the task complete unless the acceptance criteria are met; otherwise clearly state what remains unverified.

At the end, provide:
1. Summary of what was created.
2. Files created or changed.
3. How to run the project locally.
4. Tests/checks run and results.
5. Any deviations from PLAN.md.
6. Remaining risks or follow-ups, if any.
~~~

## 13. Acceptance criteria

- [ ] Repository scaffold is created (M1).
- [ ] `AGENTS.md` created with project-specific guidance (§8).
- [ ] `README.md` explains setup, usage, testing, and limitations (§9).
- [ ] The project installs (`npm install`).
- [ ] The project runs locally (`npm start` serves a working Excalidraw canvas).
- [ ] Baseline MCP tools implemented and tested (`get_canvas_state`, `list_objects`, `get_object`, `create_object`, `update_object`, `delete_object`, `clear_canvas`, `save_canvas`, `open_canvas`, `screenshot`).
- [ ] Excalidraw-specific tools implemented and tested (`draw_*`, `add_text`, `create_frame`, `group_objects`, `create_flowchart`).
- [ ] Live browser↔server sync works (agent writes appear; human edits reflected back).
- [ ] `save`/`open`/`screenshot` work locally.
- [ ] Out-of-scope functionality was NOT added (no auth/DB/stdio/second plugin/telemetry).
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass (or failures explained).
- [ ] No unnecessary dependencies, services, or infrastructure introduced.
- [ ] The final project matches this brief.

## 14. Open questions and assumptions

### Blocking questions
- None.

### Non-blocking assumptions
- Assumption: Package/CLI name is `agentic-canvas`; default port `3333`, host `127.0.0.1`.
  - Why reasonable: matches the brief's example; loopback is the safe local default.
  - How to verify/expose: implement as flags/env (§6/§10) so they're trivially changeable.
- Assumption: `@excalidraw/excalidraw` export/restore utilities are only reliably usable in the browser (DOM-dependent); the Node server builds elements by hand and the browser normalizes via `restore`.
  - Why reasonable: server-side DOM usability is undocumented/unverified; building plain JSON keeps Node DOM-free.
  - How to verify/expose: the M2 jsdom test for `restoreElements`; the browser-side `convertToExcalidrawElements` fallback (Risk register) is available without changing tool signatures.
- Assumption: A single browser session is the normal case; broadcast supports multiple viewers but there is no conflict-resolution UI.
  - Why reasonable: local single-user product.
  - How to verify/expose: full-scene last-write-wins sync; documented as a known limitation.
- Assumption: MCP SDK v1.x is the deterministic target; v2 split packages are documented but not used.
  - Why reasonable: v1 imports are stable and well-covered; reduces install/API risk.
  - How to verify/expose: pin `^1.29.0`; §3 note gives the v2 mapping if needed.
- Assumption: `screenshot` requires a connected browser (no headless renderer in v1).
  - Why reasonable: avoids a heavy Playwright/Puppeteer dependency; the browser is open during normal use.
  - How to verify/expose: tool returns a clear error when no client is connected; headless export is Future Work.

## 15. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Hand-built Excalidraw elements (esp. arrow bindings/labels) don't perfectly match Excalidraw's expectations | Medium | Medium | Browser `updateScene` runs `restore({repairBindings:true})`; M2 round-trip test; fallback: build via `convertToExcalidrawElements` in the browser and echo elements back to the server (tool signatures unchanged). |
| MCP Streamable-HTTP session/transport wiring is fiddly (v1 vs v2 API drift) | Medium | Medium | Pin v1.x; follow the SDK Express example; smoke-test `initialize` + a tool call in M4; §3 documents the v2 mapping. |
| WS echo loop or lost sync after reconnect | Medium | Medium | Server-authoritative + version counter; `applyingRemote` guard; never rebroadcast to origin; full `scene:set` on `hello`; covered by `wsBridge.test.ts`. |
| Excalidraw `restore`/export not usable in Node/jsdom | Medium | Low | Keep all Excalidraw runtime usage in the browser; M2 test empirically checks jsdom; structural-validation fallback. |
| `npx`/build ships without `dist/` or wrong bin shebang | Low | High | `files:["dist"]`, `prepare`/`prepublishOnly` build, tsup shebang banner; M5/M7 verify `node dist/cli/index.js`. |
| Port already in use | Medium | Low | Auto-select next free port and print the chosen URL; `--port` override. |
| Arbitrary file write via `save`/`open` path | Low | High | All file I/O confined to the workspace root; reject traversal/abs-escape; tested in `workspace.test.ts`. |
| Large scenes make full-scene sync slow | Low | Low | Acceptable for v1; diff/patch sync noted as Future Work. |

## 16. Future work

| Future item | Why deferred |
|---|---|
| stdio MCP transport (thin proxy to the running HTTP server) | HTTP covers v1 clients; keeps the first version single-process and simple. |
| Second canvas plugin (e.g. tldraw) | One plugin proves the interface; more is scope creep. |
| Headless/server-side screenshot (Playwright/Puppeteer) | Heavy dependency; browser-driven export suffices while a browser is open. |
| Scene diffing / incremental sync / CRDT collaboration | Full-scene last-write-wins is enough for local single-user v1. |
| Excalidraw images/embeds, rich text, libraries, custom fonts | Larger surface; v1 favors a small reliable subset. |
| Persistence beyond explicit save/open (autosave, history) | Not needed to prove the loop. |
| Auth, accounts, multi-user, cloud hosting, telemetry | Explicitly out of scope for a local-first tool. |
| Plugin discovery/marketplace/dynamic loading | A simple internal interface is sufficient for v1. |

## 17. Final instruction to an implementation agent

Build the project milestone by milestone, validating after each meaningful change with the §11 commands. Keep the Node server free of `@excalidraw/excalidraw` imports and keep all file I/O inside the workspace sandbox. If the actual directory contents conflict with this plan, preserve existing user work, make the smallest reasonable adaptation, and report the deviation in your final summary. Stop when the §13 acceptance criteria are met (or clearly state what remains unverified and why).
