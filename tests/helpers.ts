import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function connectInMemory(server: McpServer): Promise<{
  client: Client;
  close(): Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "agentic-canvas-test", version: "0.1.0" },
    { capabilities: {} },
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function textContent(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  const text = content.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error("Expected text content");
  }
  return text;
}

export function jsonContent<T>(result: unknown): T {
  return JSON.parse(textContent(result)) as T;
}
