# PLAN.md — Add the `jsoncanvas` JSON Canvas plugin (plugin-neutral core + new backend)

> Source spec: `docs/project-briefs/agentic-canvas-jsoncanvas-plugin-spec.md`. This is the agent-ready implementation contract derived from it.

## Context

Agentic Canvas is a local-first Node process that serves a browser app, hosts an MCP server over Streamable HTTP (`/mcp`), and syncs scene state to the browser over WebSocket (`/ws`). Today it has exactly one canvas backend (Excalidraw), and the core is hard-coded to it: `Scene.elements: ExcalidrawElement[]`, `SerializedScene.type: "excalidraw"`, the WS protocol carries `elements/appState/files`, the CLI rejects any canvas but `excalidraw`, and `httpServer.ts` constructs the Excalidraw plugin directly.

We want a second, **portable, semantic** canvas: the open JSON Canvas format (`.canvas`) optimized for agent-readable knowledge maps (text/file/link cards, groups, labeled edges). It is Obsidian-compatible and complements (does not replace) Excalidraw. Because the core is Excalidraw-coupled, we must first make the core plugin-neutral, then add the JSON Canvas model, plugin, MCP tools, and a React Flow browser renderer.

**Outcome when done:** `npx @trohde/agentic-canvas --canvas jsoncanvas` starts a working JSON Canvas; agents can create/connect/group/search/layout cards and save/open standards-compatible `.canvas` files; humans can drag/edit/connect cards in the browser and those edits round-trip to the server; Excalidraw behaves exactly as before; `npm run verify` passes.

---

## 1. Outcome

Add `jsoncanvas` as a first-class canvas backend selectable via `--canvas jsoncanvas`. The core scene model, serialized scene, WebSocket protocol, CLI, and server wiring become plugin-neutral via a static plugin registry. JSON Canvas gets its own native model, `.canvas` serialization with validation/repair, a plugin implementing the shared `CanvasPlugin` interface, a set of JSON Canvas-specific MCP tools, and a React Flow (`@xyflow/react`) browser renderer with live sync, selection, and screenshot. Excalidraw remains unaffected (same tools, same files round-trip, all existing tests green).

## 2. Scope

### In scope
- Generalize core types: `Scene<TNative, TAppState>`, `SerializedScene<TData>`, neutral `CanvasObjectSummary`/`CanvasObjectDetail`, neutral `CanvasController`/`SceneSnapshot`, neutral WS protocol (`src/shared/protocol.ts`).
- Add a static plugin registry; make CLI + `httpServer.ts` resolve the plugin from it; add `GET /canvas-info`.
- Split MCP baseline tools into **universal** (registered for every plugin) and **Excalidraw-shape** (gated to plugins that opt in). Make `save_canvas`/`open_canvas` use a plugin-provided file extension.
- New `src/plugins/jsoncanvas/` plugin: model, Zod schemas, format (serialize/deserialize + `.canvas`), validation/repair, adapter, deterministic layout, search, plugin factory, and MCP tools (`add_text_card`, `add_file_card`, `add_link_card`, `create_group`, `connect_cards`, `update_card`, `update_edge`, `find_cards`, `find_edges`, `auto_layout_cards`, `apply_jsoncanvas_patch`).
- New browser renderer `src/web/canvases/jsoncanvas/` using `@xyflow/react`; a top-level web router that picks the renderer from `/canvas-info`; generalize `wsClient.ts` and extract shared sync/export helpers.
- Add `@xyflow/react` to `devDependencies`.
- Tests under `tests/jsoncanvas/` + fixtures under `tests/fixtures/jsoncanvas/`.
- Update `README.md` and `AGENTS.md` (remove the "no second plugin" rule, document `--canvas jsoncanvas`).

### Out of scope (do not do)
- Obsidian vault indexing, backlinks, link/file fetching or reading, markdown rendering libraries, URL previews, image/video rendering, syntax highlighting, graph-layout dependencies (`elkjs`/`dagre`), CRDTs/multiplayer, cloud sync, stdio MCP transport, auth, DB, a marketplace, dynamic plugin loading.
- Do **not** add Agentic Canvas metadata to the top-level `.canvas` file (runtime state stays in the in-memory wrapper only).
- Do **not** change Excalidraw tool names, schemas, or behavior; do not redesign the Excalidraw renderer.
- No speculative refactors beyond what plugin-neutrality requires.

## 3. Repository evidence

