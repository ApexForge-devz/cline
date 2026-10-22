---
name: build-desktop
description: Build and package this fork's desktop app locally on the current OS. Use when asked to compile, package, or test a local desktop build without publishing a release or enabling auto-updates.
---

# Build the Desktop App Locally

This fork intentionally disables Tauri auto-updates. Do not publish a release feed, change updater endpoints, or configure the app to poll the original Cline repository as part of a local build.

## Build

Run commands from the repository root unless noted otherwise.

1. Install workspace dependencies if they are not already installed:

   ```powershell
   bun install
   ```

2. Change to the desktop app directory:

   ```powershell
   cd apps/examples/desktop-app
   ```

3. Package for the current OS:

   ```powershell
   bun run package:desktop
   ```

   Or choose the current host OS explicitly:

   - Windows: `bun run package:desktop:windows`
   - macOS: `bun run package:desktop:mac`
   - Linux: `bun run package:desktop:linux`

   Native bundles must be built on their target OS. Run the package command separately on each OS you intend to distribute.

4. Find the resulting package(s) under `apps/examples/desktop-app/dist/desktop/`.

## Useful checks

- TypeScript: `bun run typecheck`
- Production webview build: `bun run build:web`
- Desktop updater status: verify that `src-tauri/tauri.conf.json` and any selected overlay keep `plugins.updater.endpoints` empty.
- Do not restore upstream feed URLs or add updater endpoints unless the user explicitly asks to design a separate, fork-owned update mechanism.

The normal package command builds the app for local installation; it does not publish GitHub releases. Signing and notarization credentials may be required for distributable macOS packages.
