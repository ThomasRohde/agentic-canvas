# Agentic Canvas — JSON Canvas Plugin Specification

**Canvas name:** `jsoncanvas`  
**Target project:** `@trohde/agentic-canvas`  
**Status:** Proposed implementation specification  
**Created:** 2026-06-15  
**Primary outcome:** Add a portable, semantic knowledge-canvas plugin that complements Excalidraw rather than duplicating it.

---

## 1. Executive summary

The `jsoncanvas` plugin adds support for the open JSON Canvas format (`.canvas`) as a first-class Agentic Canvas backend. It should be optimized for agent-readable and agent-editable knowledge maps: text cards, file references, web links, visual groups, and labeled connections.

Excalidraw remains the freeform drawing surface. `jsoncanvas` becomes the structured, portable, long-lived knowledge surface.

The MVP should allow an MCP client to:

1. create, read, update, delete, and search cards;
2. connect cards with labeled edges;
3. group cards visually;
4. save and open standards-compatible `.canvas` files;
5. render the canvas live in the browser;
6. preserve human edits back into the server-authoritative scene.

The plugin should not try to recreate Excalidraw's sketching experience. It should expose a smaller, stricter model that is easier for agents to reason over.

---

## 2. Source basis

This spec is based on:

- JSON Canvas v1.0 specification: https://jsoncanvas.org/spec/1.0/
- JSON Canvas project description: https://jsoncanvas.org/
- Current Agentic Canvas project shape: local-first Node process, MCP over HTTP, WebSocket browser sync, plugin interface, Excalidraw as the first plugin.

Important JSON Canvas v1.0 facts used here:

- `.canvas` is the file extension.
- Top-level document contains optional `nodes` and `edges` arrays.
- Node types are `text`, `file`, `link`, and `group`.
- Edges connect `fromNode` to `toNode` and may include side, endpoint, color, and label fields.
- Node order is z-index order: earlier nodes render below later nodes.

---

## 3. Product goal

Add a canvas for persistent semantic maps.

Typical use cases:

- research boards;
- architecture decision maps;
- application capability maps;
- risk/control maps;
- meeting synthesis boards;
- knowledge graphs small enough to remain human-readable;
- Obsidian-compatible canvas files;
- AI-generated planning and investigation maps.

This plugin should make it easy for an agent to produce something useful after one prompt:

> “Map the dependencies and risks in this architecture review into a JSON Canvas.”

Expected result: a clean `.canvas` file with cards, groups, and labeled edges that a human can inspect and edit.

---

## 4. Design principles

### 4.1 Format compatibility first

The saved file must be valid JSON Canvas, not an Agentic Canvas proprietary variant.

Do not add Agentic Canvas runtime metadata to the top-level `.canvas` file in the MVP unless compatibility testing confirms target tools safely ignore it. Keep runtime-only metadata in the in-memory scene wrapper.

### 4.2 Agent readability over visual richness

Prefer plain, predictable structures:

- plain Markdown text in text cards;
- explicit edge labels;
- simple color presets;
- deterministic layout;
- stable IDs.

Avoid hidden state that only the browser can understand.

### 4.3 Small reliable MVP

The first version should support core JSON Canvas features only:

- text cards;
- file cards;
- link cards;
- groups;
- edges;
- colors;
- save/open;
- screenshot;
- selection.

Advanced features such as embedded previews, backlinks, automatic Obsidian vault discovery, markdown rendering extensions, and live web previews should be postponed.

### 4.4 Human-agent round trip

A human must be able to move, resize, edit, and connect cards in the browser, and the server must reflect those changes in subsequent MCP reads.

---

## 5. Relationship to Excalidraw

| Concern | Excalidraw plugin | JSON Canvas plugin |
|---|---|---|
| Primary mode | Freeform sketching | Semantic card graph |
| Best for | Visual explanation | Persistent knowledge maps |
| File format | `.excalidraw` | `.canvas` |
| Agent model | Shapes, text, arrows, frames | Cards, groups, labeled edges |
| Human edit style | Drawing-first | Card editing and graph manipulation |
| Interop | Excalidraw ecosystem | JSON Canvas / Obsidian-compatible tools |

