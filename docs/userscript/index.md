---
title: TurboWarp Desktop userscript
description: A TurboWarp Desktop userscript that adds scratch-mcp live-reload and real-time, multi-editor collaboration over a small WebSocket relay. ES-module source bundled to a single IIFE.
---

# `userscript`

[`userscript`](https://github.com/playforge-coding/scratch4js/tree/main/packages/userscript)
is a single [TurboWarp Desktop](https://desktop.turbowarp.org/) **userscript** +
**userstyle** that bundles two independent features:

- **scratch-mcp live-reload** — reloads/runs the project on command from the
  [`scratch-mcp`](/mcp-server/) bridge, so edits an agent makes appear instantly.
- **collaboration** — **real-time, multi-editor collaboration**. Two or more
  people open the same project and edit it together; blocks, sprites, costumes
  and sounds all stay in sync.

The source is authored as ES modules and bundled by [Rsbuild](https://rsbuild.rs/)
into one self-executing script — TurboWarp Desktop only loads a single
`userscript.js`, so both features ship together.

:::tip Inspired by LiveScratch
The VM/Blockly sync engine is adapted from
[LiveScratch](https://github.com/Waakul/livescratch) by Waakul, used under the
**ISC** license. The difference is the transport: LiveScratch relays edits
through a socket.io backend, whereas this userscript uses a tiny WebSocket relay
that one participant runs.
:::

## How collaboration works

Unlike a browser extension, a TurboWarp Desktop userscript runs in the editor
page and can only act as a WebSocket **client** — it can't open a listening
socket. So collaboration uses a **star topology** around a small relay that one
participant runs:

```
   TurboWarp Desktop (host)         TurboWarp Desktop (guest)
   ┌────────────────────┐           ┌────────────────────┐
   │ userscript (client)│           │ userscript (client)│
   └─────────┬──────────┘           └─────────┬──────────┘
             │  ws://…:9070                    │
             └───────────────┬─────────────────┘
                             ▼
                   ┌───────────────────┐
                   │   relay server    │   server/server.mjs (one participant)
                   │  (dumb star hub)  │
                   └───────────────────┘
```

- The **first client to connect becomes the host**; its open project is the
  shared source of truth.
- When another client joins, the relay tells the host, which saves its current
  `.sb3` (project JSON **plus** all assets) and sends it addressed to that peer —
  so even brand-new, never-saved projects sync correctly.
- Every edit is a `sync` message the relay fans out to all other clients.
- If the host leaves, the relay promotes the next participant to host so new
  joiners still get a project snapshot.

The relay knows nothing about Scratch; it only routes messages:

```
client → relay:  { t:'sync', json }            edit; relay fans out to others
client → relay:  { t:'project', to, sb3 }       host's snapshot for a joiner
relay  → client: { t:'welcome' | 'role' | 'peers' | 'peer-joined' | 'project' | 'sync' }
```

## What syncs

- Block edits — create, move, delete, change, drag between sprites
- Variables, lists and broadcasts
- Sprites — add, delete, rename, duplicate, reorder
- Costumes and sounds — add, delete, rename, duplicate, reorder, share
- Paint-editor (bitmap/SVG) costume edits — the changed bytes are sent directly

## Install

The userscript is authored as ES modules under `src/` and bundled by Rsbuild
into a single `dist/userscript.js`. Build it and copy it into TurboWarp
Desktop's config directory:

```bash
pnpm --filter userscript deploy   # build + copy into the config dir, then restart TWD
```

`deploy` runs `build` then `install-userscript` (which detects the config
directory for your OS — Windows, macOS, Linux native & Flatpak). Build and
install separately if you prefer:

```bash
pnpm --filter userscript build
pnpm --filter userscript install-userscript
```

If the installer can't find your config directory, point it at one:

```bash
TWD_CONFIG_DIR=/path/to/turbowarp-desktop pnpm --filter userscript install-userscript
```

**Fully restart TurboWarp Desktop** afterwards so it reloads the userscript.

## Use

1. **One participant runs the relay** (the only "server"):

   ```bash
   pnpm --filter userscript serve          # listens on ws://0.0.0.0:9070
   SCRATCH_COLLAB_PORT=4000 pnpm --filter userscript serve   # custom port
   ```

2. **Everyone connects.** In TurboWarp Desktop, the **Collaboration** panel
   (bottom-right) takes a `ws://…` address:
   - The host connects to `ws://localhost:9070` — they become host by
     connecting first, and their open project is shared.
   - Others connect to `ws://<host-LAN-IP>:9070`, receive the host's project,
     and edit live in both directions.

On a LAN this just works. Across the internet the host must expose the port
(port-forward, or a tunnel like Cloudflare Tunnel / Tailscale / ngrok) and share
that address.

Set `window.__scratchCollabDebug = true` in the editor console to trace the sync
path (listener attach, messages sent/received).

## Limitations

- Collaboration needs one participant to run the relay and be reachable by the
  others (trivial on a LAN; a tunnel otherwise).
- Initial sync transfers the full `.sb3`, so very large projects take a moment
  to load for a joining peer.
- TurboWarp Desktop loads exactly one `userscript.js`; both features here ship
  in that one file.

## License

MPL-2.0, like the rest of this monorepo. The VM/Blockly sync engine is adapted
(with small modifications) from [LiveScratch](https://github.com/Waakul/livescratch)
by Waakul, used under the **ISC** license — its full notice is retained in
`THIRD-PARTY-NOTICES.md` in the package. LiveScratch in turn includes code by
Micah Powch from [BlockLive](https://github.com/BlockliveScratch/BlockLive).
