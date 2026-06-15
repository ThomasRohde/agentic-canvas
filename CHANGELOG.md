# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 0.6.0 - 2026-06-15

- Added the `flow` backend with Agentic Canvas-native `.flow` documents, typed nodes, ports, edges, validation/repair, deterministic layout, graph traversal, and Mermaid export.
- Added Flow-specific MCP tools for node, port, and edge CRUD, search, upstream/downstream/path/cycle traversal, `validate_flow`, `auto_layout_flow`, `export_mermaid`, and transactional `apply_flow_patch`.
- Added a React Flow browser renderer for Flow with WebSocket sync, browser editing, selection, screenshot export, inspector editing, and port-aware edge rendering.
- Registered Flow in the static canvas registry, CLI, browser router, docs, and capability guidance while keeping generic shape tools hidden for Flow.
- Expanded Flow format, validation, adapter, graph, layout, Mermaid, MCP, WebSocket, browser-render, and capability tests.

## 0.5.1 - 2026-06-15

- Fixed JSON Canvas auto-layout spacing so explicit small `layerSpacing` values do not overlap cards.
- Hardened JSON Canvas strict open validation for duplicate edge ids and global node/edge id collisions.
- Prevented browser scene echoes from creating duplicate undo history entries.
- Added advisory warnings for JSON Canvas self-loop and parallel edges while keeping them format-compatible.
- Preserved multiline JSON Canvas card text in the browser renderer and documented JSON Canvas defaults, version semantics, and selection lifetime.

## 0.5.0 - 2026-06-15

- Added the `jsoncanvas` backend with plugin-neutral core scene handling, JSON Canvas `.canvas` validation/repair, semantic card/edge MCP tools, and a React Flow browser renderer.
- Added `/canvas-info` and static canvas plugin registry support for selecting `excalidraw` or `jsoncanvas`.
- Added `get_canvas_capabilities` so MCP clients and the bundled Codex plugin can discover canvas-specific tool workflows at runtime.
- Added Claude Code and GitHub Copilot plugin manifests and marketplaces alongside the existing Codex plugin packaging.
- Updated WebSocket scene sync to carry plugin-neutral scene payloads while preserving Excalidraw behavior.

## 0.4.1 - 2026-06-15

- Added a repo-bundled Codex plugin and local marketplace entry for Agentic Canvas.
- Documented Codex plugin installation and the local MCP server startup workflow.

## 0.4.0 - 2026-06-15

- Hardened MCP file tools so canvas files default to `.excalidraw`, screenshots default to `.png`, and mismatched extensions return clear tool errors.
- Added type-aware Excalidraw mutation validation for text creation, linear geometry, endpoint updates, container assignments, and self-loop arrows.
- Updated `delete_object`, `get_canvas_state`, and `/healthz` responses with missing-id and package/server version metadata.
- Expanded MCP, plugin, patch, file, and HTTP health tests for the blackbox findings.

## 0.3.0 - 2026-06-14

- Added MCP server instructions to guide agent tool use.
- Added `find_objects` and `apply_canvas_patch` baseline MCP tools for semantic search and atomic multi-object edits.
- Added Excalidraw `connect_objects`, `align_distribute_objects`, and `auto_layout_objects` MCP tools.
- Added deterministic layout planning, Codex MCP profile examples, canvas operation guidance, and expanded MCP/layout tests.

## 0.2.0 - 2026-06-13

- Added browser-backed `select_objects`, shared `set_canvas_background`, and in-memory `undo`/`redo` MCP tools.
- Added Excalidraw `ungroup_objects` and `remove_from_frame` tools.
- Hardened object validation, grouping, deletion reporting, flowchart planning, and derived label/arrow geometry after edits.
- Added WebSocket support for programmatic selection and expanded MCP, plugin, controller, and WebSocket tests.

## 0.1.1 - 2026-06-13

- Patch release to verify GitHub Actions trusted publishing after the first npm publication.
- No runtime behavior changes.

## 0.1.0 - 2026-06-13

- Initial local-first Agentic Canvas implementation.
- Added Excalidraw-backed browser canvas, MCP Streamable HTTP tools, WebSocket scene sync, save/open, and screenshot support.
- Added production npm package metadata, CI, release documentation, and package smoke checks.
