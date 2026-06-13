import path from "node:path";
import express from "express";
import type { BuildMcpServerOptions } from "../mcp/buildServer.js";
import { buildMcpServer } from "../mcp/buildServer.js";
import { mountMcpHttp } from "./mcpHttp.js";

export interface CreateAppOptions extends BuildMcpServerOptions {
  webDistDir: string;
  allowedHosts: string[];
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();

  app.use(express.json({ limit: "10mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      canvas: options.plugin.name,
      version: options.controller.getSnapshot().version,
    });
  });

  mountMcpHttp(app, () => buildMcpServer(options), options.allowedHosts);

  app.use(express.static(options.webDistDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(options.webDistDir, "index.html"), (error) => {
      if (error) {
        res.status(404).send("Agentic Canvas web build not found. Run npm run build first.");
      }
    });
  });

  return app;
}
