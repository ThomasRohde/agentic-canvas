import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  clean: false,
  dts: false,
  external: ["@modelcontextprotocol/sdk", "express", "open", "ws", "zod"],
});