Do not use `jsoncanvas` for diagrams that require custom shapes, rich arrows, hand-drawn styling, or presentation-quality visuals. Use Excalidraw for that.

Use `jsoncanvas` when the objects themselves have semantic meaning and should survive as structured data.

---

## 6. Non-goals

The MVP must not include:

- Obsidian plugin integration;
- vault indexing;
- live markdown backlinks;
- cloud sync;
- multiplayer conflict resolution;
- CRDTs;
- remote file fetching;
- image/video rendering beyond basic file-card display;
- arbitrary HTML in cards;
- plugin marketplace support;
- cross-canvas live linking with Excalidraw.

---

## 7. Required project refactor before implementation

The current project already has a `CanvasPlugin` interface, but core scene types are still Excalidraw-shaped. Before adding `jsoncanvas`, make the core plugin-neutral.

### 7.1 Replace Excalidraw-specific core scene assumptions

Current problem areas to remove from core:

- `Scene.elements: ExcalidrawElement[]`
- `CanvasObject.raw: ExcalidrawElement`
- `SerializedScene.type: "excalidraw"`
- CLI hardcoded to reject every canvas except `excalidraw`
- HTTP server directly constructing the Excalidraw plugin

### 7.2 Proposed generic scene wrapper

```ts
export interface Scene<TNative = unknown, TAppState = Record<string, unknown>> {
  native: TNative;
  appState: TAppState;
  version: number;
}

export interface SerializedScene<TData = unknown> {
  type: string;
  version: number;
  source: "agentic-canvas";
  data: TData;
}
```

For JSON Canvas:

```ts
export type JsonCanvasScene = Scene<JsonCanvasDocument, JsonCanvasAppState>;
```

### 7.3 Plugin registry

Add a static local registry first. Do not build dynamic plugin loading.

```ts
export const canvasPlugins = {
  excalidraw: createExcalidrawPlugin,
  jsoncanvas: createJsonCanvasPlugin,
} satisfies Record<string, () => CanvasPlugin>;
```

CLI validation becomes:

```ts
const canvas = String(args.values.canvas ?? "excalidraw");
const createPlugin = canvasPlugins[canvas];

if (!createPlugin) {
  throw new Error(
    `Unknown canvas "${canvas}". Available canvases: ${Object.keys(canvasPlugins).join(", ")}`,
  );
}
```

### 7.4 Browser routing

The browser should select a canvas renderer based on the server-selected plugin.

Suggested endpoint:

```http
GET /canvas-info
```

Response:

```json
{
  "canvas": "jsoncanvas",
  "mcpUrl": "http://127.0.0.1:3333/mcp",
  "wsUrl": "ws://127.0.0.1:3333/ws"
}
```

The web app then renders:

```tsx
switch (canvasInfo.canvas) {
  case "excalidraw":
    return <ExcalidrawCanvasApp />;
  case "jsoncanvas":
    return <JsonCanvasApp />;
}
```

---

## 8. File and directory layout

```text
src/plugins/jsoncanvas/
  index.ts              # CanvasPlugin implementation
  model.ts              # JSON Canvas TypeScript types
  schemas.ts            # Zod schemas for file format and MCP inputs
  format.ts             # serialize/deserialize .canvas
  adapter.ts            # native model <-> CanvasObject summary/object
  tools.ts              # JSON Canvas-specific MCP tools
  layout.ts             # deterministic grid / layered layout
  search.ts             # text/link/file/edge search helpers
  validation.ts         # document validation and repair helpers

src/web/canvases/jsoncanvas/
  JsonCanvasApp.tsx     # browser renderer + WS integration
  JsonCanvasNode.tsx    # card rendering
  JsonCanvasEdge.tsx    # edge rendering
  JsonCanvasGroup.tsx   # group node rendering
  editor.tsx            # inline text/link/file editing helpers
  geometry.ts           # side/anchor calculations

tests/jsoncanvas/
  jsoncanvas-format.test.ts
  jsoncanvas-adapter.test.ts
  jsoncanvas-tools.test.ts
  jsoncanvas-layout.test.ts
  jsoncanvas-validation.test.ts
  jsoncanvas-ws-roundtrip.test.ts
```

