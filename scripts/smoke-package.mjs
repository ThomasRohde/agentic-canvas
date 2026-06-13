import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

function run(args, cwd) {
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(npmCommand, commandArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";

  if (result.error || result.status !== 0) {
    throw new Error(
      [`Command failed: npm ${args.join(" ")}`, result.error?.message ?? "", stdout, stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return stdout;
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentic-canvas-package-"));

try {
  const packOutput = run(
    ["pack", "--pack-destination", tempRoot, "--ignore-scripts", "--json"],
    root,
  );
  const [packed] = JSON.parse(packOutput);
  if (!packed?.filename) {
    throw new Error(`npm pack did not report a filename: ${packOutput}`);
  }

  const consumer = path.join(tempRoot, "consumer");
  await mkdir(consumer);
  await writeFile(path.join(consumer, "package.json"), '{"type":"module"}\n', "utf8");

  const tarball = path.join(tempRoot, packed.filename);
  run(["install", "--no-audit", "--no-fund", tarball], consumer);

  const version = run(["exec", "--", "agentic-canvas", "--version"], consumer);
  if (version !== packageJson.version) {
    throw new Error(`Expected CLI version ${packageJson.version}, got ${version}`);
  }

  const help = run(["exec", "--", "agentic-canvas", "--help"], consumer);
  for (const expected of [packageJson.name, "agentic-canvas", "--canvas <name>"]) {
    if (!help.includes(expected)) {
      throw new Error(`CLI help did not include expected text: ${expected}`);
    }
  }

  console.log(`Package smoke passed for ${packageJson.name}@${packageJson.version}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