| Area | Evidence | Implication for an implementation agent |
|---|---|---|
| Tech stack | TypeScript ESM (`"type": "module"`), Node ≥20.19, npm (`package-lock.json`). Server bundled by `tsup` (`tsup.config.ts`), web by Vite (`vite.config.ts`) into `dist/web`. | Use ESM imports with `.js` suffixes; keep server code free of browser deps. |
| Plugin interface | `src/core/plugin.ts` — `CanvasPlugin` (name, createInitialScene, getMetadata, listObjects, getObject, createObject, updateObject, deleteObjects, clear, serialize, deserialize, registerTools) + `PluginToolContext`. | Extend this interface minimally; jsoncanvas implements it. |
| Core scene types (coupled) | `src/core/scene.ts` — `Scene { elements: ExcalidrawElement[]; appState; files; version }`, `SerializedScene { type: "excalidraw"; version: 2; ... }`, `CanvasObject { ...; raw: ExcalidrawElement }`, `CanvasObjectType` union, `cloneScene`/`cloneElement`. | These must be generalized in M0 without breaking Excalidraw. |
| Controller | `src/server/canvasController.ts` — `scene: Scene`, `getSnapshot(): {version,elements,appState,files}`, `replaceFromBrowser(elements,appState,files,origin)`, uses `cloneScene`, transaction/undo/redo. | Make generic over `native`/`appState`; delegate clone generically. |
| Baseline tools | `src/mcp/baselineTools.ts` — `registerBaselineTools`. Universal: get_canvas_state, list_objects, get_object, delete_object, clear_canvas, save_canvas, open_canvas, screenshot, get_selected_objects, select_objects, undo, redo. **Excalidraw-shape (coupled to `object.raw`/`object.style`/`CreateObjectSpec.type`):** create_object, update_object, find_objects, apply_canvas_patch, set_canvas_background. `.excalidraw`/`.png` hardcoded in `normalizeToolPath`. | Split universal vs shape; gate shape tools; parameterize file extension. |
| MCP assembly | `src/mcp/buildServer.ts` — registers baseline then `plugin.registerTools`. | Add the shape-tools gate here; jsoncanvas tools come via `registerTools`. |
| WS protocol | `src/shared/protocol.ts` — `scene:set`/`scene:changed` carry `elements/appState/files`; export/selection request-response. Imported by Node **and** web (`AGENTS.md`). | Generalize scene payload to `scene: unknown` + `canvas`; keep export/selection as-is. |
| WS bridge | `src/server/wsBridge.ts` — `broadcastScene`, `sendScene` builds `scene:set`, handles `scene:changed` → `controller.replaceFromBrowser`. Tested in `tests/wsBridge.test.ts`. | Update `sendScene`/`scene:changed` to neutral payload; keep timeout/echo logic. |
| Excalidraw plugin | `src/plugins/excalidraw/` — `index.ts` (factory + scene ops over `scene.elements`), `adapter.ts`, `format.ts`, `elements.ts`, `geometry.ts`, `layout.ts`, `flowchart.ts`, `textMetrics.ts`, `tools.ts`. | Mirror this layout for jsoncanvas (spec §8). Update `scene.elements`→`scene.native.elements`, `scene.files`→`scene.native.files`. |
| CLI | `src/cli/index.ts` — `--canvas` default `excalidraw`, rejects others (line 36); passes `canvas: "excalidraw"` literal to `startHttpServer`. | Validate against registry keys; pass selected key through. |
| Server wiring | `src/server/httpServer.ts` — `createExcalidrawPlugin()` direct (line 35); `StartServerOptions.canvas: "excalidraw"`. `src/server/app.ts` — `/healthz` returns `plugin.name`. | Resolve plugin from registry by key; add `/canvas-info`. |
| Web app | `src/web/main.tsx` → `<CanvasApp/>` (Excalidraw only). `src/web/CanvasApp.tsx`, `wsClient.ts`, `sceneApply.ts`, `sceneSync.ts`, `selection.ts`, `exportImage.ts`. No router, no `/canvas-info`. | Add router; reuse `CanvasWsClient`; new jsoncanvas renderer. |
| Tests | `tests/` (Vitest). `tests/helpers.ts` (`connectInMemory`, `jsonContent`, `textContent`). Patterns: `mcp-baseline.test.ts`, `mcp-apply-patch.test.ts`, `mcp-find-objects.test.ts`, `plugin-baseline.test.ts`, `wsBridge.test.ts`, `canvasController.test.ts`. No `tests/fixtures/` yet. | Add `tests/jsoncanvas/*` + `tests/fixtures/jsoncanvas/*` matching these patterns. |
| Commands | `package.json` scripts: `verify` = `typecheck && lint && test`; `typecheck`=`tsc --noEmit`; `lint`=`biome check .`; `test`=`vitest run`; `build`=`build:web && build:server`. | Run `npm run verify` after each milestone; `npm run build` before manual run. |
| Dependencies | `@xyflow/react` **absent**. `react`, `react-dom`, `@excalidraw/excalidraw` live in **devDependencies** (published package ships prebuilt `dist/web`). | Add `@xyflow/react` to **devDependencies**. |
| Agent guidance | `AGENTS.md` — "Node server must NOT import `@excalidraw/excalidraw`"; "no second plugin"; references deleted `PLAN.md`; tools return `{ isError: true }` on failure; stdout clean. | Keep Node free of renderer libs (no `@xyflow/react` in `src/server`/`src/core`/`src/mcp`). Update the "no second plugin" rule. |
| Lint/format | `biome.json` — 2-space indent, line width 100, recommended rules, organize imports. | Run `npm run format` before finishing. |

