# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
