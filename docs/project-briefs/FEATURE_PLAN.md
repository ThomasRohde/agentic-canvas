# PLAN.md — Codex behavior layer + agent-efficiency and diagram-quality MCP tools

## 1. Outcome

Make Agentic Canvas substantially better to drive from an MCP client (Codex, Claude) by adding the highest-value, lowest-risk increment from `FEATURE.md`: server-wide MCP `instructions`, committed Codex config profiles, a canvas-use playbook in `AGENTS.md`, and five new MCP tools — `find_objects`, `apply_canvas_patch`, `connect_objects`, `align_distribute_objects`, and `auto_layout_objects`. Agents gain semantic object targeting, one atomic multi-object call instead of ~20 small calls, bulk relationship drawing, and one-call legibility cleanup. The work is complete when these tools are registered, behave per the contracts below, are covered by tests in the existing style, and `npm run verify` and `npm run build` pass.

This plan deliberately covers only layers 1–3 of the `FEATURE.md` "Recommended implementation order" (the explicitly-named "sharpest first move" plus the diagram-quality layer). P1/P2 tools (`create_diagram`, `validate_canvas`/`repair_canvas`, `apply_theme`, `set_object_metadata`/`set_object_link`/`lock_objects`, `import_diagram_text`, `export_canvas`, `canvas_diff`/`snapshot_canvas`, `describe_canvas`) are explicitly out of scope here and left for follow-on plans.

## 2. Scope

### In scope

- Add MCP server `instructions` in `src/mcp/buildServer.ts` (one stable policy string).
- Add committed Codex example profiles under `docs/codex/` (`readonly`, `authoring`, `dangerous`) and a canvas-operation section in `AGENTS.md`; small README pointer.
- Add baseline tool `find_objects` (`src/mcp/baselineTools.ts`, schema in `src/mcp/schemas.ts`).
- Add baseline tool `apply_canvas_patch` with `create`/`update`/`delete` operations, `dryRun`, `returnObjects`, intra-patch key cross-references, atomic via `controller.transaction()`.
- Add Excalidraw plugin tool `connect_objects` (`src/plugins/excalidraw/tools.ts`).
- Add Excalidraw plugin tool `align_distribute_objects` (pure planner + tool wiring).
- Add Excalidraw plugin tool `auto_layout_objects` with `grid` mode (pure planner + tool wiring).
- Tests for each new tool in `tests/`, mirroring existing Vitest + `InMemoryTransport` style.
- Update `README.md` "Project Structure"/tool list and `docs/mcp-dev.md` only where a new file or tool needs a pointer.

### Out of scope

- `apply_canvas_patch` operations for `group`/`ungroup`/`frame`/`select`. Group/frame helpers live in the Excalidraw plugin (`src/plugins/excalidraw/index.ts`); routing them through the generic baseline tool would break the baseline/plugin split. Agents keep using existing `group_objects`, `create_frame`, `select_objects`. Document as a future patch-op extension.
- `auto_layout_objects` modes other than `grid` (`tree`, `layered-dag`, `pack-frames`, `swimlanes`). Return a `warnings` entry for unsupported modes.
- All P1/P2 tools listed in Section 1.
- Packaging a Codex plugin (FEATURE.md §4).
- MCP resources, prompts, sampling, elicitation, subscriptions (FEATURE.md §5).
- New runtime dependencies, stdio transport, auth, DB, a second plugin, or any change to `@excalidraw/excalidraw` usage in the server (forbidden by `AGENTS.md`).
- Renaming or changing schemas of existing tools.
- Visual redesign of the web app; changes to the WS/scene wire contract in `src/shared/protocol.ts`.

## 3. Repository evidence

