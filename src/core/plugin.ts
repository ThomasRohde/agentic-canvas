import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CanvasMetadata,
  CanvasObject,
  CanvasObjectSummary,
  CanvasObjectType,
  CreateObjectSpec,
  Scene,
  SerializedScene,
  UpdateObjectPatch,
} from "./scene.js";

export interface PluginToolContext {
  controller: {
    createObject(spec: CreateObjectSpec): CanvasObject;
    updateObject(id: string, patch: UpdateObjectPatch): CanvasObject | undefined;
    getObject(id: string): CanvasObject | undefined;
    listObjects(type?: CanvasObjectType): CanvasObjectSummary[];
    mutateScene<T>(mutator: (scene: Scene) => T): T;
    transaction<T>(fn: () => T): T;
  };
}

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
