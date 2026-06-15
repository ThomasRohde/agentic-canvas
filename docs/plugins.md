# Plugin Authoring Guide

Agentic Canvas has an internal canvas plugin boundary. A plugin owns the native scene
format for one canvas engine and maps that format to the normalized objects used by
baseline MCP tools. The current application ships the `excalidraw` and `jsoncanvas`
plugins.

This is a static, in-repo runtime plugin model. There is no dynamic plugin marketplace, remote
registry, runtime loader, authentication layer, database, telemetry system, or stdio
transport.

## Runtime Lifecycle

1. The CLI accepts `--canvas <name>` and validates it against the statically supported
   canvas names.
2. `startHttpServer` creates the selected `CanvasPlugin`, a `CanvasController`, and a
   `WsBridge`.
3. `CanvasController` owns the authoritative `Scene` and monotonic scene revision.
4. `buildMcpServer` registers baseline MCP tools, then calls `plugin.registerTools`.
5. Baseline tools call the plugin through `CanvasController` for normalized object
   operations.
6. Plugin-specific tools use `PluginToolContext` to mutate or inspect the same
   authoritative scene, and may request the current browser selection for
   selection-based tool fallbacks.
7. The WebSocket bridge sends scene snapshots to the browser, accepts browser scene
   replacements, and handles browser-bound requests such as screenshot export and
   current selection lookup.

The scene revision is an operation/revision counter, not a package version or scene
hash. Browser selection is ephemeral UI state; plugins should not persist it in
canvas files.

The Node side must stay browser-runtime free. Do not import browser-only canvas
packages from server, MCP, core, or plugin Node code. The Excalidraw runtime API is
isolated to `src/web`.

## Recommended Plugin Layout

Use one directory per plugin:

```text
src/plugins/<name>/
  index.ts        CanvasPlugin implementation and scene operations
  adapter.ts      Native element to CanvasObject/CanvasObjectSummary mapping
  elements.ts     Native element builders and defaults
  format.ts       serialize/deserialize helpers
  tools.ts        optional plugin-specific MCP tools
```

Small plugins can combine helpers, but keep `index.ts` as the public entrypoint. The
existing `src/plugins/excalidraw` directory is the reference implementation.

Add focused tests next to existing plugin tests:

```text
tests/<name>-adapter.test.ts
tests/<name>-elements.test.ts
tests/<name>-plugin-baseline.test.ts
tests/<name>-mcp.test.ts
```

Use the smallest set that proves the plugin's behavior. Shared baseline behavior
should still pass through the existing baseline MCP tests once the plugin is wired.

## Implementing A Plugin

1. Choose the plugin name.

   The name is the `CanvasPlugin.name` value, the CLI `--canvas` value, and the label
   returned by `get_canvas_state`. Keep it lowercase and stable.

2. Define the native scene.

   `Scene` currently contains `elements`, `appState`, `files`, and `version`. For a
   new engine, keep those top-level fields so `CanvasController`, save/open, and
   browser sync keep working. Put native element data in `elements` and expose any
   engine-specific raw payload through `CanvasObject.raw`.

3. Implement `CanvasPlugin`.

   `index.ts` must export a factory such as `createExamplePlugin(): CanvasPlugin`.
   Implement all baseline scene operations:

   - `createInitialScene`: return an empty scene with default app state.
   - `getMetadata`: return canvas name, scene version, object count, and background.
   - `listObjects` and `getObject`: return normalized objects, not raw-only data.
   - `createObject`, `updateObject`, `deleteObjects`, `clear`: mutate the scene passed
     by `CanvasController`.
   - `serialize` and `deserialize`: round-trip the complete scene for save/open.
   - `getCapabilities`: advertise plugin-specific tools and preferred workflows
     for MCP clients and Codex skills.
   - `registerTools`: register only plugin-specific MCP tools.

4. Map native objects to normalized objects.

   Every object visible to baseline tools should map to `CanvasObjectSummary` and
   `CanvasObject`. Unsupported native internals can remain hidden, but any object
   returned by `list_objects` must be retrievable by `get_object`.

   The normalized object contract is intentionally small: `id`, `type`, `x`, `y`,
   `width`, `height`, optional `text`, optional `points`, `style`, grouping fields,
   frame/container fields, and `raw`.

5. Implement creation and updates conservatively.

   `create_object` and `update_object` use the shared `CreateObjectSpec` and
   `UpdateObjectPatch` schemas. If a native engine cannot represent a requested type
   or field, return a clear error from the plugin operation or tool instead of
   silently producing a broken object.

6. Register plugin-specific tools.

   Use `server.registerTool` from `@modelcontextprotocol/sdk/server/mcp.js` and raw
   Zod shape input schemas, matching the MCP SDK v1 style used in this repo.
   Use `context.requestSelection()` only when a plugin tool intentionally supports
   omitted ids by falling back to the connected browser selection.

   Return JSON as text content for ordinary results:

   ```ts
   return {
     content: [{ type: "text" as const, text: JSON.stringify({ id }) }],
   };
   ```

   Return tool errors with `isError: true`:

   ```ts
   return {
     isError: true,
     content: [{ type: "text" as const, text: message }],
   };
   ```

   If one tool performs multiple mutations, wrap them in
   `context.controller.transaction(() => { ... })` so the browser receives one final
   scene update.

7. Wire the plugin statically.

   A future plugin must update the static selection points:

   - The canvas plugin registry.
   - Browser renderer selection under `src/web`.
   - Any tests or docs that list supported canvas names.

   Do not add dynamic loading, remote package loading, or external marketplace
   loading unless the project scope explicitly changes.

8. Add browser support if the engine is not Excalidraw.

   The current browser app renders Excalidraw. A non-Excalidraw plugin needs a
   corresponding browser renderer and sync adapter under `src/web`. Keep browser-only
   runtime imports in `src/web`; server-side plugin code should exchange plain
   serializable scene data.

## Baseline Tools vs Plugin Tools

Baseline tools are registered for every plugin:

- `get_canvas_state`
- `get_canvas_capabilities`
- `list_objects`
- `get_object`
- `delete_object`
- `clear_canvas`
- `save_canvas`
- `open_canvas`
- `screenshot`
- `get_selected_objects`
- `select_objects`
- `undo`
- `redo`

Generic shape-object tools are registered only when a plugin implements generic
object creation and updates:

- `find_objects`
- `create_object`
- `apply_canvas_patch`
- `update_object`
- `set_canvas_background`

Plugin tools are optional and engine-specific. Excalidraw currently adds tools such
as `draw_rectangle`, `draw_arrow`, `create_frame`, `group_objects`,
`ungroup_objects`, `remove_from_frame`, and `create_flowchart`.

Use baseline tools for common object operations. Add plugin tools only when they
provide a better engine-native workflow or a higher-level operation.
Advertise those plugin tools from `getCapabilities` so clients can choose the
right workflow for the active canvas.
Plugin authors do not implement `get_selected_objects` or `select_objects` on the
Node side; browser code reads or applies selected ids and the shared baseline tools
resolve ids through `CanvasController`.

## Verification Checklist

Before considering a plugin ready:

- Baseline create/list/get/update/delete/clear tests pass for the plugin.
- Save/open round trips the plugin scene without losing objects.
- Plugin-specific tools return JSON text results and `isError` failures.
- Multi-step tools use `transaction` and emit one scene update.
- Browser sync can display the native scene and accept browser-origin changes.
- Screenshot works through a connected browser client.
- `get_selected_objects` returns normalized objects for a browser selection.
- `select_objects` updates browser selection for existing server-side ids.
- Node-side plugin code does not import browser-only canvas packages.

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```