| Area | Evidence | Implication for an implementation agent |
|---|---|---|
| Tech stack | `package.json`: `"type":"module"`, TypeScript 5.7, MCP SDK `^1.29.0`, `zod ^3.25`, `express`, `ws`; build via `tsup`/`vite`; tests via `vitest`; lint/format via `biome`. Node `>=20.19`. | Pure ESM TS. Use `.js` import specifiers (e.g. `from "./schemas.js"`). Add tools with `zod` input schemas. No new deps. |
| Relevant files | `src/mcp/buildServer.ts`, `src/mcp/baselineTools.ts`, `src/mcp/schemas.ts`, `src/plugins/excalidraw/tools.ts`, `src/plugins/excalidraw/index.ts`, `src/plugins/excalidraw/flowchart.ts`, `src/server/canvasController.ts`, `src/core/scene.ts`, `src/core/plugin.ts`. | Baseline tools register in `registerBaselineTools`; plugin tools in `registerExcalidrawTools`. Controller is the authoritative scene + `transaction()`/`mutateScene()`. |
| Existing patterns | `registerTool(name,{description,inputSchema},handler)`; handlers return `textResult(value)` (JSON in a text block) or `errorResult(err)` (`{isError:true,...}`); multi-step tools wrap `controller.transaction(() => …)` (`draw_arrow`, `create_frame`, `create_flowchart` in `tools.ts`). Pure deterministic planning separated into `flowchart.ts` (`planFlowchart`). | New tools must reuse `textResult`/`errorResult` helpers, wrap multi-object work in `transaction()`, and put pure layout math in a separate testable module mirroring `flowchart.ts`. |
| Normalized objects | `toCanvasObject` (`src/plugins/excalidraw/adapter.ts`) returns `{id,type,x,y,width,height,text,points,style,containerId,groupIds,frameId,raw}`; `raw` carries `link`, `locked`, `customData`, `boundElements`, `startBinding`/`endBinding`. Controller exposes `listObjects(type?)` and `getObject(id)`. | `find_objects` can filter entirely over `controller.listObjects()` + `controller.getObject(id)` without importing plugin internals. `align`/`auto_layout` read geometry and `raw.locked` the same way. |
| Atomicity / dryRun | `CanvasController.transaction()` snapshots the scene, and on any thrown error restores the snapshot and rethrows; on success commits once (`canvasController.ts:143–180`). `create_flowchart` relies on this for atomic rejection (test `tests/mcp-excalidraw.test.ts` "rejects bad edges atomically"). | `apply_canvas_patch` gets atomicity for free by throwing inside `transaction()`. `dryRun` = run ops inside a transaction, capture results, then throw a sentinel to roll back; catch it outside and return the captured preview. |
| MCP instructions | `@modelcontextprotocol/sdk` `ServerOptions.instructions` (`server/index.d.ts:15`) is emitted in the initialize result (`server/index.js:279`); `McpServer(serverInfo, options?)` (`server/mcp.d.ts:24`); client exposes `getInstructions()` (`client/index.d.ts:167`). `buildMcpServer` currently passes only `{name,version}`. | Add a second arg `{ instructions }` to `new McpServer(...)`. Assert via `client.getInstructions()` in a test. |
| Existing tests | `tests/mcp-baseline.test.ts`, `tests/mcp-excalidraw.test.ts` use `connectInMemory(server)` + `jsonContent`/`textContent` (`tests/helpers.ts`). `tests/flowchart.test.ts` unit-tests the pure planner. | New MCP tools: integration test over `InMemoryTransport`. New layout math: unit-test the pure planner directly. |
| Commands | `package.json` scripts: `verify` = `typecheck && lint && test`; `typecheck`=`tsc --noEmit`; `lint`=`biome check .`; `format`=`biome check --write .`; `test`=`vitest run`; `build`=`vite build && tsup`. README smoke: `node dist/cli/index.js --no-open --port 3939` then probe `/healthz`. | Run `npm run verify` after each milestone; `npm run format` to fix lint. Build smoke before claiming done. |
| Agent/repo guidance | `AGENTS.md`: smallest correct change; no new deps without reason; server must NOT import `@excalidraw/excalidraw`; add tests for behavior changes; do not rename tools/schemas without reason; return `{isError:true}` over silent failure; stderr-only logging. `docs/mcp-dev.md`: keep Streamable HTTP only; "Do not commit a `.codex/config.toml`". | Follow all. Commit Codex profiles under `docs/codex/` (examples), never as active `.codex/config.toml`. |

All rows above were observed in the repo. No row is inferred.

## 4. Design decision

**Chosen approach:** Extend the two existing registration seams (`registerBaselineTools`, `registerExcalidrawTools`) with new `registerTool` calls; keep generic, scene-only orchestration in the baseline (`find_objects`, `apply_canvas_patch`) and Excalidraw-aware geometry/relationships in the plugin (`connect_objects`, `align_distribute_objects`, `auto_layout_objects`). Put deterministic math in small pure modules mirroring `flowchart.ts` so it is unit-testable in isolation, and wrap every multi-object mutation in `controller.transaction()` for single-commit atomicity.

**Why it fits:** It reuses the controller primitives FEATURE.md itself calls out as "already controller-backed" (line 21), preserves the baseline/plugin split that `AGENTS.md` and `docs/architecture.md` rely on, requires zero new dependencies, and matches the established `textResult`/`errorResult`/`transaction` conventions exactly.

**Alternatives rejected:**
- Putting `group`/`frame`/`select` operations into `apply_canvas_patch` (baseline) — rejected: those helpers are plugin-specific; importing them into baseline breaks layering. Deferred as a future patch-op extension.
- Implementing all `auto_layout_objects` modes now — rejected: `layered-dag`/`pack-frames`/`swimlanes` need graph inference and frame packing; that is architectural expansion the meta-prompt warns against. Ship `grid` first behind a `mode` switch with a warning for the rest.

**Risks/trade-offs:** Intra-patch key cross-references add resolution logic to `apply_canvas_patch`; bounded and tested. `dryRun`-via-throw depends on `transaction()` rollback semantics; covered by an explicit "version unchanged after dryRun" assertion.

