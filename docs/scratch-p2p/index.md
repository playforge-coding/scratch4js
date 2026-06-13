---
title: P2P collaboration extension
description: A Chrome/Firefox extension that adds fully peer-to-peer, real-time collaboration to the Scratch and TurboWarp editors using PeerJS (WebRTC). No backend server.
---

# `scratch-p2p`

[`scratch-p2p`](https://github.com/playforge-coding/scratch4js/tree/main/packages/scratch-p2p)
is a browser extension (Chrome **and** Firefox) that adds **real-time
collaboration** to the **Scratch** and **TurboWarp** editors. Two or more people
open the same project and edit it together — blocks, sprites, costumes and
sounds all stay in sync.

It is **fully peer-to-peer**: project data travels directly between browsers
over WebRTC, wrapped by [PeerJS](https://peerjs.com/). There is **no backend
server** — the only third party is PeerJS's public broker, used purely for the
initial signalling handshake. After that, everything flows browser-to-browser.

:::tip Inspired by LiveScratch
The VM/Blockly sync engine is adapted from
[LiveScratch](https://livescratch.waakul.com) (Waakul, MPL-2.0). The difference
is the transport: LiveScratch relays edits through a socket.io backend, whereas
`scratch-p2p` replaces that with a serverless PeerJS mesh.
:::

## How it works

```
 ┌── popup.html ──┐        chrome.runtime         ┌── content.js (isolated) ──┐
 │ host / join UI │ ───────────────────────────▶ │  bridge + injects script  │
 └────────────────┘ ◀───────────────────────────  └────────────┬──────────────┘
                                                   window.postMessage
                                                                ▼
                                        ┌── page/sync.js (MAIN world) ──────────┐
                                        │  traps window.vm + ScratchBlocks      │
                                        │  PeerJS data channel (host ⇄ guests)  │
                                        └───────────────────────────────────────┘
```

The extension runs in two JavaScript worlds and bridges them:

- **`content.js`** runs in the isolated content-script world (so it can use the
  `chrome.*`/`browser.*` APIs). It injects `page/sync.js` into the page's MAIN
  world and relays messages between the popup and the page.
- **`page/sync.js`** runs in the page itself, where it can reach `window.vm` and
  ScratchBlocks. It opens the PeerJS connection, mirrors local edits to peers,
  and applies remote edits. PeerJS is bundled into this file.

Both the Scratch and TurboWarp editors are built on `scratch-gui`, so the same
React-fiber trapping locates the VM in either one.

### Topology

A **star**: guests connect to the host, and the host relays every change to the
other guests. When someone joins, the host streams the whole `.sb3` (project
JSON **plus** all assets) over the data channel, so no shared asset server is
needed — even brand-new, never-saved projects sync correctly.

## What syncs

- Block edits — create, move, delete, change, drag between sprites
- Variables, lists and broadcasts
- Sprites — add, delete, rename, duplicate, reorder
- Costumes and sounds — add, delete, rename, duplicate, reorder, share
- Paint-editor (bitmap/SVG) costume edits — the changed bytes are sent directly
  over the channel

## Install

The extension is built with [rsbuild](https://rsbuild.rs/); PeerJS is pulled
from npm and bundled in. Build it, then load the `dist/` folder unpacked.

```bash
pnpm --filter scratch-p2p build   # one-off build  → packages/scratch-p2p/dist
pnpm --filter scratch-p2p dev     # rebuild on change (watch mode)
pnpm --filter scratch-p2p xpi     # build + package → artifacts/scratch-p2p.xpi
```

**Chrome / Edge**

1. Visit `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select `packages/scratch-p2p/dist`.

**Firefox**

1. Visit `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → pick `packages/scratch-p2p/dist/manifest.json`.

Requires Chrome 111+ / Firefox 128+.

:::warning Installing from an `.xpi`
An `.xpi` is a zip with **`manifest.json` at its root** — if you roll your own,
zip the _contents_ of `dist/`, not the `dist/` folder, or Firefox reports the
add-on as **corrupt**. The `xpi` script does this for you.

Release/stable Firefox also only installs **signed** add-ons, so an unsigned
`.xpi` won't install permanently there. Use **Load Temporary Add-on** (above),
or **Developer Edition / Nightly / ESR** with `xpinstall.signatures.required`
set to `false`, or sign it via
[addons.mozilla.org](https://addons.mozilla.org/developers/).
:::

## Use

1. Open a project in the [Scratch](https://scratch.mit.edu/projects/editor/) or
   [TurboWarp](https://turbowarp.org) editor.
2. Click the extension icon → **Host a session**, and copy the room code.
3. Send the room code to a collaborator. They open the editor, click the icon,
   paste the code → **Join**. The host's project loads for them and editing is
   now live for everyone.

## Limitations

- The PeerJS public broker is used only for signalling. For peers behind strict
  NATs a TURN server may be needed (none is configured by default).
- Initial sync transfers the full `.sb3`, so very large projects take a moment
  to load for a joining peer.
- Not published to any extension store — it is for local/unpacked use only.

## License

MPL-2.0. Bundles [PeerJS](https://github.com/peers/peerjs) (MIT) from npm at
build time.
