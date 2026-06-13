# Release Guide

Agentic Canvas is published to npm as `@trohde/agentic-canvas`. The executable remains `agentic-canvas`.

## Before First Publish

1. Create the public GitHub repository at `https://github.com/ThomasRohde/agentic-canvas`.
2. Configure npm trusted publishing for package `@trohde/agentic-canvas` and the GitHub Actions publish workflow in this repository.
3. Re-check package availability:

```bash
npm view @trohde/agentic-canvas
```

An npm `E404` response means the package name is still available.

## Versioning

Use Semantic Versioning. The version scripts update `package.json` and `package-lock.json` only; they do not commit, tag, or push.

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

## Local Release Checks

Run the full local release dry run before tagging:

```bash
npm run release:dry-run
```

This runs typecheck, lint, tests, build, package smoke, production dependency audit, and an npm publish dry run.

## Publishing

1. Run the appropriate version script.
2. Commit the version and changelog changes.
3. Create and push a Git tag such as `v0.1.0`.
4. Create a GitHub release for the tag.
5. The publish workflow publishes to npm with provenance when trusted publishing is configured.

Manual fallback:

```bash
npm ci
npm run release:dry-run
npm publish --access public --provenance
```

Do not publish from an unverified working tree.
