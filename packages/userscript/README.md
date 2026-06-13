# userscript

A single [TurboWarp Desktop](https://desktop.turbowarp.org/) **userscript** +
**userstyle** that bundles two independent features:

- **scratch-mcp live-reload** — connects to the `scratch-mcp` bridge at
  `ws://localhost:9060` and reloads/runs the project on command, so edits an
  agent makes through the MCP server appear instantly.
- **collaboration** — real-time multi-editor collaboration over a small
  WebSocket relay. One participant runs the relay; everyone else connects to it.

The source is authored as ES modules under `src/` and bundled by Rsbuild into a
single self-executing script, `dist/userscript.js` (TurboWarp Desktop only loads
one `userscript.js`, so both features ship together).

```
src/
  index.js            entry — inits both features
  util.js             shared debug() tracer
  live-reload.js      scratch-mcp live preview
  collab/
    engine.js         VM/Blockly sync engine (adapted from LiveScratch)
    transport.js      WebSocket client + session state
    ui.js             the collaboration control panel
  userstyle.css       styles for both status widgets
server/server.mjs     the collaboration relay (run by one participant)
```

## Build & install

```bash
pnpm --filter userscript deploy   # build + copy into TurboWarp Desktop's config dir
```

`deploy` runs `build` (Rsbuild → `dist/`) then `install-userscript`, which finds
the TurboWarp Desktop config directory for your OS and copies the built
`userscript.js` and `userstyle.css` in. **Fully restart TurboWarp Desktop
afterwards.**

Build and install separately if you prefer:

```bash
pnpm --filter userscript build
pnpm --filter userscript install-userscript
```

If the install script can't find your config directory, point it at one:

```bash
TWD_CONFIG_DIR=/path/to/turbowarp-desktop pnpm --filter userscript install-userscript
```

Common locations:

- **Windows:** `%APPDATA%\turbowarp-desktop`
- **macOS:** `~/Library/Containers/org.turbowarp.desktop/Data/Library/Application Support/turbowarp-desktop`
- **Linux (Flatpak):** `~/.var/app/org.turbowarp.TurboWarp/config/turbowarp-desktop`
- **Linux (native / .deb / AppImage):** `~/.config/turbowarp-desktop`

## Using collaboration

1. **One participant runs the relay** (this is the only "server"):

   ```bash
   pnpm --filter userscript serve          # listens on ws://0.0.0.0:9070
   SCRATCH_COLLAB_PORT=4000 pnpm --filter userscript serve   # custom port
   ```

2. **Everyone connects.** In TurboWarp Desktop, the **Collaboration** panel
   (bottom-right) takes a `ws://…` address:
   - The host (whoever wants to share their open project) connects to
     `ws://localhost:9070` — they become the host because they connect first.
   - Others connect to `ws://<host-LAN-IP>:9070`. They receive the host's
     project and edits sync live in both directions.

   On a LAN this just works. Across the internet the host must expose the port
   (port-forward, or a tunnel like Cloudflare Tunnel / Tailscale / ngrok) and
   share that address.

3. If the host leaves, the relay promotes the next participant to host so new
   joiners still get a project snapshot.

Set `window.__scratchCollabDebug = true` in the editor console to trace the sync
path (listener attach, messages sent/received).

## How collaboration works

The relay (`server/server.mjs`) is a dumb star hub with no Scratch knowledge:

```
client → relay:  { t:'sync', json }            edit; relay fans out to others
client → relay:  { t:'project', to, sb3 }       host's snapshot for a joiner
relay  → client: { t:'welcome'|'role'|'peers'|'peer-joined'|'project'|'sync' }
```

When a peer joins, the relay tells the host (`peer-joined`); the host saves its
current `.sb3` and sends it addressed to that peer, which the relay routes on.
Every other edit is a `sync` message fanned out to all other clients. The
VM/Blockly engine that turns editor actions into `sync` messages (and applies
incoming ones) is adapted from [LiveScratch](https://github.com/Waakul/livescratch)
by Waakul, used under the ISC license; only the transport and UI are new.

## License

This package is MPL-2.0, like the rest of the monorepo. The collaboration sync
engine is adapted from LiveScratch (Waakul), used under the ISC license — see
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) for the full notice.