`Assumption`: `structuredClone` (Node ≥20) is acceptable for cloning generic scene `native`/`appState` (Excalidraw elements and JSON Canvas nodes/edges are plain JSON data). Verify Excalidraw round-trip tests still pass after switching `cloneScene`.

## 4. Design decision

**Make the core plugin-neutral by parameterizing the scene wrapper and isolating Excalidraw-shaped concerns, then add JSON Canvas as a parallel plugin + renderer.** Concretely:

- **Generic scene wrapper.** `Scene<TNative = unknown, TAppState = Record<string, unknown>> = { native: TNative; appState: TAppState; version: number }`. Excalidraw: `native = { elements: ExcalidrawElement[]; files: BinaryFiles }`, `appState = { viewBackgroundColor }`. JSON Canvas: `native = JsonCanvasDocument { nodes, edges }`, `appState = JsonCanvasAppState`. `SerializedScene<TData> = { type: string; version: number; source: "agentic-canvas"; data: TData }`. Replace `cloneScene` with a generic `structuredClone`-based clone of `{ native, appState, version }`.
- **Neutral object surface.** Widen `CanvasObjectType` to `string`; make `CanvasObjectSummary` geometry optional and add optional `label`/`pluginType`/`kind`; introduce `CanvasObjectDetail extends CanvasObjectSummary { raw: unknown }`. The plugin/controller `getObject` returns `CanvasObjectDetail`; Excalidraw's rich object type stays defined for Excalidraw-internal use and the gated shape tools cast to it. Make `createObject`/`updateObject` **optional** on `CanvasPlugin`; add `fileExtension: string`.
- **Tool split.** Keep `registerBaselineTools` for the **universal** subset (drives everything through controller/plugin methods + `plugin.fileExtension`). Move the **Excalidraw-shape** tools (`create_object`, `update_object`, `find_objects`, `apply_canvas_patch`, `set_canvas_background`) into a separate registrar gated in `buildServer.ts` to plugins that support the shape model (e.g. `typeof plugin.createObject === "function"`). Excalidraw keeps all its tools; jsoncanvas exposes only universal + its own tools (spec §15.1).
- **Neutral WS protocol.** `scene:set` and `scene:changed` carry `canvas: string` + `scene: unknown` (+ optional `appState`). Excalidraw's `scene` = `{ elements, files }`; JSON Canvas's `scene` = `{ nodes, edges }`. Keep export/selection messages unchanged.
- **Registry + routing.** Static `canvasPlugins` map (`{ excalidraw, jsoncanvas }`); CLI/`httpServer` resolve by key; `GET /canvas-info` returns `{ canvas, mcpUrl, wsUrl }`; a web router picks the renderer.
- **Browser.** Reuse `CanvasWsClient` (generalized). New `@xyflow/react` renderer maps JSON Canvas nodes/edges ↔ React Flow; React Flow state never leaks into `.canvas` (mapping is browser-only).

**Why this fits:** it follows the spec's milestones and file layout, keeps Excalidraw's types/behavior intact (changes are widening/additive + relocations), and confines the only new runtime dependency to the browser bundle — consistent with how Excalidraw/React are already handled.

**Risks/trade-offs:** the M0 type changes touch many files (mechanical). Mitigated by doing M0 as its own milestone gated on the full existing test suite staying green before any jsoncanvas code is added.

## 5. Implementation milestones

### Milestone M0: Plugin-neutral core (no behavior change)

**Goal:** Core, controller, protocol, CLI, server wiring, and baseline tools become plugin-agnostic; Excalidraw is selected via a registry and behaves identically.

**Files likely to change:**
- `src/core/scene.ts` (generic `Scene`/`SerializedScene`, neutral summaries, generic clone)
- `src/core/plugin.ts` (`fileExtension`, optional `createObject`/`updateObject`, neutral return types)
- `src/server/canvasController.ts` (generic scene/snapshot/replace/clone)
- `src/shared/protocol.ts` (neutral `scene:set`/`scene:changed`)
- `src/server/wsBridge.ts` (`sendScene`/`scene:changed` payloads)
- `src/mcp/baselineTools.ts` + `src/mcp/buildServer.ts` (universal vs gated shape tools, `fileExtension`)
- `src/plugins/excalidraw/index.ts`, `format.ts`, `adapter.ts`, `elements.ts` (read/write `scene.native.elements`/`scene.native.files`; implement `fileExtension`; provide the Excalidraw object type)
- `src/cli/index.ts`, `src/server/httpServer.ts` (registry resolution), new `src/core/registry.ts` (or `src/plugins/registry.ts`)
- `src/server/app.ts` (`GET /canvas-info`)
- `src/web/CanvasApp.tsx`, `src/web/wsClient.ts`, `src/web/sceneApply.ts`, `src/web/sceneSync.ts` (consume neutral `scene` payload for Excalidraw = `{ elements, files }`)

