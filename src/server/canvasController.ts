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
  private txSnapshot?: Scene;
  private readonly undoStack: Scene[] = [];
  private readonly redoStack: Scene[] = [];
  private readonly maxHistory = 50;

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
    const before = cloneScene(this.scene);
    const currentVersion = this.scene.version;
    this.scene = this.plugin.deserialize(raw);
    this.scene.version = currentVersion;
    this.pushUndo(before);
    this.redoStack.length = 0;
    this.bumpAndNotify();
  }

  replaceFromBrowser(
    elements: ExcalidrawElement[],
    appState?: Partial<AppState>,
    files?: BinaryFiles,
    origin?: SceneChangeOrigin,
  ): void {
    this.pushUndo(cloneScene(this.scene));
    this.redoStack.length = 0;
    this.scene.elements = elements;
    this.scene.appState = {
      viewBackgroundColor: appState?.viewBackgroundColor ?? this.scene.appState.viewBackgroundColor,
    };
    this.scene.files = files ?? this.scene.files;
    this.bumpAndNotify(origin);
  }

  mutateScene<T>(mutator: (scene: Scene) => T, origin?: SceneChangeOrigin): T {
    if (this.txDepth > 0) {
      const result = mutator(this.scene);
      this.bumpAndNotify(origin);
      return result;
    }

    const before = cloneScene(this.scene);
    const result = mutator(this.scene);
    this.pushUndo(before);
    this.redoStack.length = 0;
    this.bumpAndNotify(origin);
    return result;
  }

  transaction<T>(fn: () => T, origin?: SceneChangeOrigin): T {
    const isOuterTransaction = this.txDepth === 0;
    if (isOuterTransaction) {
      this.txSnapshot = cloneScene(this.scene);
    }

    this.txDepth += 1;
    let failed = false;
    try {
      return fn();
    } catch (error) {
      failed = true;
      if (isOuterTransaction && this.txSnapshot) {
        this.scene = this.txSnapshot;
        this.txDirty = false;
        this.txOrigin = undefined;
      }
      throw error;
    } finally {
      this.txDepth -= 1;
      if (this.txDepth === 0 && failed) {
        this.txSnapshot = undefined;
      } else if (this.txDepth === 0 && this.txDirty) {
        const txOrigin = this.txOrigin;
        const snapshot = this.txSnapshot;
        this.txDirty = false;
        this.txOrigin = undefined;
        this.txSnapshot = undefined;
        if (snapshot) {
          this.pushUndo(snapshot);
          this.redoStack.length = 0;
        }
        this.commit(txOrigin ?? origin);
      } else if (this.txDepth === 0) {
        this.txSnapshot = undefined;
      }
    }
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) {
      return false;
    }

    this.redoStack.push(cloneScene(this.scene));
    this.restoreScene(previous);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) {
      return false;
    }

    this.undoStack.push(cloneScene(this.scene));
    this.restoreScene(next);
    return true;
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

  private pushUndo(scene: Scene): void {
    this.undoStack.push(cloneScene(scene));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  private restoreScene(scene: Scene): void {
    const currentVersion = this.scene.version;
    this.scene = cloneScene(scene);
    this.scene.version = currentVersion;
    this.commit();
  }
}
