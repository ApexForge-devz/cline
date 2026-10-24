# Contributing to the Cline SDK

This document covers onboarding, development workflow, and publishing. For package boundaries and change routing during development, see [AGENTS.md](./AGENTS.md). For architecture and runtime flows, see [ARCHITECTURE.md](./ARCHITECTURE.md).

This repo is a WIP framework for building and orchestrating AI agents. Full refactors are acceptable when they improve the architecture and all call sites are updated.

## Workspace Overview

### Published SDK Packages

| Package | Owns |
|---------|------|
| `@cline/shared` | Contracts, schemas, path helpers, hook engine, extension registry |
| `@cline/llms` | Provider settings, model catalogs, manifests, handler creation |
| `@cline/agents` | Stateless agent loop, tool orchestration, hook/extension runtime |
| `@cline/core` | Stateful orchestration, session lifecycle, storage, config, telemetry, hub runtime services, hub discovery, detached daemon, and hub client adapters (`@cline/core/hub`, `@cline/core/hub/daemon-entry`) |

### Apps

- `apps/cli`: CLI host and local hub management
- `apps/examples/desktop-app`: Tauri + Next.js desktop app example
- `apps/examples/vscode`: VS Code extension example
- `apps/examples/menubar`: hub notification menubar example
- `examples`: plugin, hook, and cron automation examples (customizations upon Cline SDK)

## Development Workflow

### Essential Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun run build` | Build SDK and CLI |
| `bun run build:sdk` | Build SDK packages only |
| `bun run dev` | Build in development mode |
| `bun run cli` | Run CLI interactively |
| `bun run test` | Run the Vitest suite |
| `bun run types` | Typecheck all packages |
| `bun run lint` / `format` / `fix` | Code quality and formatting |

Package-scoped commands:

```sh
bun -F @cline/core build|test|typecheck
bun -F @cline/agents build|test|typecheck
```

### Rebuilding

Changes to published SDK packages require `bun run build:sdk`. Direct CLI runs pick up rebuilt packages immediately. Use `dev:*` scripts for automatic rebuilding during development.

The CLI build (`bun -F @cline/cli build`) bundles packages from their compiled `dist/`, not their TypeScript source. If you edit a package and then build the CLI without rebuilding the package first, the CLI binary will silently include the old package code. Always run `bun run build:sdk` (or the relevant `bun -F @cline/<pkg> build`) before building the CLI when testing changes end-to-end.

Hub-backed hosts use shared workspace discovery and owned daemon startup logic. If you touch hub bootstrap, preserve the startup lock and owner-scoped discovery behavior so multiple builds can coexist safely.

### Debug Builds

- Set `CLINE_BUILD_ENV=development` for debug builds. Spawned Node/Bun subprocesses get an inspector endpoint plus `--enable-source-maps`.
- By default, child-process inspector ports are ephemeral (`--inspect=127.0.0.1:0`) to avoid collisions across parallel dev runs.
- Set `CLINE_DEBUG_HOST` and `CLINE_DEBUG_PORT_BASE` to opt into deterministic role-based ports. With `CLINE_DEBUG_PORT_BASE=9230`, the roles map to hub `9230`, hook worker `9231`, plugin sandbox `9232`, connector child `9233`, fallback sandbox `9234`.
- Fallback chain: `CLINE_BUILD_ENV` → `NODE_ENV` → Bun `--conditions=development`.
- To debug the CLI process itself: `cd apps/cli && CLINE_BUILD_ENV=development bun --conditions=development --inspect-brk=6499 ./src/index.ts "hey"`.
- The workspace includes a VS Code launch config (`Launch CLI Debugger`) that uses `"type": "bun"` (requires `oven.bun-vscode`).

### Testing

Root commands for cross-package confidence:

```sh
bun run test        # all tests
bun run types       # typecheck all packages
bun run check       # lint + build + typecheck + check-publish
```

If you touch hub/bootstrap/session flows, prefer both unit coverage and an end-to-end sanity check.

## Publishing

### SDK Release