**Files to inspect first:**
- `src/core/scene.ts`, `src/core/plugin.ts`, `src/server/canvasController.ts`, `src/mcp/baselineTools.ts`, `src/plugins/excalidraw/index.ts`
- Tests that pin current behavior: `tests/canvasController.test.ts`, `tests/plugin-baseline.test.ts`, `tests/mcp-baseline.test.ts`, `tests/wsBridge.test.ts`, `tests/web-sceneApply.test.ts`, `tests/web-sceneSync.test.ts`

**Implementation steps:**
1. Generalize `src/core/scene.ts`: add `Scene<TNative,TAppState>` and `SerializedScene<TData>`; keep `ExcalidrawElement` + an `ExcalidrawNative = { elements; files }` type; widen `CanvasObjectType` to `string`; make `CanvasObjectSummary` geometry optional + add `label?`/`pluginType?`/`kind?`; add `CanvasObjectDetail`; replace `cloneScene` with generic `structuredClone` of the wrapper (keep `cloneElement` only if still referenced).
2. Update `src/core/plugin.ts`: add `readonly fileExtension: string`; make `createObject?`/`updateObject?` optional; type `getObject` → `CanvasObjectDetail | undefined`, `listObjects` → `CanvasObjectSummary[]`; `serialize` → `SerializedScene`.
3. Update `CanvasController`: store generic `Scene`; `getSnapshot()` → `{ version, canvas: plugin.name, native, appState }`; `replaceFromBrowser(native, appState?, origin?)`; clone via the generic helper; keep transaction/undo/redo logic intact.
4. Update `src/shared/protocol.ts`: `SceneSetMessage { type:"scene:set", canvas, version, scene: unknown, appState? }`; `SceneChangedMessage { type:"scene:changed", canvas, baseVersion, scene: unknown, appState? }`. Keep `Hello`/export/selection messages unchanged. Update `wsBridge.ts` accordingly.
5. Refactor MCP tools: keep universal tools in `registerBaselineTools`; extract shape tools (`create_object`, `update_object`, `find_objects`, `apply_canvas_patch`, `set_canvas_background`) into `registerShapeObjectTools`; in `buildServer.ts`, call it only when the plugin supports the shape model. Replace hardcoded `.excalidraw` in `save_canvas`/`open_canvas` with `context.controller`/`plugin.fileExtension`; keep `.png` for screenshots.
6. Update the Excalidraw plugin to use `scene.native.elements`/`scene.native.files`, set `fileExtension: ".excalidraw"`, keep `serialize`/`deserialize` producing `type: "excalidraw"` (now via `SerializedScene<ExcalidrawData>`), and provide its rich object type for the gated shape tools.
7. Add `src/core/registry.ts` exporting `canvasPlugins = { excalidraw: createExcalidrawPlugin }` (jsoncanvas added in M2). Update CLI validation to use registry keys; update `httpServer.ts` to construct `canvasPlugins[canvas]()`; broaden `StartServerOptions.canvas` to `string`.
8. Add `GET /canvas-info` in `app.ts` returning `{ canvas: plugin.name, mcpUrl, wsUrl }`.
9. Update the Excalidraw web path to read `scene` as `{ elements, files }` from the neutral `scene:set`, and send `{ elements, files }` in `scene:changed`. Generalize `wsClient.ts` send/receive signatures.

**Tests/checks for this milestone:**
- Update existing tests only where the wire/shape changed (e.g. `wsBridge.test.ts` scene payload, `web-sceneApply`/`web-sceneSync`). Do not weaken assertions.
- Run: `npm run verify`
- Run: `npm run build && npm start -- --canvas excalidraw` (smoke; Ctrl-C after confirming it serves).
- Expected result: all existing tests pass; Excalidraw save/open still produces `type:"excalidraw"` files; `/canvas-info` returns `excalidraw`.

**Acceptance criteria:**
- [ ] `--canvas excalidraw` works end-to-end with no behavior change.
- [ ] No Excalidraw-specific literals remain in `core`/`controller`/`protocol`/`cli`/`server` except inside the Excalidraw plugin.
- [ ] `GET /canvas-info` responds with the active canvas.
- [ ] Full existing test suite green.

**Rollback/safety note:** Pure refactor; no jsoncanvas code yet. If a wire change regresses Excalidraw, revert protocol/wsBridge changes together (they form one contract).

---

### Milestone M1: JSON Canvas model, schemas, format, validation

**Goal:** Standalone, tested JSON Canvas data layer (no plugin wiring yet).

**Files likely to change (new):**
- `src/plugins/jsoncanvas/model.ts` (types from spec §10: document, node union, edge, app state, colors, sides, ends)
- `src/plugins/jsoncanvas/schemas.ts` (Zod schemas for file format + MCP tool inputs)
- `src/plugins/jsoncanvas/format.ts` (`serialize`→`JSON.stringify(doc,null,2)+"\n"`, `deserialize`, `.canvas` extension handling)
- `src/plugins/jsoncanvas/validation.ts` (validate + repair per spec §18)
- `tests/jsoncanvas/jsoncanvas-format.test.ts`, `tests/jsoncanvas/jsoncanvas-validation.test.ts`
- `tests/fixtures/jsoncanvas/{minimal,text-file-link-group,labeled-edges,obsidian-sample}.canvas`

