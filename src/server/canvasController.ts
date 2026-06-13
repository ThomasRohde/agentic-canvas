import type { CanvasPlugin } from "../core/plugin.js";
import type {
  AppState,
  BinaryFiles,
  CanvasMetadata,
  CanvasObject,
  CanvasObjectSummary,
  CanvasObjectType,
  CreateObjectSpec,
  ExcalidrawElement,
  Scene,
  UpdateObjectPatch,
} from "../core/scene.js";
import { cloneScene } from "../core/scene.js";

export type SceneChangeOrigin = unknown;

export interface SceneSnapshot {
  version: number;
  elements: ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

export type SceneChangeListener = (snapshot: SceneSnapshot, origin?: SceneChangeOrigin) => void;

export class CanvasController {
  private scene: Scene;
  private listener?: SceneChangeListener;
  private txDepth = 0;
  private txDirty = false;
  private txOrigin?: SceneChangeOrigin;

  constructor(private readonly plugin: CanvasPlugin) {
    this.scene = plugin.createInitialScene();
  }

  get canvasName(): string {
    return this.plugin.name;
  }

  setChangeListener(listener: SceneChangeListener): void {
    this.listener = listener;
  }

  getScene(): Scene {
    return cloneScene(this.scene);
  }

  getSnapshot(): SceneSnapshot {
    return {
      version: this.scene.version,
      elements: this.scene.elements,
      appState: this.scene.appState,
      files: this.scene.files,
    };
  }

  currentVersion(): number {
    return this.scene.version;
  }

  getMetadata(clientsConnected = 0): CanvasMetadata & { clientsConnected: number } {
    return {
      ...this.plugin.getMetadata(this.scene),
      clientsConnected,
    };
  }

  listObjects(type?: CanvasObjectType): CanvasObjectSummary[] {
    return this.plugin.listObjects(this.scene, type);
  }

  getObject(id: string): CanvasObject | undefined {
    return this.plugin.getObject(this.scene, id);
  }

  createObject(spec: CreateObjectSpec): CanvasObject {
    return this.mutateScene((scene) => this.plugin.createObject(scene, spec));
  }

  updateObject(id: string, patch: UpdateObjectPatch): CanvasObject | undefined {
    return this.mutateScene((scene) => this.plugin.updateObject(scene, id, patch));
  }

  deleteObjects(ids: string[]): string[] {
    return this.mutateScene((scene) => this.plugin.deleteObjects(scene, ids));
  }

  clear(): void {
    this.mutateScene((scene) => this.plugin.clear(scene));
  }

  serialize(): string {
    return JSON.stringify(this.plugin.serialize(this.scene), null, 2);
  }

  deserialize(raw: string): void {
    const currentVersion = this.scene.version;
    this.scene = this.plugin.deserialize(raw);
    this.scene.version = currentVersion;
    this.bumpAndNotify();
  }

  replaceFromBrowser(
    elements: ExcalidrawElement[],
    appState?: Partial<AppState>,
    files?: BinaryFiles,
    origin?: SceneChangeOrigin,
  ): void {
    this.scene.elements = elements;
    this.scene.appState = {
      viewBackgroundColor: appState?.viewBackgroundColor ?? this.scene.appState.viewBackgroundColor,
    };
    this.scene.files = files ?? this.scene.files;
    this.bumpAndNotify(origin);
  }

  mutateScene<T>(mutator: (scene: Scene) => T, origin?: SceneChangeOrigin): T {
    const result = mutator(this.scene);
    this.bumpAndNotify(origin);
    return result;
  }

  transaction<T>(fn: () => T, origin?: SceneChangeOrigin): T {
    this.txDepth += 1;
    try {
      return fn();
    } finally {
      this.txDepth -= 1;
      if (this.txDepth === 0 && this.txDirty) {
        const txOrigin = this.txOrigin;
        this.txDirty = false;
        this.txOrigin = undefined;
        this.commit(txOrigin ?? origin);
      }
    }
  }

  private bumpAndNotify(origin?: SceneChangeOrigin): void {
    if (this.txDepth > 0) {
      this.txDirty = true;
      this.txOrigin = origin ?? this.txOrigin;
      return;
    }

    this.commit(origin);
  }

  private commit(origin?: SceneChangeOrigin): void {
    this.scene.version += 1;
    this.listener?.(this.getSnapshot(), origin);
  }
}
