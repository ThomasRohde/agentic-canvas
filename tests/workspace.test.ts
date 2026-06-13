import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Workspace } from "../src/server/workspace.js";

describe("Workspace", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("round-trips text inside the workspace", async () => {
    const written = await workspace.writeText("nested/demo.excalidraw", "demo");
    expect(written.startsWith(root)).toBe(true);
    await expect(workspace.readText("nested/demo.excalidraw")).resolves.toMatchObject({
      text: "demo",
    });
  });

  it("rejects traversal and absolute paths outside the workspace", () => {
    expect(() => workspace.resolveInWorkspace("../escape.excalidraw")).toThrow(/outside workspace/);
    expect(() =>
      workspace.resolveInWorkspace(path.resolve(root, "..", "escape.excalidraw")),
    ).toThrow(/outside workspace/);
  });
});