**Files to inspect first:** `src/plugins/excalidraw/format.ts`, `src/plugins/excalidraw/adapter.ts`, `src/mcp/schemas.ts` (Zod conventions), `tests/plugin-baseline.test.ts`.

**Implementation steps:**
1. Define model types exactly per spec §10 (text/file/link/group nodes; edges with sides/ends/color/label; `JsonCanvasColor = ` + "`#${string}`" + ` | "1".."6"`).
2. Zod schemas: node/edge/document schemas (integer geometry, min width/height, color enum, `http(s)` URL for links, `subpath` starts with `#`), plus per-tool input shapes.
3. `format.ts`: deserialize parses JSON, defaults missing `nodes`/`edges` to `[]`, preserves array order; serialize writes stable pretty JSON with trailing newline. `.canvas` extension append/validate (reuse the `normalizeToolPath` idea, JSON Canvas variant).
4. `validation.ts`: detect every error in spec §18.1; `repair:true` performs §18.2 fixes and returns warnings.
5. Write fixtures and tests (spec §20.1): serialize/deserialize round-trip per node type, append `.canvas`, reject wrong extension, preserve order; reject duplicate IDs/dangling edges/invalid sides/colors; repair drops dangling edges + reports warnings.

**Tests/checks for this milestone:**
- Run: `npm test -- jsoncanvas-format jsoncanvas-validation`
- Expected result: new tests pass; fixtures load and re-serialize without losing required fields.

**Acceptance criteria:**
- [ ] All node/edge types round-trip; order preserved; trailing newline present.
- [ ] Validation rejects malformed docs; repair mode fixes + warns.
- [ ] No coupling to core/controller yet.

**Rollback/safety note:** Self-contained new directory; deletable without affecting the rest.

---

### Milestone M2: JSON Canvas plugin baseline operations

**Goal:** `createJsonCanvasPlugin()` implements `CanvasPlugin`; registry + CLI + server accept `jsoncanvas`; universal MCP tools work.

**Files likely to change:**
- New `src/plugins/jsoncanvas/index.ts` (plugin factory), `src/plugins/jsoncanvas/adapter.ts` (node/edge → `CanvasObjectSummary`/`CanvasObjectDetail` per spec §14), `src/plugins/jsoncanvas/layout.ts` (grid placement for default coords), `src/plugins/jsoncanvas/search.ts`
- `src/core/registry.ts` (add `jsoncanvas: createJsonCanvasPlugin`)
- `src/cli/index.ts` help text; `src/server/httpServer.ts` (already registry-driven from M0)
- `tests/jsoncanvas/jsoncanvas-adapter.test.ts`, `tests/jsoncanvas/jsoncanvas-layout.test.ts`, and an MCP baseline test for jsoncanvas

**Files to inspect first:** `src/plugins/excalidraw/index.ts`, `src/plugins/excalidraw/adapter.ts`, `src/mcp/baselineTools.ts` (universal subset), `tests/mcp-baseline.test.ts`.

**Implementation steps:**
1. Implement plugin: `name:"jsoncanvas"`, `fileExtension:".canvas"`, `createInitialScene` (`{ native:{nodes:[],edges:[]}, appState:{}, version:0 }`), `getMetadata`, `listObjects` (nodes + edges, optional type filter), `getObject` (→ `CanvasObjectDetail` with `raw` + `references` incoming/outgoing/contained), `deleteObjects` (and cascade edges referencing deleted nodes), `clear`, `serialize`/`deserialize` (from M1). Omit `createObject`/`updateObject` (jsoncanvas uses its own tools in M3).
2. Adapter per spec §14.2: `pluginType` (`jsoncanvas.text|file|link|group|edge`), `kind`, summary text (first heading/80 chars, file+subpath, URL host/path, group label, edge label or `from -> to`).
3. ID strategy per spec §11 (`createJsonCanvasId(prefix)`); grid placement per spec §12.3 for omitted coords.
4. Register in `src/core/registry.ts`; update CLI help.
5. Tests: adapter mappings + references + group containment; layout determinism; an MCP test via `connectInMemory` asserting `get_canvas_state` returns `canvas:"jsoncanvas"`, `list_objects` returns nodes+edges, `save_canvas` writes `.canvas`, and that shape tools (`create_object`, `find_objects`) are **not** registered for jsoncanvas.

**Tests/checks for this milestone:**
- Run: `npm test -- jsoncanvas`
- Run: `npm run verify`
- Expected result: jsoncanvas baseline behaves; Excalidraw tests still green.