## 5. Implementation milestones

### Milestone M1: MCP server instructions

**Goal:**
The MCP server returns a stable `instructions` string in its initialize result.

**Files likely to change:**
- `src/mcp/buildServer.ts`
- `tests/mcp-baseline.test.ts` (or new `tests/mcp-instructions.test.ts`)

**Files to inspect first:**
- `src/mcp/buildServer.ts` (current `new McpServer({name,version})`)
- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts` (`instructions` option)
- `tests/helpers.ts` (`connectInMemory`)

**Implementation steps:**
1. Define a `const MCP_INSTRUCTIONS` string (top of `buildServer.ts`, or a new `src/mcp/instructions.ts` exporting it) keeping the first ~512 chars self-contained. Base it on FEATURE.md §1: prefer high-level tools over primitives; before editing an existing diagram call `get_canvas_state` and `find_objects`; use `apply_canvas_patch` for multi-object changes; use `auto_layout_objects`/`align_distribute_objects` after creating several related objects; never `clear_canvas` unless explicitly asked; save important results with `save_canvas`. Reference only tools that exist after this plan.
2. Pass it as the second argument: `new McpServer({ name: MCP_SERVER_NAME, version: packageInfo.version }, { instructions: MCP_INSTRUCTIONS })`.
3. Add a test that connects via `connectInMemory` and asserts `client.getInstructions()` is non-empty and contains a known phrase (e.g. `"apply_canvas_patch"`).

**Tests/checks for this milestone:**
- Add/update: `tests/mcp-instructions.test.ts` (or extend `tests/mcp-baseline.test.ts`)
- Run: `npm test -- mcp-instructions` (or `npm test`)
- Expected result: test passes; `client.getInstructions()` returns the policy string.

**Acceptance criteria:**
- [ ] `buildMcpServer` sets `instructions`.
- [ ] A test asserts the instructions are returned over `InMemoryTransport`.
- [ ] Instruction text references only tools that exist after this plan.
- [ ] Relevant tests pass.

**Rollback/safety note:**
Single additive argument; revert by removing the second `McpServer` argument and the test.

### Milestone M2: Codex profiles + canvas-use guidance

**Goal:**
Committed example Codex configs and an `AGENTS.md` playbook for *using* the canvas.

**Files likely to change:**
- `docs/codex/agentic-canvas-readonly.toml` (new)
- `docs/codex/agentic-canvas-authoring.toml` (new)
- `docs/codex/agentic-canvas-dangerous.toml` (new)
- `AGENTS.md`
- `README.md` and/or `docs/mcp-dev.md` (pointer only)

**Files to inspect first:**
- `docs/mcp-dev.md` ("Codex Configuration" section; "Do not commit a `.codex/config.toml`")
- `src/mcp/baselineTools.ts` and `src/plugins/excalidraw/tools.ts` (authoritative tool-name list)

**Implementation steps:**
1. Create three `.toml` examples under `docs/codex/` using the `[mcp_servers.agentic-canvas]` shape from FEATURE.md §2 (`url = "http://127.0.0.1:3333/mcp"`, timeouts, `default_tools_approval_mode`). Populate `enabled_tools` from the **actual** registered names:
   - `readonly`: `get_canvas_state`, `list_objects`, `get_object`, `find_objects`, `get_selected_objects`, `screenshot`.
   - `authoring`: readonly + `apply_canvas_patch`, `draw_rectangle`, `draw_ellipse`, `draw_diamond`, `draw_line`, `draw_arrow`, `add_text`, `connect_objects`, `align_distribute_objects`, `auto_layout_objects`, `create_frame`, `group_objects`, `ungroup_objects`, `remove_from_frame`, `create_flowchart`, `select_objects`, `set_canvas_background`, `save_canvas`, `undo`, `redo`.
   - `dangerous`: authoring + `clear_canvas`, `open_canvas`, `delete_object`.
2. Add a `## Canvas operation guidance` section to `AGENTS.md` (the using-the-canvas playbook from FEATURE.md §3), distinct from the existing development rules.
3. Add a one-line pointer from `README.md` ("Connect An MCP Client") and/or `docs/mcp-dev.md` to `docs/codex/`.

**Tests/checks for this milestone:**
- Add/update: none (docs only).
- Run: `npm run lint` (ensures repo still clean) and, with the server running, `npm run inspect:mcp` to list tools.
- Expected result: every tool named in the profiles appears in the Inspector tool list; no stale/renamed names.

**Acceptance criteria:**
- [ ] Three profiles exist under `docs/codex/` with only real tool names.
- [ ] No active `.codex/config.toml` is committed.
- [ ] `AGENTS.md` has a canvas-operation guidance section.
- [ ] Tool names cross-checked against `inspect:mcp` output (or the source registrations).

