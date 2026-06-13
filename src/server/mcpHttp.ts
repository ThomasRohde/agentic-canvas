import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response, Router } from "express";

type Transport = StreamableHTTPServerTransport;

export function mountMcpHttp(
  router: Router,
  createServer: () => McpServer,
  allowedHosts: string[],
): void {
  const transports = new Map<string, Transport>();

  router.post("/mcp", async (req, res) => {
    try {
      const sessionId = headerValue(req, "mcp-session-id");
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (!isInitialize(req.body)) {
          res.status(400).json({ error: "Missing or invalid MCP session" });
          return;
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableDnsRebindingProtection: true,
          allowedHosts,
          onsessioninitialized: (newSessionId) => {
            transports.set(newSessionId, transport as Transport);
          },
        });
        transport.onclose = () => {
          const currentSessionId = transport?.sessionId;
          if (currentSessionId) {
            transports.delete(currentSessionId);
          }
        };

        await createServer().connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      sendTransportError(res, error);
    }
  });

  router.get("/mcp", async (req, res) => {
    await handleSessionRequest(req, res, transports);
  });

  router.delete("/mcp", async (req, res) => {
    await handleSessionRequest(req, res, transports);
  });
}

async function handleSessionRequest(
  req: Request,
  res: Response,
  transports: Map<string, Transport>,
): Promise<void> {
  const sessionId = headerValue(req, "mcp-session-id");
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).json({ error: "Missing or invalid MCP session" });
    return;
  }

  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    sendTransportError(res, error);
  }
}

function isInitialize(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((message) => isInitializeRequest(message));
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function sendTransportError(res: Response, error: unknown): void {
  if (res.headersSent) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
}