**Acceptance criteria:**
- [ ] `--canvas jsoncanvas` boots; `get_canvas_state.canvas === "jsoncanvas"`.
- [ ] `list_objects` includes nodes and edges; `save_canvas` writes `*.canvas`; `open_canvas` reads it.
- [ ] Excalidraw-shape tools absent under jsoncanvas.

**Rollback/safety note:** Registry entry is the only cross-cutting change; remove it to disable jsoncanvas.

---

### Milestone M3: JSON Canvas MCP tools

**Goal:** Agent-facing tools to build and edit maps, including atomic bulk patch.

**Files likely to change:**
- New `src/plugins/jsoncanvas/tools.ts` (registered by the plugin's `registerTools`)
- `src/plugins/jsoncanvas/search.ts`, `layout.ts`, `validation.ts` (used by tools)
- `tests/jsoncanvas/jsoncanvas-tools.test.ts`

**Files to inspect first:** `src/plugins/excalidraw/tools.ts`, `src/mcp/baselineTools.ts` (`applyCanvasPatch` transaction pattern + `errorResult`), `src/core/plugin.ts` (`PluginToolContext.controller.transaction`).

**Implementation steps:**
1. Implement spec §15.2–§15.12 tools, each mutating via `controller.mutateScene`/`controller.transaction`, returning `{ isError:true }` on validation failure: `add_text_card`, `add_file_card`, `add_link_card`, `create_group`, `connect_cards`, `update_card`, `update_edge`, `find_cards`, `find_edges`, `auto_layout_cards`, `apply_jsoncanvas_patch`.
2. Enforce rules: default sizes (spec §12.2), default grid placement, integer geometry, `toEnd` default `arrow`, both endpoints must exist for edges, reject fields not applicable to a node type, `null` removes optional fields, reject exact-duplicate edges, `http(s)`-only link URLs, `subpath` starts with `#`.
3. `auto_layout_cards`: deterministic layered layout per spec §12.4 (roots → longest-path layers → stable in-layer sort → orphans below → optional group resize); return moved IDs + old/new bounds. Plain TypeScript, no layout dependency.
4. `apply_jsoncanvas_patch`: all-or-nothing inside `controller.transaction`; validate final document before commit; support `repair`; return created/updated/deleted summaries.
5. Tests (spec §20): each tool creates valid native data; `connect_cards` valid edge; `find_cards` searches all fields; `apply_jsoncanvas_patch` atomic — a failing op leaves the scene unchanged; layout deterministic.

**Tests/checks for this milestone:**
- Run: `npm test -- jsoncanvas-tools jsoncanvas-layout`
- Run: `npm run verify`
- Expected result: a 10-card/12-edge map can be built in one patch; invalid patch rolls back fully.

**Acceptance criteria:**
- [ ] All JSON Canvas tools registered and validated.
- [ ] `apply_jsoncanvas_patch` is transactional and validated.
- [ ] Deterministic `auto_layout_cards` output.

**Rollback/safety note:** Tools live only in the jsoncanvas plugin; no impact on Excalidraw or universal tools.

---

### Milestone M4: Browser renderer (React Flow) + live sync

**Goal:** Render JSON Canvas in the browser with drag/resize/edit/connect/delete/selection/screenshot, syncing both directions.

**Files likely to change:**
- `package.json` (add `@xyflow/react` to **devDependencies**), lockfile
- New `src/web/canvases/jsoncanvas/{JsonCanvasApp,JsonCanvasNode,JsonCanvasEdge,JsonCanvasGroup}.tsx`, `editor.tsx`, `geometry.ts`
- New `src/web/App.tsx` (fetch `/canvas-info`, switch renderer) + `src/web/main.tsx` (render `<App/>`)
- `src/web/wsClient.ts` (generic scene payloads — from M0), optional `src/web/shared/{useCanvasSync,exportScreenshot}.ts`
- `tests/jsoncanvas/jsoncanvas-ws-roundtrip.test.ts` (server-side WS round-trip using the jsoncanvas plugin, mirroring `tests/wsBridge.test.ts`)

**Files to inspect first:** `src/web/CanvasApp.tsx`, `src/web/wsClient.ts`, `src/web/sceneApply.ts`, `src/web/exportImage.ts`, `src/web/selection.ts`, `tests/wsBridge.test.ts`, `vite.config.ts`.

**Implementation steps:**
1. Add `@xyflow/react`; confirm Vite bundles it into `dist/web` and the Node server still does not import it.
2. `App.tsx`: fetch `/canvas-info`; render `<CanvasApp/>` (Excalidraw) or `<JsonCanvasApp/>`.
3. Map JSON Canvas ↔ React Flow per spec §16.2 (nodes by type, edges with handles/labels/markers); keep the mapping browser-only so React Flow state never enters `.canvas`.
4. Handle `scene:set` (apply nodes/edges) and emit `scene:changed` with `{ nodes, edges }` on user edits (debounced, mirroring the Excalidraw echo-suppression in `sceneSync.ts`). Implement node card editors (text/link/file/group label), edge creation by dragging handles, delete, zoom/pan/fit.
5. Implement screenshot export (React Flow viewport → PNG → base64) responding to `export:request`; implement `selection:request`/`selection:set` against React Flow selection state.
6. Group rendering per spec §16.4 (behind nodes; geometric containment; moving a group does not move contents in MVP).
7. Add a server-side WS round-trip test for jsoncanvas (browser `scene:changed` → `controller` reflects nodes/edges; `scene:set` broadcast carries the JSON Canvas payload).

**Tests/checks for this milestone:**
- Run: `npm run verify`
- Run: `npm run build` (web bundle builds with `@xyflow/react`)
- Manual (spec §23): MCP-created card appears live; dragging a card updates `get_object` x/y; browser-created edge appears in server state; `screenshot` returns PNG.
- Expected result: bidirectional sync works; screenshot/selection work.

**Acceptance criteria:**
- [ ] Human edit appears in `list_objects` after WS sync; MCP-created card appears live in browser.
- [ ] `screenshot` returns a PNG from the JSON Canvas renderer; selection round-trips.
- [ ] `@xyflow/react` only in the browser bundle (not imported by Node code).

**Rollback/safety note:** Renderer is selected by `/canvas-info`; Excalidraw renderer path is untouched. Keep React Flow imports confined to `src/web/canvases/jsoncanvas`.

---

### Milestone M5: Docs, verification, release hygiene

**Goal:** Document usage and finish acceptance.

**Files likely to change:** `README.md`, `AGENTS.md`, `CHANGELOG`/release notes if present.

**Implementation steps:**
1. `README.md`: add `--canvas jsoncanvas` to flags, `npm start -- --canvas jsoncanvas` / `npx ... --canvas jsoncanvas`, the example MCP flow (spec §21), and the known-limitations note.
2. `AGENTS.md`: remove the "no second plugin" rule; document the two canvases and the registry; fix the dangling `PLAN.md` reference (point to `docs/project-briefs/PLAN.md`).
3. Run `npm run release:dry-run` (verify + build + smoke + audit + publish dry-run) and the manual checklist (spec §23).

**Tests/checks for this milestone:**
- Run: `npm run verify` then `npm run release:dry-run`
- Expected result: clean verify; dry-run packs successfully.

**Acceptance criteria:**
- [ ] README documents jsoncanvas usage and limitations.
- [ ] AGENTS.md no longer forbids a second plugin; references resolve.
- [ ] Manual checklist passes.

**Rollback/safety note:** Docs-only; no runtime impact.

## 6. Data, API, and interface contracts

### State/storage changes
| Object/file | Change | Migration needed? | Compatibility concern |
|---|---|---|---|
| `.canvas` files | New; standards-compliant JSON Canvas v1.0 | No | Must stay free of Agentic Canvas metadata (Obsidian compatibility) |
| `.excalidraw` files | Unchanged (`type:"excalidraw"`, version 2) | No | Existing files must still round-trip |
| In-memory `Scene` | `{ native, appState, version }` generic wrapper | N/A (runtime only) | Excalidraw native = `{ elements, files }` |

### API behavior (selected)
| Case | Input | Expected behavior | Error behavior |
|---|---|---|---|
| `save_canvas` (jsoncanvas) | `{ path:"research-map" }` | Writes `research-map.canvas` | Reject non-`.canvas` extension |
| `open_canvas` (jsoncanvas) | `.canvas` path | Validate; default missing arrays; preserve order | Reject dangling edges/non-integer geometry unless `repair:true` |
| `connect_cards` | from/to node IDs | Edge with `toEnd:"arrow"` default | Error if a node is missing or exact duplicate edge |
| `apply_jsoncanvas_patch` | bulk ops | All-or-nothing in a transaction; validate before commit | On any failure, scene unchanged; return error |
| `GET /canvas-info` | — | `{ canvas, mcpUrl, wsUrl }` | — |
| WS `scene:set`/`scene:changed` | — | `{ canvas, version/baseVersion, scene, appState? }`; `scene` = `{nodes,edges}` (jsoncanvas) or `{elements,files}` (excalidraw) | Stale `baseVersion` → server resends authoritative scene |

### Compatibility expectations
- Universal MCP tool names/behavior unchanged for Excalidraw. Excalidraw-shape tools remain available under Excalidraw only.

## 7. Test and verification plan

### Required checks
1. `npm run verify`
   - Purpose: typecheck + Biome lint + full Vitest suite.
   - Expected result: clean after every milestone.
2. `npm run build`
   - Purpose: confirm web bundle (incl. `@xyflow/react`) and server build.
   - Expected result: `dist/web` + `dist/cli/index.js` produced.

### Targeted tests
- `npm test -- jsoncanvas-format jsoncanvas-validation` — M1 model/format/validation.
- `npm test -- jsoncanvas-adapter jsoncanvas-layout` — M2 adapter/layout.
- `npm test -- jsoncanvas-tools` — M3 tools + atomic patch.
- `npm test -- jsoncanvas-ws-roundtrip` — M4 server WS round-trip.
- `npm test -- wsBridge canvasController mcp-baseline plugin-baseline` — Excalidraw regression guard after M0.

### Manual verification (spec §23)
- Step: `npm run build && npm start -- --canvas jsoncanvas --workspace <tmp>`; connect MCP; `add_text_card` ×3; `connect_cards` ×2; drag a card; `get_object`; edit text; `create_group`; `auto_layout_cards`; `save_canvas {path:"demo"}`; `clear_canvas`; `open_canvas {path:"demo"}`; `screenshot`.
- Expected observation: cards/edges appear live; drag/edit reflected in `get_object`; `demo.canvas` exists; scene restores; PNG returned.

### Verification fallback
If a command fails: report the exact command + failure; run the nearest narrower test (e.g. a single `jsoncanvas-*` file); state what remains unverified (e.g. browser interactions if no display); do not claim success for unverified behavior.

## 8. Implementation agent execution instructions

~~~text
Implement the work described in PLAN.md.

Follow milestones M0→M5 in order. Before editing, inspect the files listed in each milestone and confirm the plan still matches the repository. If the repo has changed, adapt minimally and explain the deviation.

Constraints:
- Make the smallest correct change; do M0 (plugin-neutral core) first and keep ALL existing tests green before adding any jsoncanvas code.
- Follow existing repo conventions (ESM `.js` import suffixes, Biome formatting, Vitest patterns, `{ isError:true }` tool errors, stdout clean).
- The Node server/core/mcp code must NOT import `@excalidraw/excalidraw` or `@xyflow/react`; renderer libs live only under `src/web`.
- Only new dependency permitted: `@xyflow/react` in devDependencies (M4).
- Do not change Excalidraw tool names, schemas, or behavior; do not write Agentic Canvas metadata into `.canvas` files.
- Add/update tests where PLAN.md specifies; run `npm run verify` after each milestone.
- If a verification command fails, diagnose whether it is your change or pre-existing/environment.
- Do not mark complete unless acceptance criteria are met or clearly state what remains unverified.

At the end provide: 1) summary of changes, 2) files changed, 3) tests/checks run + results, 4) deviations from PLAN.md, 5) remaining risks/follow-ups.
~~~

