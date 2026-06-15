import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("agent plugin packaging", () => {
  it("keeps Codex, Claude, and Copilot manifests pointed at the same plugin payload", async () => {
    const codex = await readJson<PluginManifest>(
      "plugins/agentic-canvas/.codex-plugin/plugin.json",
    );
    const claude = await readJson<PluginManifest>(
      "plugins/agentic-canvas/.claude-plugin/plugin.json",
    );
    const copilot = await readJson<PluginManifest>("plugins/agentic-canvas/plugin.json");
    const openPlugin = await readJson<PluginManifest>("plugins/agentic-canvas/.plugin/plugin.json");
    const mcp = await readJson<{ mcpServers: Record<string, { type: string; url: string }> }>(
      "plugins/agentic-canvas/.mcp.json",
    );

    for (const manifest of [codex, claude, copilot, openPlugin]) {
      expect(manifest.name).toBe("agentic-canvas");
      expect(manifest.description).toContain("Agentic Canvas");
    }

    expect(codex.skills).toBe("./skills/");
    expect(codex.mcpServers).toBe("./.mcp.json");
    expect(copilot.skills).toBe("skills/");
    expect(copilot.mcpServers).toBe(".mcp.json");
    expect(openPlugin.skills).toBe("skills/");
    expect(openPlugin.mcpServers).toBe(".mcp.json");
    expect(mcp.mcpServers["agentic-canvas"]).toEqual({
      type: "http",
      url: "http://127.0.0.1:3333/mcp",
    });
  });

  it("publishes marketplace entries in the locations expected by each client", async () => {
    const codex = await readJson<CodexMarketplace>(".agents/plugins/marketplace.json");
    const claude = await readJson<AgentMarketplace>(".claude-plugin/marketplace.json");
    const copilot = await readJson<AgentMarketplace>(".github/plugin/marketplace.json");

    expect(codex.name).toBe("agentic-canvas");
    expect(codex.plugins).toContainEqual(
      expect.objectContaining({
        name: "agentic-canvas",
        source: { source: "local", path: "./plugins/agentic-canvas" },
      }),
    );

    for (const marketplace of [claude, copilot]) {
      expect(marketplace.name).toBe("agentic-canvas");
      expect(marketplace.owner.name).toBe("Thomas Rohde");
      expect(marketplace.plugins).toContainEqual(
        expect.objectContaining({
          name: "agentic-canvas",
          source: "./plugins/agentic-canvas",
          category: "productivity",
        }),
      );
    }
  });
});

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  skills?: string;
  mcpServers?: string;
}

interface CodexMarketplace {
  name: string;
  plugins: Array<{
    name: string;
    source: {
      source: string;
      path: string;
    };
  }>;
}

interface AgentMarketplace {
  name: string;
  owner: {
    name: string;
  };
  plugins: Array<{
    name: string;
    source: string;
    category?: string;
  }>;
}

async function readJson<T>(relativePath: string): Promise<T> {
  const raw = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(raw) as T;
}
