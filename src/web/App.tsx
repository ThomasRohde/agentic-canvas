import { useEffect, useState } from "react";
import { CanvasApp } from "./CanvasApp.js";
import { FlowCanvasApp } from "./canvases/flow/FlowCanvasApp.js";
import { JsonCanvasApp } from "./canvases/jsoncanvas/JsonCanvasApp.js";

interface CanvasInfo {
  canvas: string;
  mcpUrl: string;
  wsUrl: string;
}

export function App() {
  const [canvasInfo, setCanvasInfo] = useState<CanvasInfo | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    void fetch("/canvas-info")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load canvas info: ${response.status}`);
        }
        return response.json() as Promise<CanvasInfo>;
      })
      .then(setCanvasInfo)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
  }, []);

  if (error) {
    return <main className="canvas-error">{error}</main>;
  }

  if (!canvasInfo) {
    return <main className="canvas-loading">Loading canvas...</main>;
  }

  if (canvasInfo.canvas === "jsoncanvas") {
    return <JsonCanvasApp mcpUrl={canvasInfo.mcpUrl} />;
  }

  if (canvasInfo.canvas === "flow") {
    return <FlowCanvasApp mcpUrl={canvasInfo.mcpUrl} />;
  }

  return <CanvasApp />;
}