**Rollback/safety note:**
Docs-only and additive; deleting the new files fully reverts. Tool names depend on M3–M7; finalize this milestone last if profiles must list the new tools.

### Milestone M3: `find_objects` baseline tool

**Goal:**
Query normalized objects by text, type, frame/group, bounding box, style, link, custom metadata, and (optionally) current selection.

**Files likely to change:**
- `src/mcp/schemas.ts` (add `findObjectsShape`)
- `src/mcp/baselineTools.ts` (register `find_objects`)
- `tests/mcp-find-objects.test.ts` (new)

**Files to inspect first:**
- `src/mcp/baselineTools.ts` (`list_objects`, `get_object`, `BaselineToolContext`, `requestSelection`)
- `src/core/scene.ts` (`CanvasObject` shape)
- `src/plugins/excalidraw/adapter.ts` (`raw.link`, `raw.locked`, `raw.customData`)

**Implementation steps:**
1. Add `findObjectsShape` to `schemas.ts`: all fields optional — `type` (`canvasObjectTypeSchema`), `textContains` (string), `textRegex` (string), `frameId` (string), `groupId` (string), `bbox` (`{x,y,width,height}`) + `bboxMode` (`"intersects"|"contains"`, default `"intersects"`), `style` (subset of `styleSchema` to match exactly), `link` (string substring), `metadata` (`{ key: string, value?: ... }` matched against `raw.customData`), `selectedOnly` (boolean), `limit` (positive int, optional).
2. Register `find_objects` in `registerBaselineTools`. Implementation: start from `context.controller.listObjects()` ids → `context.controller.getObject(id)` for full objects; apply each provided filter (AND semantics). For `selectedOnly`, call `context.requestSelection()` and intersect (returns `isError` if no browser, matching `get_selected_objects`). Compile `textRegex` safely; on bad regex return `errorResult`.
3. Return `textResult({ count, ids, objects })` where `objects` are the matched `CanvasObject`s (same shape as `get_object`). Apply `limit` if given.

**Tests/checks for this milestone:**
- Add/update: `tests/mcp-find-objects.test.ts`
- Run: `npm test -- find-objects`
- Expected result: each filter narrows correctly; `textRegex` invalid → `isError`; type+textContains combine with AND; empty match returns `count:0` (not an error).

**Acceptance criteria:**
- [ ] `find_objects` registered with a zod schema and returns `{count,ids,objects}`.
- [ ] Filters compose with AND; no-match is a normal empty result.
- [ ] Invalid `textRegex` returns `{isError:true}`.
- [ ] `selectedOnly` without a browser returns the same error style as `get_selected_objects`.
- [ ] Relevant tests pass.

**Rollback/safety note:**
Read-only tool; no scene mutation. Remove the registration + schema + test to revert.

### Milestone M4: `apply_canvas_patch` baseline tool

**Goal:**
Apply an ordered list of `create`/`update`/`delete` operations atomically in one call, with `dryRun`, `returnObjects`, and intra-patch key references.

**Files likely to change:**
- `src/mcp/schemas.ts` (add `applyCanvasPatchShape` / operation union)
- `src/mcp/baselineTools.ts` (register `apply_canvas_patch`)
- `tests/mcp-apply-patch.test.ts` (new)

**Files to inspect first:**
- `src/server/canvasController.ts` (`transaction`, `createObject`, `updateObject`, `deleteObjects`)
- `src/plugins/excalidraw/tools.ts` (`create_flowchart` transaction + id-map pattern)
- `src/mcp/schemas.ts` (`createObjectShape`, `updateObjectShape`, `endpointSchema`)

**Implementation steps:**
1. Add an `operations` discriminated union to `schemas.ts`:
   - `{ op:"create", key?:string, spec:<createObjectShape object> }`
   - `{ op:"update", id:string, patch:<updateObjectShape minus id> }`
   - `{ op:"delete", ids: string[].min(1) }`
   Plus top-level `dryRun?:boolean` (default false), `returnObjects?:boolean` (default false).
2. Register `apply_canvas_patch`. Inside `context.controller.transaction(() => { … })`:
   - Maintain `idMap: Record<string,string>` (client `key` → new id) and arrays `created`/`updated`/`deleted`, plus `warnings`.
   - For each op in order: resolve key references first — if a `create` spec's `containerId`, or `start.elementId`/`end.elementId`, equals a previously-created `key`, substitute the mapped real id (so an arrow can reference a node created earlier in the same patch). Then call `controller.createObject`/`updateObject`/`deleteObjects`. Record the new id under `key` in `idMap`. An `update` to a missing id → push to `warnings` (do not throw) OR throw to abort — choose **throw** to keep "all-or-nothing" semantics consistent with `create_flowchart`; document this.
   - Validation/creation errors thrown by the plugin (e.g. `Object not found`) propagate → `transaction()` rolls back → tool returns `errorResult`.