The `bun release sdk` script automates the SDK publish flow: versioning, lockfile regeneration, verification, and publishing.

```sh
bun release sdk              # auto-increment patch version
bun release sdk 0.1.0        # explicit version
bun release sdk --tag next   # publish with a custom npm dist-tag
bun release sdk --dry-run    # preview without side effects
```

Additional SDK flags: `--skip-tests`, `--skip-git-tags`.

**Fork publishing safeguard:** the SDK manifests still use the upstream-owned `@cline/*` package namespace. Non-dry-run releases are blocked unless `CLINE_ALLOW_UPSTREAM_PACKAGE_PUBLISH=1` is explicitly set. Do not set this override to publish an independent fork release. Rename the fork's package namespace and dependencies, then adapt and verify the release flow first. The CLI and platform packages are similarly guarded.

The script stays on the current named branch and does not check out `main`, fetch, or pull. If the working tree is dirty it aborts.

The SDK flow runs: tests → version bump → lockfile regeneration → tarball verification → publish (shared → llms → agents → core) → optional `sdk-v{VERSION}` tag creation.

### CLI Release

The CLI manifest is still named `@cline/cli`, and the release scripts still target `cline` and `@cline/*` npm names. Publishing is blocked by default with the same `CLINE_ALLOW_UPSTREAM_PACKAGE_PUBLISH=1` guard.

The local release helper validates the `cli-vX.Y.Z` tag against `HEAD` and the remote named `origin`; it does not check out another branch or pull. Do not assume that `origin` is the intended fork remote without checking its URL.

There is no `cli-publish.yml` or `sdk-publish.yml` workflow in this fork's current `.github/workflows/` directory. Do not follow upstream GitHub Actions release commands from older documentation.

Until the fork's npm package identities are renamed and all release paths are verified, limit release work to dry runs and local package validation. Lifecycle hooks cannot prevent a user from manually publishing an already-created tarball through an unrelated command, so do not publish prebuilt tarballs directly.

### Manual SDK Package Validation

For local verification without publishing:

1. From `sdk/`, run `bun run test` and `bun run types`.
2. Run `bun scripts/check-publish.ts` to pack tarballs and verify dependency alignment, isolated installation, and module resolution.
3. Inspect a packed manifest with `bun pm pack --destination <temporary-directory>` and `tar -xOf <package.tgz> package/package.json`.

The package lifecycle guard blocks publishing under the current upstream `@cline/*` identities by default. Do not set `CLINE_ALLOW_UPSTREAM_PACKAGE_PUBLISH=1` merely to get around the guard; that override is only for an intentionally authorized upstream-namespace publication. Directly publishing a pre-created tarball can bypass lifecycle scripts, so do not publish tarballs until the fork has its own package namespace and release checks.

### Workspace Dependency Rules

- Source manifests use `workspace:*` so `bun install` and local builds resolve correctly.
- Published runtime workspace packages stay in `dependencies`. Bundled internals go in `devDependencies` so they don't leak into packed manifests.
- `bun publish` resolves `workspace:*` to concrete versions when packing.

### Verifying a Single Package

Inspect the exact manifest that will be published:

```sh
cd ./packages/core
tmpdir=$(mktemp -d)
bun pm pack --destination "$tmpdir" >/dev/null
tar -xOf "$tmpdir"/*.tgz package/package.json | jq '.version, .dependencies'
```

Check installed versions in a consuming project:

```sh
bun pm ls @cline/core @cline/agents @cline/llms
```

### CI

The CI publish workflow (`.github/workflows/sdk-publish.yml`) follows the same order: build → version → check-publish → publish (shared → llms → agents → core). It supports `nightly` and `latest` channels and is triggered by manual dispatch or a daily cron.

### Root Automation Scope

Root scripts are intentionally narrower than the full workspace:

- Root SDK build/test/version/publish flows target the publishable SDK packages only.
- Internal packages can still be built/tested directly, but should not be swept into release automation by accident.
- If you add a new internal package, keep it out of root publish/version/build sweeps unless you explicitly intend to publish it.
