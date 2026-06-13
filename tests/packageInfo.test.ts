import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLI_NAME,
  MCP_SERVER_NAME,
  PACKAGE_NAME,
  readPackageInfo,
} from "../src/shared/packageInfo.js";

describe("package metadata", () => {
  it("reads the package name and version used by the CLI and MCP server", () => {
    const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as {
      name: string;
      version: string;
    };

    expect(readPackageInfo()).toEqual({
      name: packageJson.name,
      version: packageJson.version,
    });
    expect(PACKAGE_NAME).toBe("@trohde/agentic-canvas");
    expect(CLI_NAME).toBe("agentic-canvas");
    expect(MCP_SERVER_NAME).toBe("agentic-canvas");
  });
});
