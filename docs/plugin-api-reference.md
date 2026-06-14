# Plugin API Reference

This reference documents the internal plugin APIs used by Agentic Canvas. The source
of truth is `src/core/plugin.ts` and `src/core/scene.ts`.

## CanvasPlugin

Each plugin implements `CanvasPlugin`:

```ts
export interface CanvasPlugin {
  readonly name: string;
  createInitialScene(): Scene;
  getMetadata(scene: Scene): CanvasMetadata;
  listObjects(scene: Scene, type?: CanvasObjectType): CanvasObjectSummary[];
  getObject(scene: Scene, id: string): CanvasObject | undefined;
  createObject(scene: Scene, spec: CreateObjectSpec): CanvasObject;
  updateObject(scene: Scene, id: string, patch: UpdateObjectPatch): CanvasObject | undefined;
  deleteObjects(scene: Scene, ids: string[]): string[];
  clear(scene: Scene): void;
  serialize(scene: Scene): SerializedScene;
  deserialize(raw: string): Scene;
  registerTools(server: McpServer, context: PluginToolContext): void;
}
```

Responsibilities:

- Own the native element format inside `Scene.elements`.
- Implement all normalized object operations used by baseline MCP tools.
- Preserve enough raw native data for browser rendering and serialization.
- Register only plugin-specific MCP tools in `registerTools`.

`CanvasController` owns versioning and notifications. Plugin methods should mutate
the `Scene` passed to them and return normalized objects or ids as requested.

## PluginToolContext

Plugin-specific MCP tools receive a restricted controller interface:

```ts
export interface PluginToolContext {
  controller: {
    createObject(spec: CreateObjectSpec): CanvasObject;
    updateObject(id: string, patch: UpdateObjectPatch): CanvasObject | undefined;
    getObject(id: string): CanvasObject | undefined;
    listObjects(type?: CanvasObjectType): CanvasObjectSummary[];
    mutateScene<T>(mutator: (scene: Scene) => T): T;
    transaction<T>(fn: () => T): T;
  };
  requestSelection(options?: { timeoutMs?: number }): Promise<{ selectedIds: string[] }>;
}
```

Use `createObject`, `updateObject`, `getObject`, and `listObjects` when possible.
Use `mutateScene` only for operations that cannot be expressed through normalized
object calls, such as assigning frame membership or grouping native elements.

Use `transaction` when a tool performs more than one scene mutation. Without a
transaction, each mutation increments the scene version and broadcasts separately.
Transactions are atomic: if the callback throws, the controller restores the scene
to its pre-transaction snapshot and does not broadcast partial changes.

Use `requestSelection` only for browser-bound tool paths where omitted ids should
fall back to the current browser selection. Return its error through the normal
`isError: true` tool response when no browser is connected.

## Scene And Serialization

`Scene` is the server-authoritative state:

```ts
export interface Scene {
  elements: ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  version: number;
}
```

For the current Excalidraw plugin, `elements` are Excalidraw elements. A future
plugin can use the same top-level shape with its own element payload, but should keep
the data plain and serializable so MCP tools, WebSocket sync, save/open, and tests
can inspect it.

`SerializedScene` is what `save_canvas` writes and `open_canvas` reads:

```ts
export interface SerializedScene {
  type: "excalidraw";
  version: 2;
  source: "agentic-canvas";
  elements: ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}
```

A future plugin should use a plugin-specific `type` string and maintain a stable
version number for its file format. `deserialize` should validate enough structure to
reject unusable files with clear errors.

## Normalized Objects

Baseline tools operate on `CanvasObjectSummary` and `CanvasObject`:

```ts
export interface CanvasObjectSummary {
  id: string;
  type: CanvasObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

export interface CanvasObject extends CanvasObjectSummary {
  points?: [number, number][];
  style: CanvasStyle;
  containerId?: string;
  groupIds: string[];
  frameId?: string | null;
  raw: ExcalidrawElement;
}
```

Supported normalized object types are:

- `rectangle`
- `ellipse`
- `diamond`
- `line`
- `arrow`
- `text`
- `frame`

`raw` must contain the native element payload used by the plugin. It is intentionally
available for debugging and advanced clients, but baseline tools should not require
clients to understand it for ordinary operations.