If the web code currently assumes a single Excalidraw app, introduce this shared structure:

```text
src/web/canvases/excalidraw/...
src/web/canvases/jsoncanvas/...
src/web/shared/wsClient.ts
src/web/shared/useCanvasSync.ts
src/web/shared/exportScreenshot.ts
```

---

## 9. Dependencies

### 9.1 Runtime dependencies

Preferred MVP dependency approach:

```bash
npm install @xyflow/react
```

Use React Flow / xyflow as the browser renderer for JSON Canvas cards and edges. This gives dragging, selection, panning, zooming, handles, and controlled node/edge state with less custom UI code.

The file format remains JSON Canvas. React Flow is only the browser rendering engine.

### 9.2 Avoid in MVP

Avoid adding these until there is a clear need:

- `elkjs`
- `dagre`
- markdown renderer libraries
- URL preview libraries
- syntax highlighting libraries
- image/video preview dependencies

Implement deterministic layout in `layout.ts` with plain TypeScript first.

---

## 10. Native data model

### 10.1 JSON Canvas document

```ts
export interface JsonCanvasDocument {
  nodes?: JsonCanvasNode[];
  edges?: JsonCanvasEdge[];
}
```

### 10.2 Node model

```ts
export type JsonCanvasNode =
  | JsonCanvasTextNode
  | JsonCanvasFileNode
  | JsonCanvasLinkNode
  | JsonCanvasGroupNode;

export interface JsonCanvasBaseNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: JsonCanvasColor;
}

export interface JsonCanvasTextNode extends JsonCanvasBaseNode {
  type: "text";
  text: string;
}

export interface JsonCanvasFileNode extends JsonCanvasBaseNode {
  type: "file";
  file: string;
  subpath?: string;
}

export interface JsonCanvasLinkNode extends JsonCanvasBaseNode {
  type: "link";
  url: string;
}

export interface JsonCanvasGroupNode extends JsonCanvasBaseNode {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}
```

### 10.3 Edge model

```ts
export type JsonCanvasSide = "top" | "right" | "bottom" | "left";
export type JsonCanvasEnd = "none" | "arrow";
export type JsonCanvasColor = `#${string}` | "1" | "2" | "3" | "4" | "5" | "6";

