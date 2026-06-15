import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CanvasMetadata,
  CanvasObject,
  CanvasObjectDetail,
  CanvasObjectSummary,
  CanvasObjectType,
  CreateObjectSpec,
  Scene,
  UpdateObjectPatch,
} from "./scene.js";

export interface PluginToolContext {
  controller: {
    createObject(spec: CreateObjectSpec): CanvasObject;
    updateObject(id: string, patch: UpdateObjectPatch): CanvasObject | undefined;
    getObject(id: string): CanvasObjectDetail | undefined;
    listObjects(type?: CanvasObjectType): CanvasObjectSummary[];
    getScene(): Scene;
    currentVersion(): number;
    mutateScene<T>(mutator: (scene: Scene) => T): T;
    transaction<T>(fn: () => T): T;
  };
  requestSelection(options?: { timeoutMs?: number }): Promise<{ selectedIds: string[] }>;
}

export interface CanvasPreferredTools {
  inspect: string[];
  create: string[];
  update: string[];
  connect: string[];
  layout: string[];
  file: string[];
}

export interface CanvasPluginCapabilities {
  pluginTools: string[];
  destructiveTools?: string[];
  preferredTools: CanvasPreferredTools;
  usageGuidance: string[];
}

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
  normalizeBrowserScene?(
    native: unknown,
    appState: unknown,
    currentScene: Scene,
  ): { native: unknown; appState: Record<string, unknown> };
  serialize(scene: Scene): unknown;
  deserialize(raw: string, options?: { repair?: boolean }): Scene;
  registerTools(server: McpServer, context: PluginToolContext): void;
}

export interface ShapeCanvasPlugin extends CanvasPlugin {
  listObjects(scene: Scene, type?: CanvasObjectType): CanvasObjectSummary[];
  getObject(scene: Scene, id: string): CanvasObject | undefined;
  createObject(scene: Scene, spec: CreateObjectSpec): CanvasObject;
  updateObject(scene: Scene, id: string, patch: UpdateObjectPatch): CanvasObject | undefined;
}
