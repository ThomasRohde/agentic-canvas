import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async ensure(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  resolveInWorkspace(userPath: string): string {
    if (!userPath || userPath.trim().length === 0) {
      throw new Error("Path is required");
    }

    const resolved = path.isAbsolute(userPath)
      ? path.resolve(userPath)
      : path.resolve(this.root, userPath);
    const relative = path.relative(this.root, resolved);
    const staysInside =
      relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

    if (!staysInside) {
      throw new Error(`Path is outside workspace: ${userPath}`);
    }

    return resolved;
  }

  async readText(userPath: string): Promise<{ path: string; text: string }> {
    const resolved = this.resolveInWorkspace(userPath);
    return {
      path: resolved,
      text: await readFile(resolved, "utf8"),
    };
  }

  async writeText(userPath: string, text: string): Promise<string> {
    const resolved = this.resolveInWorkspace(userPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, text, "utf8");
    return resolved;
  }

  async writeBinary(userPath: string, data: Buffer): Promise<string> {
    const resolved = this.resolveInWorkspace(userPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, data);
    return resolved;
  }
}