3. `dryRun`: after collecting results inside the transaction, throw a private sentinel error (e.g. `class DryRunComplete`) carrying the collected payload; catch it *outside* `transaction()` (so the scene is rolled back) and return the payload with `dryRun:true`. Confirm `controller.currentVersion()` is unchanged in the dryRun test.
4. Return `textResult({ version, idMap, created, updated, deleted, warnings, ...(returnObjects ? { objects } : {}) })` where `objects` are the resulting `CanvasObject`s for created+updated ids.

**Tests/checks for this milestone:**
- Add/update: `tests/mcp-apply-patch.test.ts`
- Run: `npm test -- apply-patch`
- Expected result:
  - create two nodes + one arrow referencing their `key`s in one patch → arrow bound to both (`startBinding`/`endBinding` set); single version bump.
  - update + delete in same patch apply; `deleted` lists removed ids.
  - `dryRun:true` returns the would-be `idMap` but `controller.currentVersion()` and `listObjects()` are unchanged.
  - an op referencing a missing id throws → `{isError:true}` and scene unchanged (assert object count before == after).

**Acceptance criteria:**
- [ ] `apply_canvas_patch` registered; one `transaction()` per call (single scene commit on success).
- [ ] Intra-patch key references resolve for `containerId`/`start`/`end`.
- [ ] `dryRun` leaves version and object count unchanged.
- [ ] Failed op rolls back the entire patch and returns `{isError:true}`.
- [ ] `returnObjects` includes resulting objects when requested.
- [ ] Relevant tests pass.

**Rollback/safety note:**
All mutation is inside `transaction()`, which restores on throw. Revert by removing the registration, schema union, and test.

### Milestone M5: `connect_objects` Excalidraw tool

**Goal:**
Create many bound arrows from one call: `edges:[{fromId,toId,label?,style?}]`.

**Files likely to change:**
- `src/plugins/excalidraw/tools.ts` (register `connect_objects`)
- `tests/mcp-excalidraw.test.ts` (extend) or `tests/mcp-connect-objects.test.ts` (new)

**Files to inspect first:**
- `src/plugins/excalidraw/tools.ts` (`draw_arrow`, `create_flowchart` arrow loop)
- `src/plugins/excalidraw/index.ts` (`buildElementWithBindings`, `resolveEndpoint` — throws `Object not found`)
- `src/mcp/schemas.ts` (`styleSchema`)

**Implementation steps:**
1. Register `connect_objects` with `inputSchema: { edges: z.array(z.object({ fromId: z.string(), toId: z.string(), label: z.string().min(1).optional(), style: styleSchema.optional() })).min(1) }`.
2. In one `context.controller.transaction(() => …)`, for each edge call `context.controller.createObject({ type:"arrow", x:0, y:0, start:{elementId:fromId}, end:{elementId:toId}, text:label, style })` (mirrors `create_flowchart`). Collect `arrowIds`. Missing endpoint throws → rolls back.
3. Return `textResult({ arrowIds })`.

**Tests/checks for this milestone:**
- Add/update: connect-objects test
- Run: `npm test -- connect`
- Expected result: arrows created with `startBinding`/`endBinding` set to the given ids and labels bound; a missing `toId` returns `{isError:true}` with no partial arrows (object count unchanged).

**Acceptance criteria:**
- [ ] `connect_objects` registered; arrows auto-bound to endpoints.
- [ ] Optional labels and styles applied.
- [ ] Missing endpoint → atomic failure (`{isError:true}`, no partial creation).
- [ ] Relevant tests pass.

**Rollback/safety note:**
Single transaction; remove registration + test to revert.

### Milestone M6: `align_distribute_objects` Excalidraw tool

**Goal:**
Align/distribute/equalize a set of objects (or current selection) in one call.

**Files likely to change:**
- `src/plugins/excalidraw/layout.ts` (new pure planner) **or** inline pure function
- `src/plugins/excalidraw/tools.ts` (register tool)
- `tests/excalidraw-align.test.ts` (new, unit) + integration assertions

**Files to inspect first:**
- `src/plugins/excalidraw/flowchart.ts` + `tests/flowchart.test.ts` (pure-planner + unit-test pattern)
- `src/server/canvasController.ts` (`updateObject`, `transaction`)
- `src/plugins/excalidraw/index.ts` (`syncBoundElements` reroutes bound arrows on update)

**Implementation steps:**
1. Add a pure function `planAlignDistribute(objects, options)` in `layout.ts` taking `{id,x,y,width,height}` items and returning `{ id, x?, y?, width?, height? }` updates. Support `align: left|center|right|top|middle|bottom`, `distribute: horizontal|vertical`, `equalizeWidth`, `equalizeHeight`, `snapToGrid?: number`. Deterministic; no I/O.
2. Register `align_distribute_objects` with schema: `ids?: string[]`, plus the option fields above (at least one of `align`/`distribute`/`equalize*` required). If `ids` omitted, resolve from `context.requestSelection()` (browser-bound; error style as `get_selected_objects` when unavailable).
3. Resolve objects via `controller.getObject`; **skip** `arrow`/`line` and bound text labels (`containerId` set) and `raw.locked === true`, collecting their ids into `warnings`. Compute updates with `planAlignDistribute`, apply each via `controller.updateObject` inside one `transaction()`.
4. Return `textResult({ updated: string[], warnings })`.

