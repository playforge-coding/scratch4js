# TurboWarp Desktop live-reload userscript

This folder holds a [TurboWarp Desktop](https://desktop.turbowarp.org/)
**userscript** + **userstyle** that turn the editor into a live preview for the
`scratch-mcp` server:

- `userscript.js` — connects to the bridge at `ws://localhost:9060` and, on
  command, (re)loads an `.sb3` straight into the running VM.
- `userstyle.css` — a small status badge showing the connection state.

Both are plain, dependency-free source (native `WebSocket` + `fetch`, no build
step) — edit them directly.

When the `scratch-mcp` server saves a project, it tells this userscript to
reload it — so edits an agent makes show up in TurboWarp instantly, no manual
re-import.

## Install

TurboWarp Desktop automatically loads a file named `userscript.js` and a file
named `userstyle.css` from its config directory. Copy both files from this
folder there, then fully restart TurboWarp Desktop.

**Windows** (`%APPDATA%\turbowarp-desktop`):

```bash
cp userscript.js userstyle.css "/mnt/c/Users/$USER/AppData/Roaming/turbowarp-desktop/"
```

**macOS:**

```bash
cp userscript.js userstyle.css \
  "$HOME/Library/Containers/org.turbowarp.desktop/Data/Library/Application Support/turbowarp-desktop/"
```

**Linux** (Flatpak):

```bash
cp userscript.js userstyle.css \
  "$HOME/.var/app/org.turbowarp.TurboWarp/config/turbowarp-desktop/"
```

> The directory must already exist (it does after TurboWarp Desktop has run at
> least once). Restart the app after copying.

## Using it

1. Start the `scratch-mcp` server (see `../packages/scratch-mcp`). It hosts the
   bridge on `http://localhost:9060`.
2. Launch TurboWarp Desktop. The userscript connects automatically; the toolbar
   shows the connection status.
3. Edit a project through the MCP tools and call `save_project` — TurboWarp
   reloads the new `.sb3` live. `run_project` / `stop_project` drive the green
   flag.

To change the port, set `SCRATCH_MCP_BRIDGE_PORT` for the server (the userscript
expects `9060`; rebuild it from source if you need a different one).

## How it works

The userscript opens a WebSocket to the bridge and answers JSON requests:

```
bridge → us:  { id, method: "loadSB3" | "start" | "stop" | "screenshot", params? }
us → bridge:  { id, ok: true, result? } | { id, ok: false, error }
```

On `loadSB3` it fetches the bytes from `GET /get.sb3?path=…` and calls
`vm.loadProject(...)`; `start`/`stop` call `vm.greenFlag()` / `vm.stopAll()`;
`screenshot` calls the renderer's `requestSnapshot` and returns the stage as a
PNG data URL. It reconnects automatically if the server restarts.