export interface JsonCanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: JsonCanvasSide;
  fromEnd?: JsonCanvasEnd;
  toNode: string;
  toSide?: JsonCanvasSide;
  toEnd?: JsonCanvasEnd;
  color?: JsonCanvasColor;
  label?: string;
}
```

### 10.4 Runtime app state

Do not write this to `.canvas` in MVP.

```ts
export interface JsonCanvasAppState {
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  selectedIds?: string[];
  lastSavedPath?: string;
}
```

---

## 11. ID strategy

Use stable, readable IDs.

Recommended:

```ts
function createJsonCanvasId(prefix: "card" | "group" | "edge"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
```

Rules:

- Never reuse deleted IDs in the same session.
- Preserve IDs during open/save round trips.
- Do not derive IDs from text labels; labels change.
- During import, reject duplicate IDs unless `repair: true` is requested.

---

## 12. Coordinate and layout conventions

### 12.1 Coordinate system

Use JSON Canvas pixel coordinates directly:

- `x`, `y`: top-left of node;
- `width`, `height`: node size in pixels;
- edge anchors use node IDs plus optional side names.

### 12.2 Default sizes

```ts
const DEFAULT_TEXT_CARD = { width: 360, height: 180 };
const DEFAULT_LINK_CARD = { width: 360, height: 120 };
const DEFAULT_FILE_CARD = { width: 360, height: 120 };
const DEFAULT_GROUP = { width: 520, height: 360 };
```

### 12.3 Default placement

If the caller omits `x` and `y`, place the new card on the next free grid slot.

```ts
const GRID = {
  originX: 0,
  originY: 0,
  columnWidth: 420,
  rowHeight: 240,
  columns: 3,
};
```

### 12.4 Deterministic auto-layout

MVP layout algorithm:

1. Build directed graph from edges.
2. Identify roots: nodes with no incoming edges.
3. Assign layer by longest path from a root.
4. Sort nodes within each layer by current `y`, then label/text fallback.
5. Place layers left-to-right.
6. Place orphan nodes below the main graph.
7. Expand group rectangles to contain geometrically enclosed nodes if `resizeGroups: true`.

Do not add a graph layout dependency until the simple layout is insufficient.

---

## 13. Serialization and file handling

### 13.1 Save behavior

For `--canvas jsoncanvas`, `save_canvas` should append `.canvas` when no extension is provided.

Examples:

```json
{ "path": "research-map" }
```

Writes:

```text
research-map.canvas
```

Reject extensions other than `.canvas` unless a future explicit export tool supports them.

### 13.2 Open behavior

For `--canvas jsoncanvas`, `open_canvas` accepts only `.canvas` files.

Validation on open:

- parse JSON;
- validate top-level object;
- default missing `nodes` to `[]`;
- default missing `edges` to `[]`;
- validate every node and edge;
- reject dangling edges unless `repair: true` is provided;
- reject non-integer geometry unless `repair: true` rounds values;
- preserve array order.

### 13.3 Format output

Write stable pretty JSON:

```ts
JSON.stringify(document, null, 2) + "\n"
```

Do not reorder nodes except when the user explicitly invokes a z-order tool.

### 13.4 Example `.canvas`

```json
{
  "nodes": [
    {
      "id": "card_context",
      "type": "text",
      "x": 0,
      "y": 0,
      "width": 360,
      "height": 180,
      "text": "# Context\nThe payments platform depends on external fraud scoring."
    },
    {
      "id": "card_risk",
      "type": "text",
      "x": 480,
      "y": 0,
      "width": 360,
      "height": 180,
      "color": "1",
      "text": "# Risk\nFraud scoring outage blocks checkout approval."
    }
  ],
  "edges": [
    {
      "id": "edge_context_risk",
      "fromNode": "card_context",
      "toNode": "card_risk",
      "toEnd": "arrow",
      "label": "implies"
    }
  ]
}
```

---

## 14. Mapping to Agentic Canvas objects

The current normalized object model is shape-oriented. For `jsoncanvas`, use plugin-native summaries.

### 14.1 Proposed generic object summary

```ts
export interface CanvasObjectSummary {
  id: string;
  pluginType: string;       // e.g. "jsoncanvas.text", "jsoncanvas.edge"
  kind: "node" | "edge" | "group" | "shape" | "text";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  label?: string;
}
```

### 14.2 JSON Canvas object mapping

| JSON Canvas item | `pluginType` | `kind` | Summary text |
|---|---|---|---|
| text node | `jsoncanvas.text` | `node` | first heading or first 80 chars |
| file node | `jsoncanvas.file` | `node` | file path + subpath |
| link node | `jsoncanvas.link` | `node` | URL hostname/path |
| group node | `jsoncanvas.group` | `group` | group label |
| edge | `jsoncanvas.edge` | `edge` | edge label or `from -> to` |

### 14.3 Full object shape

```ts
export interface JsonCanvasObject extends CanvasObjectSummary {
  raw: JsonCanvasNode | JsonCanvasEdge;
  references: {
    incomingEdgeIds?: string[];
    outgoingEdgeIds?: string[];
    containedNodeIds?: string[]; // geometric containment for groups
  };
}
```

---

## 15. MCP tools

### 15.1 Baseline tools expected to work

These should remain available:

- `get_canvas_state`
- `list_objects`
- `get_object`
- `delete_object` / `delete_objects`
- `clear_canvas`
- `save_canvas`
- `open_canvas`
- `screenshot`
- `get_selected_objects`
- `select_objects`

For `jsoncanvas`, `list_objects` should include both nodes and edges unless filtered.

### 15.2 `add_text_card`

Creates a text node.

Input:

```ts
{
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: JsonCanvasColor;
}
```

Rules:

- `text` is required and may contain Markdown.
- Default dimensions are `360 x 180`.
- Omitted coordinates use next free grid slot.

Output:

```ts
{
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}
```

### 15.3 `add_file_card`

Creates a file node.

Input:

```ts
{
  file: string;
  subpath?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: JsonCanvasColor;
}
```

Rules:

- `file` is a path string stored in the `.canvas` file.
- Do not read the file in MVP.
- If `subpath` is provided, it must start with `#`.

### 15.4 `add_link_card`

Creates a link node.

Input:

```ts
{
  url: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: JsonCanvasColor;
}
```

Rules:

- Accept only valid `http:` and `https:` URLs by default.
- Allow other schemes only with `allowUnsafeScheme: true` in a future version.
- Do not fetch previews in MVP.

### 15.5 `create_group`

Creates a visual group node.

Input:

```ts
{
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: JsonCanvasColor;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}
```

Rules:

- Groups are visual containers.
- Membership is inferred geometrically unless a future extension adds explicit metadata.
- A group should render behind normal cards by default.

### 15.6 `connect_cards`

Creates an edge between two nodes.

Input:

```ts
{
  fromNode: string;
  toNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  toSide?: "top" | "right" | "bottom" | "left";
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  label?: string;
  color?: JsonCanvasColor;
}
```

Rules:

- Both node IDs must exist.
- Default `toEnd` is `arrow`.
- Allow multiple edges between the same pair if labels differ.
- Reject exact duplicate edge unless `allowDuplicate: true` is added later.

### 15.7 `update_card`

Updates a node.

Input:

```ts
{
  id: string;
  text?: string;
  file?: string;
  subpath?: string | null;
  url?: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: JsonCanvasColor | null;
  background?: string | null;
  backgroundStyle?: "cover" | "ratio" | "repeat" | null;
}
```

Rules:

- Reject fields that do not apply to the node type.
- `null` removes optional fields.
- Geometry values must be integers.

### 15.8 `update_edge`

Input:

```ts
{
  id: string;
  fromNode?: string;
  toNode?: string;
  fromSide?: JsonCanvasSide | null;
  toSide?: JsonCanvasSide | null;
  fromEnd?: JsonCanvasEnd | null;
  toEnd?: JsonCanvasEnd | null;
  label?: string | null;
  color?: JsonCanvasColor | null;
}
```

Rules:

- If endpoints change, new referenced nodes must exist.
- `null` removes optional fields.

### 15.9 `find_cards`

Searches nodes.

Input:

```ts
{
  query?: string;
  type?: "text" | "file" | "link" | "group";
  color?: JsonCanvasColor;
  insideGroup?: string;
  limit?: number;
}
```

Matching:

- text nodes: search `text`;
- file nodes: search `file` and `subpath`;
- link nodes: search `url`;
- group nodes: search `label`;
- `insideGroup`: geometric containment.

### 15.10 `find_edges`

Searches edges.

Input:

```ts
{
  query?: string;
  fromNode?: string;
  toNode?: string;
  touchingNode?: string;
  color?: JsonCanvasColor;
  limit?: number;
}
```

### 15.11 `auto_layout_cards`

Input:

```ts
{
  direction?: "right" | "down";
  layerSpacing?: number;
  nodeSpacing?: number;
  includeGroups?: boolean;
  resizeGroups?: boolean;
}
```

Rules:

- Deterministic output.
- Preserve relative order when possible.
- Return moved node IDs and old/new bounds.

### 15.12 `apply_jsoncanvas_patch`

Atomic bulk patch for agents.

Input:

```ts
{
  createNodes?: JsonCanvasNode[];
  updateNodes?: Array<{ id: string; patch: Partial<JsonCanvasNode> }>;
  deleteNodeIds?: string[];
  createEdges?: JsonCanvasEdge[];
  updateEdges?: Array<{ id: string; patch: Partial<JsonCanvasEdge> }>;
  deleteEdgeIds?: string[];
  repair?: boolean;
}
```

Rules:

- Apply all-or-nothing inside `controller.transaction`.
- Validate final document before committing.
- Return summary of created, updated, deleted IDs.

This is the preferred tool for agents creating complex maps.

---

## 16. Browser renderer

### 16.1 Renderer choice

Use `@xyflow/react` for browser rendering in the MVP.

Reason:

- native node/edge rendering model matches JSON Canvas closely;
- built-in panning, zooming, dragging, selection, and controlled state;
- easier future reuse by the `flow` plugin.

### 16.2 React Flow mapping

JSON Canvas node to React Flow node:

```ts
function toReactFlowNode(node: JsonCanvasNode): Node<JsonCanvasNode> {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.x, y: node.y },
    data: node,
    width: node.width,
    height: node.height,
    style: {
      width: node.width,
      height: node.height,
    },
    draggable: true,
    selectable: true,
  };
}
```

JSON Canvas edge to React Flow edge:

```ts
function toReactFlowEdge(edge: JsonCanvasEdge): Edge<JsonCanvasEdge> {
  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    sourceHandle: edge.fromSide,
    targetHandle: edge.toSide,
    label: edge.label,
    data: edge,
    type: "jsoncanvas",
    markerEnd: edge.toEnd !== "none" ? { type: MarkerType.ArrowClosed } : undefined,
  };
}
```

### 16.3 Human interactions

MVP interactions:

- drag nodes;
- resize nodes;
- select nodes and edges;
- edit text card contents;
- edit link URL;
- edit file path;
- edit group label;
- create edge by dragging between handles;
- delete selected items;
- zoom/pan;
- fit view.

### 16.4 Group rendering

Groups render as large background cards.

Rules:

- Render groups below other nodes.
- Do not force React Flow parent/child relationships in MVP.
- Use geometry to determine containment.
- Moving a group does not move contained cards in MVP unless `moveContained: true` is implemented later.

### 16.5 Screenshot

Reuse the existing screenshot request flow, but implement export for the JSON Canvas renderer.

If existing browser screenshot code is Excalidraw-specific, extract an interface:

```ts
export interface BrowserCanvasApi {
  applyScene(scene: unknown): void;
  getScene(): unknown;
  exportPng(options: ExportOptions): Promise<Blob>;
  getSelection(): string[];
  setSelection(ids: string[]): void;
}
```

---

## 17. WebSocket protocol

The shared WS protocol should become plugin-neutral.

Current Excalidraw-shaped payloads should be generalized:

```ts
export type ServerToBrowserMessage =
  | {
      type: "scene:set";
      canvas: string;
      version: number;
      scene: unknown;
      appState?: unknown;
      origin?: string;
    }
  | {
      type: "export:request";
      requestId: string;
      options: ExportOptions;
    }
  | {
      type: "selection:request";
      requestId: string;
    }
  | {
      type: "selection:set";
      requestId: string;
      selectedIds: string[];
    };

export type BrowserToServerMessage =
  | {
      type: "scene:changed";
      canvas: string;
      version?: number;
      scene: unknown;
      appState?: unknown;
      origin?: string;
    }
  | {
      type: "export:result";
      requestId: string;
      imageBase64?: string;
      error?: string;
    }
  | {
      type: "selection:result";
      requestId: string;
      selectedIds: string[];
    };
```

JSON Canvas scene payload:

```ts
{
  nodes: JsonCanvasNode[];
  edges: JsonCanvasEdge[];
}
```

---

## 18. Validation and repair

### 18.1 Validation errors

Detect and report:

- invalid JSON;
- top-level value is not an object;
- `nodes` is present but not an array;
- `edges` is present but not an array;
- missing node IDs;
- duplicate node IDs;
- unsupported node types;
- non-integer coordinates or dimensions;
- width/height less than minimum;
- text node missing `text`;
- file node missing `file`;
- link node missing `url`;
- edge references missing nodes;
- invalid sides;
- invalid endpoint types;
- invalid color values.

### 18.2 Repair mode

For `open_canvas` and `apply_jsoncanvas_patch`, optionally allow:

```ts
{ "repair": true }
```

Repair behavior:

- default missing `nodes`/`edges` to empty arrays;
- round float coordinates to integers;
- assign IDs to nodes or edges missing IDs;
- drop dangling edges;
- clamp dimensions to minimum values;
- remove invalid optional fields;
- preserve original as much as possible.

Repair output must include warnings.

---

## 19. Security and workspace behavior

Keep the existing local-first safety posture.

Rules:

- `.canvas` open/save paths must remain inside the configured workspace root.
- File-card `file` paths are stored as strings only; do not read arbitrary referenced files in MVP.
- Link-card URLs are stored as strings only; do not fetch remote URLs in MVP.
- Screenshots are written only through the workspace-safe screenshot path resolver.
- Do not execute Markdown, HTML, or scripts from cards.

---

## 20. Testing plan

### 20.1 Unit tests

`jsoncanvas-format.test.ts`

- serializes valid document to pretty JSON;
- deserializes text/file/link/group/edge examples;
- appends `.canvas` on save;
- rejects wrong extension;
- preserves node order.

`jsoncanvas-validation.test.ts`

- rejects duplicate IDs;
- rejects dangling edges;
- validates sides and endpoint types;
- validates colors;
- repair mode drops dangling edges and reports warnings.

`jsoncanvas-adapter.test.ts`

- maps each node type to summary;
- maps edge to summary;
- computes incoming/outgoing references;
- computes group containment.

`jsoncanvas-layout.test.ts`

- deterministic output from same input;
- roots placed in first layer;
- cycles handled predictably;
- orphan nodes placed separately;
- group resizing encloses contained cards.

`jsoncanvas-tools.test.ts`

- `add_text_card` creates valid node;
- `connect_cards` creates valid edge;
- `find_cards` searches all supported fields;
- `apply_jsoncanvas_patch` is atomic;
- failed patch does not mutate scene.

### 20.2 Integration tests

- MCP in-memory transport calls baseline and plugin tools.
- `save_canvas` + `open_canvas` round trip produces identical document.
- WS browser edit updates server scene.
- Selection request returns selected card IDs.
- Screenshot request returns PNG from connected browser renderer.

### 20.3 Compatibility tests

Keep a small fixture directory:

```text
tests/fixtures/jsoncanvas/
  minimal.canvas
  text-file-link-group.canvas
  labeled-edges.canvas
  obsidian-sample.canvas
```

Each fixture should load and save without losing required fields.

---

## 21. Documentation changes

Update `README.md`:

```md
npm start -- --canvas jsoncanvas
npx @trohde/agentic-canvas --canvas jsoncanvas
```

Update flags section:

```md
--canvas <name>: canvas plugin, one of `excalidraw`, `jsoncanvas`
```

Add example MCP flow:

```md
1. Call `add_text_card` for context, risk, decision, and next step.
2. Call `connect_cards` with labels such as `causes`, `mitigates`, `depends on`.
3. Call `create_group` to frame risks and decisions.
4. Call `auto_layout_cards`.
5. Call `save_canvas` with `{ "path": "architecture-review" }`.
```

Add known limitation:

```md
The JSON Canvas plugin writes standards-compatible `.canvas` files but does not fetch link previews, index Obsidian vaults, or render arbitrary embedded media in v1.
```

---

## 22. Implementation milestones

### Milestone 0 — plugin-neutral core

- Refactor `Scene`, `SerializedScene`, and WS protocol to plugin-neutral payloads.
- Add plugin registry.
- Make CLI accept registry keys.
- Make server construct selected plugin.
- Keep Excalidraw tests passing.

Acceptance:

```bash
npm run verify
npm start -- --canvas excalidraw
```

### Milestone 1 — JSON Canvas model and file format

- Add `src/plugins/jsoncanvas/model.ts`.
- Add Zod schemas.
- Add serialize/deserialize.
- Add validation and repair helpers.
- Add tests for fixtures.

Acceptance:

```bash
npm test -- jsoncanvas-format jsoncanvas-validation
```

### Milestone 2 — plugin baseline operations

- Implement `CanvasPlugin` for JSON Canvas.
- Implement list/get/create/update/delete/clear.
- Map nodes and edges to generic object summaries.

Acceptance:

- `get_canvas_state` returns `canvas: "jsoncanvas"`.
- `list_objects` returns nodes and edges.
- `save_canvas` writes `.canvas`.

### Milestone 3 — MCP tools

- Add JSON Canvas-specific tools.
- Add atomic `apply_jsoncanvas_patch`.
- Add search and layout tools.

Acceptance:

- Agent can create a useful 10-card, 12-edge map in one patch.
- Invalid patch rolls back completely.

### Milestone 4 — browser renderer

- Add `JsonCanvasApp.tsx`.
- Add React Flow mapping.
- Implement drag/resize/edit/connect/delete.
- Implement selection and screenshot.

Acceptance:

- Human edit appears in `list_objects` after WS sync.
- MCP-created card appears live in browser.
- Browser-created edge appears in server state.

### Milestone 5 — docs and release

- README updates.
- Manual verification checklist.
- Package smoke test.
- Changelog entry.

---

## 23. Manual verification checklist

1. Run:

   ```bash
   npm run build && npm start -- --canvas jsoncanvas --workspace /tmp/agentic-canvas-jsoncanvas
   ```

2. Connect MCP client.
3. Call `add_text_card` three times.
4. Call `connect_cards` twice.
5. Confirm cards and edges appear live in browser.
6. Drag one card in browser.
7. Call `get_object` and confirm updated `x`/`y`.
8. Edit text in browser.
9. Call `get_object` and confirm updated text.
10. Call `create_group`.
11. Call `auto_layout_cards`.
12. Call `save_canvas` with `{ "path": "demo" }`.
13. Confirm `demo.canvas` exists in workspace.
14. Call `clear_canvas`.
15. Call `open_canvas` with `{ "path": "demo" }`.
16. Confirm scene restores.
17. Call `screenshot` and confirm PNG is returned.

---

## 24. Acceptance criteria

The plugin is ready when:

- `npm run verify` passes;
- `--canvas jsoncanvas` starts without Excalidraw dependencies leaking into Node-only code;
- baseline MCP tools work;
- JSON Canvas-specific MCP tools work;
- `.canvas` files round-trip without losing required fields;
- browser edits sync to server;
- server edits sync to browser;
- screenshot works;
- selection works;
- README documents usage;
- Excalidraw remains unaffected.

---

## 25. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Core scene model remains Excalidraw-specific | Blocks plugin | Do Milestone 0 first |
| React Flow state leaks into `.canvas` files | Poor interoperability | Keep React Flow mapping browser-only |
| Groups imply membership but JSON Canvas does not store explicit membership | Confusing UX | Use geometric containment and document it |
| Human edits produce invalid document | Save/open breakage | Validate on every browser scene change |
| Link/file cards become security-sensitive | Local data exposure | Store strings only; no fetching/reading in MVP |
| Auto-layout damages human layout | User frustration | Make layout explicit, not automatic after edits |

---

## 26. Future enhancements

After MVP:

- Obsidian-specific import/export compatibility tests;
- Markdown preview mode;
- card templates;
- semantic edge labels library;
- import from Markdown headings;
- export selected cards to Markdown outline;
- convert Excalidraw selected text boxes to JSON Canvas text cards;
- backlinks between `.canvas` and project files;
- optional link previews with explicit user opt-in;
- graph analytics: centrality, clusters, orphan detection;
- split/merge cards;
- AI summarization of groups.

---

## 27. Recommended first implementation ticket

**Ticket:** Make Agentic Canvas core plugin-neutral without changing Excalidraw behavior.

Scope:

- introduce plugin registry;
- generalize scene wrapper;
- generalize serialized scene type;
- generalize WS scene payload;
- make CLI accept registry keys;
- keep Excalidraw selected by default;
- keep all existing tests green.

This is the right first ticket because `jsoncanvas` and `flow` both depend on it. Building UI first would create avoidable rework.