**Tests/checks for this milestone:**
- Add/update: `tests/excalidraw-align.test.ts`
- Run: `npm test -- align`
- Expected result: unit test asserts exact coordinates for `align:left`, `distribute:horizontal`, `equalizeWidth`; integration test asserts locked objects are skipped and listed in `warnings`.

**Acceptance criteria:**
- [ ] Pure `planAlignDistribute` unit-tested with exact outputs.
- [ ] Tool aligns/distributes/equalizes unlocked shape/frame objects; one transaction.
- [ ] Locked and linear/bound objects skipped and reported in `warnings`.
- [ ] Selection fallback errors cleanly when no browser is connected.
- [ ] Relevant tests pass.

**Rollback/safety note:**
Geometry-only updates inside a transaction; remove planner, registration, and test to revert.

### Milestone M7: `auto_layout_objects` Excalidraw tool (grid mode)

**Goal:**
Re-lay-out a set of objects deterministically; ship `mode:"grid"` first.

**Files likely to change:**
- `src/plugins/excalidraw/layout.ts` (add `planGridLayout`)
- `src/plugins/excalidraw/tools.ts` (register tool)
- `tests/excalidraw-autolayout.test.ts` (new)

**Files to inspect first:**
- `src/plugins/excalidraw/flowchart.ts` (deterministic spacing math)
- `src/plugins/excalidraw/layout.ts` (from M6)
- `src/plugins/excalidraw/index.ts` (bound-arrow rerouting on `updateObject`)

**Implementation steps:**
1. Add pure `planGridLayout(objects, { columns?, gapX?, gapY?, originX?, originY? })` returning `{id,x,y}` updates packed into a grid by row-major order; sensible defaults (e.g. `columns = ceil(sqrt(n))`, `gapX=40`, `gapY=40`, origin = current min x/y).
2. Register `auto_layout_objects` with schema: `mode: z.enum(["grid","tree","layered-dag","pack-frames","swimlanes"])`, `ids?: string[]`, plus grid options. Resolve `ids` (or selection). Preserve ids; skip `raw.locked`.
3. For `mode:"grid"` apply updates via `controller.updateObject` inside one `transaction()`. For other modes, return `textResult({ updated:[], warnings:["mode '<mode>' not yet implemented"] })` (no mutation) — do **not** throw.
4. Return `textResult({ mode, updated, warnings })`.

**Tests/checks for this milestone:**
- Add/update: `tests/excalidraw-autolayout.test.ts`
- Run: `npm test -- autolayout`
- Expected result: unit test asserts grid coordinates for N objects; integration test asserts bound arrows still connect after layout (endpoints rerouted) and unsupported mode returns a `warnings` entry with no scene change.

**Acceptance criteria:**
- [ ] `auto_layout_objects` registered; `grid` mode repositions objects deterministically in one transaction.
- [ ] Ids preserved; locked objects skipped.
- [ ] Unsupported modes return a warning, not an error, and do not mutate.
- [ ] Bound arrows remain connected after layout.
- [ ] Relevant tests pass.

**Rollback/safety note:**
Position-only updates inside a transaction; unsupported modes are no-ops. Remove planner, registration, and test to revert.

## 6. Data, API, and interface contracts

### Inputs

- **`find_objects`** — Name: query object; Type: all-optional filters (`type`, `textContains`, `textRegex`, `frameId`, `groupId`, `bbox`+`bboxMode`, `style`, `link`, `metadata`, `selectedOnly`, `limit`); Source: MCP client args; Validation boundary: zod `findObjectsShape` + safe regex compile in handler.
- **`apply_canvas_patch`** — Name: `operations[]`, `dryRun?`, `returnObjects?`; Type: discriminated union (`create`/`update`/`delete`); Source: MCP client; Validation boundary: zod union + per-op plugin validation inside `transaction()`.
- **`connect_objects`** — Name: `edges[]`; Type: `{fromId,toId,label?,style?}[]`; Validation: zod + `resolveEndpoint` existence check.
- **`align_distribute_objects`** / **`auto_layout_objects`** — Name: `ids?` + option fields; Validation: zod + `controller.getObject` existence; selection fallback via `requestSelection`.

### Outputs

