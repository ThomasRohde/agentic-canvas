import { CaptureUpdateAction, Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, BinaryFiles, ExcalidrawElement } from "../core/scene.js";
import type { ExportRequestMessage, SceneSetMessage } from "../shared/protocol.js";
import { exportSceneToBase64 } from "./exportImage.js";
import { applyRemoteSceneToCanvas } from "./sceneApply.js";
import {
  consumeAppliedSceneEcho,
  createAppliedSceneSignatures,
  rememberAppliedScene,
} from "./sceneSync.js";
import { CanvasWsClient, type ConnectionState } from "./wsClient.js";

interface ExcalidrawApi {
  updateScene(scene: Record<string, unknown>): void;
  getSceneElements(): readonly unknown[];
  getAppState(): Record<string, unknown>;
  getFiles(): Record<string, unknown>;
}

export function CanvasApp() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [version, setVersion] = useState(0);
  const apiRef = useRef<ExcalidrawApi | null>(null);
  const clientRef = useRef<CanvasWsClient | null>(null);
  const appliedVersion = useRef(0);
  const appliedSignatures = useRef(createAppliedSceneSignatures());
  const resyncRequestedForVersion = useRef<number | undefined>(undefined);
  const userEditPending = useRef(false);
  const changeTimer = useRef<number | undefined>(undefined);

  const mcpUrl = useMemo(() => `${window.location.origin}/mcp`, []);

  useEffect(() => {
    const client = new CanvasWsClient({
      onStateChange: setConnectionState,
      onSceneSet: (message) => applyRemoteScene(message),
      onExportRequest: (message) => void handleExportRequest(message),
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      if (changeTimer.current) {
        window.clearTimeout(changeTimer.current);
      }
    };
  }, []);

  const applyRemoteScene = (message: SceneSetMessage) => {
    const api = apiRef.current;
    if (!api) {
      return;
    }

    if (changeTimer.current) {
      window.clearTimeout(changeTimer.current);
      changeTimer.current = undefined;
    }

    const result = applyRemoteSceneToCanvas({
      api,
      message,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      restoreElements: (elements) =>
        restoreElements(elements as never, null, { repairBindings: true }) as readonly unknown[],
      rememberAppliedScene: (elements) => rememberAppliedScene(appliedSignatures.current, elements),
      setAppliedVersion: (nextVersion) => {
        appliedVersion.current = nextVersion;
      },
      setVisibleVersion: setVersion,
      requestFullScene: () => clientRef.current?.requestFullScene(),
      shouldRequestFullScene: (nextVersion) => {
        if (resyncRequestedForVersion.current === nextVersion) {
          return false;
        }

        resyncRequestedForVersion.current = nextVersion;
        return true;
      },
      onError: (error, phase) => {
        console.warn(`Failed to ${phase} remote scene`, error);
      },
    });

    if (result.applied === "restored") {
      resyncRequestedForVersion.current = undefined;
    }
  };

  const handleExportRequest = async (message: ExportRequestMessage) => {
    const api = apiRef.current;
    if (!api) {
      clientRef.current?.sendExportError(message.id, "Excalidraw API is not ready");
      return;
    }

    try {
      const exported = await exportSceneToBase64({
        elements: api.getSceneElements() as ExcalidrawElement[],
        appState: api.getAppState(),
        files: api.getFiles() as BinaryFiles,
        exportPadding: message.exportPadding,
      });
      clientRef.current?.sendExportResult(message.id, exported.mimeType, exported.base64);
    } catch (error) {
      clientRef.current?.sendExportError(
        message.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const markUserEditing = () => {
    userEditPending.current = true;
  };

  const handleChange = (elements: readonly unknown[], appState: unknown, files: unknown) => {
    if (consumeAppliedSceneEcho(appliedSignatures.current, elements)) {
      return;
    }
    if (!userEditPending.current) {
      return;
    }

    if (changeTimer.current) {
      window.clearTimeout(changeTimer.current);
    }

    const baseVersion = appliedVersion.current;
    const changedElements = [...elements] as ExcalidrawElement[];
    const safeAppState = {
      viewBackgroundColor: (appState as Partial<AppState>).viewBackgroundColor ?? "#ffffff",
    };
    const changedFiles = files as BinaryFiles;

    changeTimer.current = window.setTimeout(() => {
      if (consumeAppliedSceneEcho(appliedSignatures.current, changedElements)) {
        return;
      }

      userEditPending.current = false;
      clientRef.current?.sendSceneChanged(baseVersion, changedElements, safeAppState, changedFiles);
    }, 200);
  };

  return (
    <main
      className="canvas-shell"
      onKeyDownCapture={markUserEditing}
      onPointerDownCapture={markUserEditing}
    >
      <div className="canvas-surface">
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api as unknown as ExcalidrawApi;
          }}
          initialData={{
            elements: [],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          }}
          onChange={handleChange}
          gridModeEnabled
          theme="light"
        />
      </div>
      <footer className="status-bar">
        <span>Agentic Canvas</span>
        <span>Canvas: Excalidraw</span>
        <span>MCP: {mcpUrl}</span>
        <span data-state={connectionState}>WS: {connectionState}</span>
        <span>Scene: v{version}</span>
      </footer>
    </main>
  );
}
