import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_NAME = "agentic-canvas";
export const MCP_SERVER_NAME = "agentic-canvas";
export const PACKAGE_NAME = "@trohde/agentic-canvas";

export interface PackageInfo {
  name: string;
  version: string;
}

export function readPackageInfo(): PackageInfo {
  const packageJsonPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../package.json",
  );
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Partial<PackageInfo>;

  return {
    name: typeof parsed.name === "string" ? parsed.name : PACKAGE_NAME,
    version: typeof parsed.version === "string" ? parsed.version : "0.0.0",
  };
}