| Tool | Output (JSON in a text block via `textResult`) | Compatibility expectation |
|---|---|---|
| `find_objects` | `{ count, ids, objects }` (`objects` = `CanvasObject[]`, same shape as `get_object`) | New tool; no existing consumer. |
| `apply_canvas_patch` | `{ version, idMap, created, updated, deleted, warnings, objects? }` | New tool. |
| `connect_objects` | `{ arrowIds }` | Matches `create_flowchart.arrowIds` convention. |
| `align_distribute_objects` | `{ updated, warnings }` | New tool. |
| `auto_layout_objects` | `{ mode, updated, warnings }` | New tool. |

All errors use `errorResult` → `{ isError: true, content:[{type:"text", text:<message>}] }`, matching existing tools.

### API behavior

| Case | Request/input | Expected behavior | Error behavior |
|---|---|---|---|
| Empty find result | `find_objects` filters match nothing | `{count:0, ids:[], objects:[]}` | Not an error |
| Bad regex | `find_objects {textRegex:"("}` | — | `{isError:true}` |
| Atomic patch | `apply_canvas_patch` with one bad op | No partial mutation; scene unchanged | `{isError:true}` |
| Dry run | `apply_canvas_patch {dryRun:true}` | Returns `idMap` etc.; version + object count unchanged | n/a |
| Missing edge endpoint | `connect_objects` unknown `toId` | No partial arrows | `{isError:true}` |
| Locked object | `align_*`/`auto_layout` over locked id | Skipped, listed in `warnings` | Not an error |
| Unsupported layout mode | `auto_layout_objects {mode:"tree"}` | No mutation, `warnings` entry | Not an error |
| Selection fallback, no browser | `ids` omitted, no client | Same error as `get_selected_objects` | `{isError:true}` |

### State/storage changes

| Object/table/file | Change | Migration needed? | Compatibility concern |
|---|---|---|---|
| In-memory `Scene` (controller) | New tools mutate via existing `createObject`/`updateObject`/`deleteObjects` only | No | None; scene shape unchanged |
| `.excalidraw` save format | Unchanged | No | Saved files remain valid |
| WS/scene wire contract (`src/shared/protocol.ts`) | Unchanged | No | Browser sync unaffected |

## 7. Test and verification plan

### Required checks

1. `npm run typecheck`
   - Purpose: catch type errors in new schemas/tools/planners.
   - Expected result: no errors.
2. `npm run lint`
   - Purpose: Biome style/format compliance.
   - Expected result: clean (use `npm run format` to auto-fix).
3. `npm test`
   - Purpose: run all Vitest suites including the new tool tests.
   - Expected result: all pass.
4. `npm run verify`
   - Purpose: the project's combined gate (`typecheck && lint && test`).
   - Expected result: passes.
5. `npm run build`
   - Purpose: ensure `vite build` + `tsup` succeed with the changes.
   - Expected result: `dist/` produced without errors.

### Targeted tests

- `tests/mcp-instructions.test.ts` — Covers: M1 instructions returned to client.
- `tests/mcp-find-objects.test.ts` — Covers: M3 filters, AND semantics, bad regex, empty result.
- `tests/mcp-apply-patch.test.ts` — Covers: M4 atomicity, key references, dryRun, rollback.
- `tests/mcp-connect-objects.test.ts` (or extension of `tests/mcp-excalidraw.test.ts`) — Covers: M5 binding + atomic failure.
- `tests/excalidraw-align.test.ts` — Covers: M6 pure planner + locked-skip.
- `tests/excalidraw-autolayout.test.ts` — Covers: M7 grid math + bound-arrow integrity + unsupported-mode warning.

### Manual verification

- Step: `npm run build && node dist/cli/index.js --no-open --port 3939`, then probe `http://127.0.0.1:3939/healthz`; with the browser open, call `apply_canvas_patch` (create a few nodes + arrows), then `auto_layout_objects {mode:"grid"}`, then `find_objects {type:"rectangle"}`.
  - Expected observation: server starts, `/healthz` OK, objects appear live, grid layout repositions them, `find_objects` returns the created shapes.
- Step: `npm run inspect:mcp` and list tools.
  - Expected observation: the five new tools appear with their schemas; names match `docs/codex/` profiles.

### Verification fallback

If a command is unavailable, too slow, or fails for environment reasons, the implementation agent should:
1. Report the exact command and the failure output.
2. Run the nearest narrower check (e.g. `npm test -- <pattern>` for a single suite, `tsc --noEmit` alone).
3. Explain what remains unverified (e.g. browser-bound `screenshot`/selection paths).
4. Not claim success for unverified behavior.

## 8. Implementation agent execution instructions

~~~text
Implement the work described in FEATURE_PLAN.md.

Follow the milestones in order (M1 → M7). Before editing, inspect the files listed in each milestone and confirm the plan still matches the repository. If the repo has changed, adapt minimally and explain the deviation.

