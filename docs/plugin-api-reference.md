# Plugin API Reference

This reference documents the internal plugin APIs used by Agentic Canvas. The source
of truth is `src/core/plugin.ts` and `src/core/scene.ts`.

## CanvasPlugin

Each plugin implements `CanvasPlugin`:

```ts
export interface CanvasPlugin {
  readonly name: string;
  readonly fileExtension: string;
  createInitialScene(): Scene;
  getCapabilities?(): CanvasPluginCapabilities;
  getMetadata(scene: Scene): CanvasMetadata;
  listObjects(scene: Scene, type?: CanvasObjectType): CanvasObjectSummary[];
  getObject(scene: Scene, id: string): CanvasObjectDetail | undefined;
  createObject?(scene: Scene, spec: CreateObjectSpec): CanvasObject;
  updateObject?(scene: Scene, id: string, patch: UpdateObjectPatch): CanvasObject | undefined;
  deleteObjects(scene: Scene, ids: string[]): string[];
  clear(scene: Scene): void;
  serialize(scene: Scene): unknown;
  deserialize(raw: string, options?: { repair?: boolean }): Scene;
  registerTools(server: McpServer, context: PluginToolContext): void;
}
```

Responsibilities:

- Own the native scene format inside `Scene.native`.
- Implement normalized object inspection used by baseline MCP tools.
- Implement generic object creation and updates only when the canvas supports the
  shared shape-object contract.
- Preserve enough raw native data for browser rendering and serialization.
- Advertise plugin-specific tool workflows through `getCapabilities`.
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
    getScene(): Scene;
    currentVersion(): number;
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
  native: unknown;
  appState: Record<string, unknown>;
  version: number;
}
```

For Excalidraw, `native` contains Excalidraw elements and files. For JSON Canvas,
`native` is the `.canvas` document. Plugin native data should stay plain and
serializable so MCP tools, WebSocket sync, save/open, and tests can inspect it.

Each plugin owns the serialized document that `save_canvas` writes and
`open_canvas` reads. Excalidraw writes the Agentic Canvas Excalidraw envelope:

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

JSON Canvas writes standards-compatible `.canvas` documents without the Excalidraw
envelope. Flow writes stable pretty JSON `.flow` documents with
`type:"agentic-flow"`, `version:1`, typed nodes, optional ports, typed edges, and
optional settings. New plugins should maintain a stable file format and validate
enough structure to reject unusable files with clear errors.

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

Universal baseline tools provided for every plugin:

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

Generic shape-object tools are registered only when the active plugin implements
generic object creation and updates:

- `find_objects`
- `create_object`
- `apply_canvas_patch`
- `update_object`
- `set_canvas_background`

`get_canvas_state` returns scene metadata plus server package metadata. The
monotonic authoritative scene revision counter remains `version`; it is not a
package version, scene hash, or optimistic-concurrency token. The npm package
version is returned separately as `serverVersion`:

```json
{
  "canvas": "excalidraw",
  "version": 7,
  "objectCount": 3,
  "clientsConnected": 1,
  "packageName": "@trohde/agentic-canvas",
  "serverVersion": "0.3.0"
}
```

`get_canvas_capabilities` returns the active canvas name, file extension, universal
baseline tools, generic shape tools when available, plugin-specific tools,
destructive tools, preferred workflows, and short usage guidance. Clients should use
it after `get_canvas_state` instead of assuming one canvas engine.

`delete_object` accepts `{ ids: string[] }` and returns `{ deleted, missingIds }`.
`missingIds` reports requested ids that did not exist before deletion; deleting a
container may still include bound labels in `deleted`.

`save_canvas` and `open_canvas` append the active plugin's file extension when no
extension is supplied and reject other extensions. `screenshot` appends `.png` for
file writes and rejects other extensions. All file paths are still resolved through
the configured workspace.

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

Selection is live browser state, not authoritative scene state. It is not persisted
in saved canvas files, and mutations or undo/redo may clear it in the browser. If
the browser reports ids that no longer exist in the server scene, they are returned
in `missingIds`. An empty selection returns empty arrays. No connected browser,
browser errors, and request timeouts are returned as MCP `isError` results.

`select_objects` accepts `{ ids: string[] }`, filters ids through the authoritative
scene, sends existing ids to the connected browser, and returns `{ selectedIds,
missingIds }`. It does not mutate the scene version.

`set_canvas_background` accepts a validated canvas color string and updates
`Scene.appState.viewBackgroundColor`. `undo` and `redo` operate on the controller's
bounded in-memory scene history and are not persisted across process restarts.

JSON Canvas plugin tools keep JSON Canvas-compatible semantics: text cards default
to `360x180`, file/link cards to `360x120`, groups to `520x360`, and
`connect_cards.toEnd` defaults to `"arrow"` unless callers pass `"none"`. Layout
spacing is a gap added to measured card extents. Self-loop and parallel edges are
allowed, but edge mutation results may include advisory `warnings`; warnings are not
persisted into `.canvas` files.

Flow plugin tools keep Agentic Canvas-native graph semantics. The Flow plugin does
not implement generic shape-object creation or updates, so MCP clients should use
`add_flow_node`, `add_port`, `connect_flow_nodes`, `update_flow_node`,
`update_flow_edge`, `find_flow_nodes`, `find_flow_edges`, traversal tools,
`validate_flow`, `auto_layout_flow`, `export_mermaid`, and `apply_flow_patch`.
Flow validation enforces unique ids, valid node/port references, compatible port
directions, and acyclic graphs when strict validation is requested.
`validate_flow` with `{ "mode": "strict", "domainRules": true }` also reports
self-loops, required-but-unconnected ports, orphaned decision nodes, and stale
`contains` edges that disagree with structural `parentId` containment. Flow tools
treat `parentId` as the structural containment source of truth and reconcile
`contains` edges after relevant node/edge mutations. Self-loops remain allowed in
basic mode and are visible through `find_cycles`, `find_paths`, and validation
stats. `export_mermaid` emits boundary containment as Mermaid `subgraph` blocks and
escapes labels so quotes, pipes, and HTML-sensitive characters do not break
Mermaid syntax. Browser state such as selection and React Flow measurements is not
persisted beyond the semantic `.flow` document. Flow is not a BPMN, ArchiMate, UML,
or C4 standards implementation in v1.

Plugin tools must not redefine baseline tool names. Use plugin-specific names for
engine-native operations and higher-level workflows.

## Static Plugin Wiring

The current selection path is static:

- `src/cli/index.ts` validates `--canvas` and prints supported names.
- `src/server/httpServer.ts` creates the plugin factory and passes it to
  `CanvasController`.
- `src/mcp/buildServer.ts` receives the active plugin and registers its tools.

Adding a plugin requires updating those static selection points and tests. Do not
add dynamic imports, external package loading, remote registries, or runtime
marketplace behavior as part of normal plugin authoring.