## 9. Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `--canvas jsoncanvas` starts without Excalidraw deps leaking into Node-only code; `--canvas excalidraw` unchanged.
- [ ] Universal MCP tools work for both canvases; JSON Canvas-specific tools work.
- [ ] `.canvas` files round-trip without losing required fields and contain no Agentic Canvas metadata.
- [ ] Browser↔server sync works both directions; screenshot and selection work for jsoncanvas.
- [ ] README + AGENTS.md updated; AGENTS.md no longer forbids a second plugin.
- [ ] Excalidraw remains unaffected (all prior tests green).

## 10. Open questions and assumptions

### Blocking questions
- None.

### Non-blocking assumptions
- Assumption: generic `structuredClone` is safe for cloning Excalidraw + JSON Canvas scenes.
  - Evidence: scenes are plain JSON data; `cloneScene`/`cloneElement` do no special object wiring beyond deep copy.
  - Verify: `tests/canvasController.test.ts` + Excalidraw plugin tests pass after the switch.
- Assumption: gating shape tools on `typeof plugin.createObject === "function"` correctly scopes them to Excalidraw.
  - Evidence: only Excalidraw implements the shape model; jsoncanvas intentionally omits `createObject`.
  - Verify: jsoncanvas MCP test asserts `create_object`/`find_objects` are not registered.