Constraints:
- Make the smallest correct change.
- Follow existing repo conventions (textResult/errorResult helpers, controller.transaction() for multi-object work, .js import specifiers, zod input schemas, pure planners mirroring flowchart.ts).
- Do not perform unrelated cleanup or refactoring.
- Do not introduce new dependencies.
- Do not change public APIs, schemas, routes, or behavior outside the stated scope; do not rename existing tools.
- The Node server must not import @excalidraw/excalidraw.
- Add or update tests where FEATURE_PLAN.md specifies them.
- Run the verification commands listed in FEATURE_PLAN.md (npm run verify, npm run build).
- If a verification command fails, diagnose whether it is caused by your changes or by pre-existing/environment issues.
- Do not mark the task complete unless the acceptance criteria are met or clearly state what remains unverified.

At the end, provide:
1. Summary of changes.
2. Files changed.
3. Tests/checks run and results.
4. Any deviations from FEATURE_PLAN.md.
5. Remaining risks or follow-ups, if any.
~~~

## 9. Acceptance criteria

- [ ] MCP server returns stable `instructions`.
- [ ] `docs/codex/` has `readonly`/`authoring`/`dangerous` profiles with only real tool names; no active `.codex/config.toml` committed.
- [ ] `AGENTS.md` has a canvas-operation guidance section.
- [ ] `find_objects`, `apply_canvas_patch`, `connect_objects`, `align_distribute_objects`, `auto_layout_objects` (grid) are registered and behave per Section 6.
- [ ] Multi-object tools commit once via `controller.transaction()`; failures roll back atomically.
- [ ] New tests added per Section 7 and passing.
- [ ] `npm run verify` and `npm run build` succeed.
- [ ] No out-of-scope tools, dependencies, or refactors introduced; existing tool names/schemas unchanged.
- [ ] Failing checks (if any) are explained with evidence.

## 10. Open questions and assumptions

### Blocking questions

- None.

### Non-blocking assumptions

- Assumption: `apply_canvas_patch` should use all-or-nothing semantics (any failed op aborts the whole patch).
  - Evidence: `create_flowchart` rejects atomically (`tests/mcp-excalidraw.test.ts` "rejects bad edges atomically") via `transaction()`.
  - Verify: confirm the rollback test (object count unchanged after a failing op) passes.
- Assumption: `dryRun` via throw-to-rollback is acceptable given `transaction()` restores the snapshot on throw.
  - Evidence: `canvasController.ts:153–160`.
  - Verify: assert `controller.currentVersion()` and `listObjects().length` are unchanged after a `dryRun` call.
- Assumption: `find_objects.selectedOnly` and selection fallback for layout tools may use `context.requestSelection()` and return the existing "no browser" error when unavailable.
  - Evidence: `get_selected_objects` uses `requestSelection` and returns that error (`baselineTools.ts`, `tests/mcp-baseline.test.ts`).
  - Verify: a test with `requestSelection` throwing returns `{isError:true}`.
- Assumption: `align`/`auto_layout` should skip linear (`arrow`/`line`), bound labels (`containerId` set), and `raw.locked` objects.
  - Evidence: FEATURE.md P2 "have layout tools respect `locked` by default"; bound arrows auto-reroute on `updateObject` (`syncBoundElements` in `index.ts`).
  - Verify: integration test asserts a locked object is unmoved and listed in `warnings`.
- Assumption: New plan file is named `FEATURE_PLAN.md` at repo root to avoid clobbering the existing greenfield `docs/project-briefs/PLAN.md`.
  - Evidence: `PLAN.md` exists only under `docs/project-briefs/`.
  - Verify: confirm no root `PLAN.md` before/while writing.

## 11. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Baseline tool reaching into plugin-only group/frame helpers | Medium | Medium | Keep `apply_canvas_patch` to create/update/delete; defer group/frame/select ops (Section 2). |
| `dryRun`-via-throw accidentally commits | Low | High | Catch sentinel *outside* `transaction()`; test asserts version + count unchanged. |
| Intra-patch key resolution bugs (arrow endpoints) | Medium | Medium | Resolve keys before each op; test create-nodes-then-arrow in one patch. |
| Codex profiles list stale/renamed tool names | Medium | Low | Generate `enabled_tools` from actual registrations; cross-check via `inspect:mcp`. |
| `auto_layout` scope creep into graph layout | Medium | Medium | Ship `grid` only; other modes return a warning, not an implementation. |
| Layout tools desync bound arrows | Low | Medium | Use `controller.updateObject` (triggers `syncBoundElements` rerouting); integration test checks arrow endpoints post-layout. |
| Biome/format failures on new files | Medium | Low | Run `npm run format` before `npm run verify`. |

## 12. Final instruction to an implementation agent

Proceed milestone by milestone (M1 → M7), validating with `npm run verify` after each. Prefer extending the existing registration functions and helpers over new abstractions; keep pure layout math in a dedicated module mirroring `flowchart.ts`. If the plan conflicts with actual repository evidence, trust the repository, make the smallest reasonable adaptation, and report the deviation in your final summary.
