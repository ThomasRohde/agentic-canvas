# Agentic Canvas Codex Plugin

This repo-bundled Codex plugin exposes the Agentic Canvas workflow to Codex.

It provides:

- A plugin manifest at `.codex-plugin/plugin.json`.
- An MCP server config at `.mcp.json` for `http://127.0.0.1:3333/mcp`.
- A bundled skill that teaches Codex how to use Agentic Canvas tools.

Start Agentic Canvas before using the MCP tools:

```powershell
npx @trohde/agentic-canvas@latest --canvas excalidraw --workspace <project-dir>
```

The MCP config connects to the running HTTP server. It does not launch the server.

## Install From This Repository

From a local checkout of this repository:

```powershell
codex plugin marketplace add C:\path\to\agentic-canvas
codex plugin add agentic-canvas@agentic-canvas
```

Start a new Codex thread after installing so the plugin skill and MCP tools are
loaded into the session.
