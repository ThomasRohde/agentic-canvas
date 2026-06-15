# Agentic Canvas Agent Plugin

This repo-bundled plugin exposes the Agentic Canvas workflow to Codex, Claude
Code, and GitHub Copilot.

It provides:

- Codex manifest: `.codex-plugin/plugin.json`.
- Claude Code manifest: `.claude-plugin/plugin.json`.
- GitHub Copilot manifest: `plugin.json`.
- OpenPlugin/Copilot compatibility manifest: `.plugin/plugin.json`.
- An MCP server config at `.mcp.json` for `http://127.0.0.1:3333/mcp`.
- A bundled skill that teaches Codex how to detect the active canvas type and use
  the matching Agentic Canvas tools.

Start Agentic Canvas before using the MCP tools:

```powershell
npx @trohde/agentic-canvas@latest --canvas excalidraw --workspace <project-dir>
npx @trohde/agentic-canvas@latest --canvas jsoncanvas --workspace <project-dir>
```

The MCP config connects to the running HTTP server. It does not launch the server.
The same agent plugin works with every canvas type exposed by the running server.
Agents should call `get_canvas_state`, then `get_canvas_capabilities`, before
choosing Excalidraw or JSON Canvas tool workflows.

For advanced parallel use, run multiple Agentic Canvas servers on different ports
and configure separate MCP server entries manually. The bundled marketplace plugin
defaults to one server at `http://127.0.0.1:3333/mcp`.

## Install From This Repository

From a local checkout of this repository:

```powershell
codex plugin marketplace add C:\path\to\agentic-canvas
codex plugin add agentic-canvas@agentic-canvas

copilot plugin marketplace add C:\path\to\agentic-canvas
copilot plugin install agentic-canvas@agentic-canvas

claude plugin marketplace add C:\path\to\agentic-canvas
claude plugin install agentic-canvas@agentic-canvas
```

For hosted GitHub repositories, use the repository spec instead of the local path.
For Copilot, direct subdirectory install should also work:

```powershell
copilot plugin install ThomasRohde/agentic-canvas:plugins/agentic-canvas
```

Start a new agent thread after installing so the plugin skill and MCP tools are
loaded into the session. Claude Code may require `/reload-plugins` after changing
plugin files during development.