- Assumption: `@xyflow/react` belongs in devDependencies (like React/Excalidraw).
  - Evidence: published package ships prebuilt `dist/web`; `tsup` externalizes runtime deps only.
  - Verify: `npm run build` + `npm run smoke:package` succeed.

## 11. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| M0 type changes ripple widely and break Excalidraw | High | High | Do M0 as an isolated milestone; gate on full existing suite green before M1+ |
| Neutral WS protocol regresses Excalidraw sync | Medium | High | Update `protocol.ts`+`wsBridge.ts`+web together; rely on `wsBridge`/`web-scene*` tests |
| React Flow state leaks into `.canvas` | Medium | High | Keep mapping browser-only; serialize only native `{nodes,edges}`; validate on every browser change |
| Human edits produce invalid JSON Canvas | Medium | Medium | Validate (and optionally repair) before committing browser scenes |
| Auto-layout overwrites human layout | Low | Medium | Layout is explicit (a tool), never automatic after edits |
| New dependency increases bundle/footprint | Low | Low | devDependency only; confirmed by smoke/dry-run |

## 12. Final instruction to an implementation agent

Proceed milestone by milestone, validating with `npm run verify` after each meaningful change. M0 must leave Excalidraw behavior and tests untouched before any jsoncanvas code is added. If the plan conflicts with actual repository evidence, trust the repository, make the smallest reasonable adaptation, and report the deviation in the final summary.
