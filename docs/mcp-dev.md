# MCP Development

Agentic Canvas exposes MCP over Streamable HTTP at `/mcp`. Development should keep the
backend MCP server and the browser UI as separate local processes: the backend owns
MCP, WebSocket sync, workspace file access, and scene state; Vite only serves the web
UI with hot module replacement.

## Server-Only Loop

Use this when you are changing MCP tools, server code, plugin logic, or workspace
behavior:

```bash
npm run dev
```

This runs the TypeScript CLI through `tsx watch` and starts the backend on
`http://127.0.0.1:3333` by default. MCP clients should connect directly to:

```text
http://127.0.0.1:3333/mcp
```

The backend port can be changed with the existing CLI flags or environment variables:

```bash
npm run dev:server -- --port 3939
```

## Full UI Loop

Use two terminals when changing both web and backend code:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Open the browser UI at:

```text
http://127.0.0.1:5173
```

Vite proxies `/ws`, `/mcp`, and `/healthz` to the backend target. The default target is
`http://127.0.0.1:3333`; override it when the backend runs elsewhere:

```bash
$env:AGENTIC_CANVAS_DEV_BACKEND = "http://127.0.0.1:3939"
npm run dev:web
```

Even when using the Vite UI, MCP clients should normally connect to the backend MCP URL
on port `3333`, not the Vite UI port.

## Codex Configuration

Do not commit a `.codex/config.toml` for this project. If you trust the repository and
want Codex to connect to the local dev server, create this file locally:

```toml
[mcp_servers.agentic-canvas-dev]
url = "http://127.0.0.1:3333/mcp"
startup_timeout_sec = 20
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

Start `npm run dev` before opening a Codex session that uses this MCP server. If the
backend restarts, existing MCP sessions may need to reconnect. If tool names, schemas,
or server instructions change and Codex does not refresh them, start a fresh Codex
thread.

## MCP Inspector

With the backend running on the default port, launch the Inspector:

```bash
npm run inspect:mcp
```

The Inspector connects to `http://127.0.0.1:3333/mcp` using Streamable HTTP. Use it to
list tools and call simple tools such as `get_canvas_state` before testing browser-bound
flows like `screenshot`.

## Constraints

- Keep MCP on Streamable HTTP for v1; do not add stdio transport.
- Keep backend logs on stderr. Stdout is reserved for intentional CLI output.
- Do not rename tools or change schemas without a documented reason and matching tests.
- Do not add auth, database, telemetry, dynamic plugin loading, or a second plugin.