## Create And Update Specs

`CreateObjectSpec` is the shared input shape for `create_object` and for
plugin-specific tools that delegate to `context.controller.createObject`:

```ts
export interface CreateObjectSpec {
  type: CanvasObjectType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  points?: [number, number][];
  style?: CanvasStyle;
  start?: ArrowEndpoint;
  end?: ArrowEndpoint;
  containerId?: string;
  groupIds?: string[];
}
```

`UpdateObjectPatch` is `Partial<Omit<CreateObjectSpec, "type">>`, plus the object id
at the MCP schema layer.

`ArrowEndpoint` can be a point or an existing element id:

```ts
export type ArrowEndpoint = { x: number; y: number } | { elementId: string };
```

If a plugin supports element-bound arrows, it should validate referenced ids and
return a clear error when an endpoint cannot be resolved.

## Style Contract

`CanvasStyle` is intentionally small:

```ts
export interface CanvasStyle {
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid";
  strokeWidth?: 1 | 2 | 4;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness?: 0 | 1 | 2;
  opacity?: number;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
}
```

Plugins should map these fields to the closest native equivalents. If a field cannot
be represented, prefer a documented no-op or a clear validation error over producing
invalid native data.

## MCP Tool Registration

This project uses `@modelcontextprotocol/sdk` v1 subpath imports:

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
```

Register tools with raw Zod shape input schemas:

```ts
server.registerTool(
  "draw_example",
  {
    description: "Draw an example object.",
    inputSchema: {
      x: z.number(),
      y: z.number(),
      text: z.string().optional(),
    },
  },
  async ({ x, y, text }) => {
    const object = context.controller.createObject({
      type: "rectangle",
      x,
      y,
      text,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ id: object.id }) }],
    };
  },
);
```

For expected tool failures, return `isError: true`:

```ts
return {
  isError: true,
  content: [{ type: "text" as const, text: "Object not found: example-id" }],
};
```

Do not switch to v2 MCP split packages or `z.object(...)` registration style unless
the dependency strategy changes for the whole project.

## Baseline Tool Registration

`buildMcpServer` always registers baseline tools first, then plugin tools:

```ts
registerBaselineTools(server, baselineContext);
plugin.registerTools(server, { controller, requestSelection });
```

Baseline tools provided for every plugin:

- `get_canvas_state`
- `list_objects`
- `get_object`
- `find_objects`
- `create_object`
- `apply_canvas_patch`
- `update_object`
- `delete_object`
- `clear_canvas`
- `save_canvas`
- `open_canvas`
- `screenshot`
- `get_selected_objects`
- `select_objects`
- `set_canvas_background`
- `undo`
- `redo`

`get_selected_objects` has no input arguments. It asks the connected browser for the
current UI selection, resolves those ids through `CanvasController`, and returns JSON
text:

```json
{
  "version": 7,
  "selectedIds": ["object-id"],
  "objects": [],
  "missingIds": []
}
```

Selection is live browser state, not authoritative scene state. If the browser
reports ids that no longer exist in the server scene, they are returned in
`missingIds`. An empty selection returns empty arrays. No connected browser, browser
errors, and request timeouts are returned as MCP `isError` results.

`select_objects` accepts `{ ids: string[] }`, filters ids through the authoritative
scene, sends existing ids to the connected browser, and returns `{ selectedIds,
missingIds }`. It does not mutate the scene version.

`set_canvas_background` accepts a validated canvas color string and updates
`Scene.appState.viewBackgroundColor`. `undo` and `redo` operate on the controller's
bounded in-memory scene history and are not persisted across process restarts.

Plugin tools must not redefine baseline tool names. Use plugin-specific names for
engine-native operations and higher-level workflows.

## Static Plugin Wiring

The current selection path is static:

- `src/cli/index.ts` validates `--canvas` and prints supported names.
- `src/server/httpServer.ts` creates the plugin factory and passes it to
  `CanvasController`.
- `src/mcp/buildServer.ts` receives the active plugin and registers its tools.

Adding a second plugin requires updating those static selection points and tests. Do
not add dynamic imports, external package loading, remote registries, or marketplace
behavior as part of normal plugin authoring.
