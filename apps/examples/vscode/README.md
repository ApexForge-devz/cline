# `apps/examples/vscode` (`@cline/vscode`)

VS Code extension that opens a chat webview and runs Cline sessions over the RPC runtime.

## What it does

- Opens a webview panel via `Cline: Open Chat in Editor`.
- Discovers or starts a compatible owner-scoped RPC hub through the local SDK runtime.
- Starts/sends/aborts chat turns using RPC runtime methods (`StartRuntimeSession`, `SendRuntimeSession`, `AbortRuntimeSession`).
- Streams runtime events into the webview for incremental assistant output.

## Requirements

- No globally installed `cline` CLI is required; the extension uses the repository's `@cline/core` runtime.
- A provider/model should be configured in Cline provider settings.

## Development

```bash
# Build extension bundle
bun -F @cline/vscode build

# Typecheck
bun -F @cline/vscode typecheck
```

To run locally in VS Code:

1. Build the extension: `bun -F @cline/vscode build`.
2. Open `apps/examples/vscode` in VS Code.
3. Press `F5` to launch the Extension Development Host.
4. Run command `Cline: Open Chat in Editor`.
