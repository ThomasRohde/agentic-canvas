import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { createApp } from "../src/server/app.js";
import { CanvasController } from "../src/server/canvasController.js";
import { Workspace } from "../src/server/workspace.js";
import { readPackageInfo } from "../src/shared/packageInfo.js";

describe("HTTP app", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("reports package and scene version metadata from healthz", async () => {
    const plugin = createExcalidrawPlugin();
    const controller = new CanvasController(plugin);
    const packageInfo = readPackageInfo();
    const app = createApp({
      plugin,
      controller,
      workspace: new Workspace(root),
      webDistDir: root,
      allowedHosts: ["127.0.0.1", "localhost"],
      clientsConnected: () => 0,
      requestExport: async () => {
        throw new Error("not used");
      },
      requestSelection: async () => ({ selectedIds: [] }),
      requestSetSelection: async (selectedIds) => ({ selectedIds }),
    });
    const server = createServer(app);

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected HTTP server address");
      }

      const response = await fetch(`http://127.0.0.1:${(address as AddressInfo).port}/healthz`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: "ok",
        canvas: "excalidraw",
        version: 0,
        packageName: packageInfo.name,
        serverVersion: packageInfo.version,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  });
});
