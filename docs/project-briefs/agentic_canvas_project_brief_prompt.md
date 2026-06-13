# Agentic Canvas project brief prompt

Use this project brief together with `agent_ready_greenfield_project_meta_prompt.md`.

Create a `PLAN.md` for a new greenfield project called **Agentic Canvas**.

Agentic Canvas is a local-first visual canvas application designed for AI agents and humans to share an interactive drawing and work surface. A human should be able to start the app locally, open a browser-based canvas, and let an agent connect through an MCP server to draw, inspect, save, load, and manipulate objects on that canvas.

The project is designed primarily for local-only use. Do not plan for cloud hosting, accounts, collaboration servers, authentication, payments, analytics, or multi-user persistence in the first version.

## Core Product Idea

Agentic Canvas provides:

- A browser-based visual canvas surface.
- A local MCP server that agents can use to interact with the canvas.
- Support for both stdio and HTTP MCP transports if feasible for the first version.
- A simple local startup flow using an `npx` command.
- A plugin architecture where the user selects the canvas type at startup.
- One initial plugin: an Excalidraw-backed canvas.
- A standard minimum MCP tool set that every canvas plugin must expose.
- Plugin-specific MCP tools optimized for the selected canvas type.

The first version should prove the full loop:

1. The user starts the app locally with an `npx` command.
2. The user selects, or defaults to, the Excalidraw canvas plugin.
3. The app opens or serves a local browser canvas.
4. An MCP client connects to the local server.
5. The MCP client can create or modify canvas objects.
6. The user can see those changes in the browser.
7. The MCP client can save, open, and screenshot the canvas.

## Startup And Usage Goals

The planned project should support a startup flow similar to:

```bash
npx agentic-canvas --canvas excalidraw
```

The exact package name, CLI design, ports, and flags can be refined in the plan, but the local developer and user experience should stay simple.

The app should default to the Excalidraw plugin for the first version if no canvas plugin is provided.

## Plugin Architecture

Design the project as a plugin system from the start, but keep the first implementation small and practical.

Each canvas plugin should define:

- The canvas renderer or embedded canvas implementation.
- The plugin-specific object model adapter.
- The plugin-specific MCP server or tool implementation.
- The shared baseline MCP tools required by all plugins.
- Additional MCP tools and workflows optimized for that particular canvas type.
- Any plugin-specific save and load format handling.
- Any plugin-specific screenshot or export behavior.

The first version should include only the Excalidraw plugin. Other canvas types, such as tldraw, should be treated as future extensions and must not be implemented in the first version.

Avoid designing a marketplace, remote plugin registry, dynamic package loading system, or broad plugin framework unless necessary. A simple internal plugin interface is enough for the first version.

## MCP Server Requirements

Every canvas plugin should expose two layers of MCP capability:

1. A common baseline tool set that all plugins must implement.
2. Canvas-specific tools optimized for the selected canvas type.

The baseline tools should let an agent perform useful cross-canvas operations without knowing the implementation details of a specific canvas engine.

At minimum, consider baseline tools for:

- `save`
- `open`
- `screenshot`
- Creating objects
- Updating objects
- Deleting objects
- Listing or inspecting objects
- Clearing the canvas
- Getting canvas metadata or current state

The canvas-specific tools should expose higher-value operations that fit the chosen canvas type. For Excalidraw, the plan should consider operations such as creating diagrams, shapes, arrows, labels, groups, frames, or other Excalidraw-native constructs if they are reasonable for the first version.

The plan should distinguish clearly between:

- The generic MCP contract shared by all plugins.
- The Excalidraw-specific MCP tools and behavior.
- Future plugin extension points.

## Excalidraw First Version

The initial implementation should use Excalidraw as the first canvas type.

The plan should explain:

- How the browser app embeds or integrates Excalidraw.
- How MCP commands map to Excalidraw elements.
- How state is synchronized between the browser canvas and the MCP server.
- How save and open should work locally.
- How screenshots should be produced.
- What subset of Excalidraw object creation is reasonable for the first version.
- Which Excalidraw-specific MCP tools should exist in addition to the baseline tools.

Prefer a small reliable subset over full Excalidraw feature coverage.

## Planning Requirements

Create a concrete implementation plan for a first working version.

The plan should include:

- Recommended stack and rationale.
- Project structure.
- CLI design.
- Local runtime architecture.
- Browser app architecture.
- MCP server architecture.
- Plugin interface.
- Excalidraw plugin design.
- Shared baseline MCP tool contract.
- Excalidraw-specific MCP tool contract.
- Save, open, and screenshot behavior.
- Test strategy.
- Verification commands.
- Milestone-by-milestone implementation steps.
- Clear acceptance criteria.

Do not implement the project. Produce only the `PLAN.md` content.

The plan should optimize for implementation by an autonomous coding agent later. It should be specific enough that another agent can implement it without needing to redesign the project.
