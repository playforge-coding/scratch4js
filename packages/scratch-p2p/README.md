# scratch-p2p

A browser extension (Chrome **and** Firefox) that adds real-time,
**fully peer-to-peer** collaboration to the **Scratch** and **TurboWarp**
editors. Two or more people can edit the same project together — blocks,
sprites, costumes and sounds stay in sync — with **no backend server**: project
data travels directly between browsers over WebRTC, wrapped by
[PeerJS](https://peerjs.com/). The only third party involved is PeerJS's public
broker, used purely for the initial signalling handshake.

> Heavily inspired by [LiveScratch](https://livescratch.waakul.com) (Waakul,
> MPL-2.0). The VM/Blockly sync engine is adapted from it; the socket.io +
> backend transport has been replaced with a serverless PeerJS mesh.

## How it works

```
 ┌── popup.html ──┐        chrome.runtime         ┌── content.js (isolated) ──┐
 │ host / join UI │ ───────────────────────────▶ │  bridge + injects scripts │
 └────────────────┘ ◀───────────────────────────  └────────────┬──────────────┘
                                                   window.postMessage
                                                                ▼
                                        ┌── page/sync.js (MAIN world) ──────────┐
                                        │  traps window.vm + ScratchBlocks      │
                                        │  PeerJS data channel (host ⇄ guests)  │
                                        └───────────────────────────────────────┘
```

- **`content.js`** runs in the isolated content-script world. It injects
  `page/sync.js` (which has PeerJS bundled in) into the page's MAIN world and
  relays messages between the popup and the page.
- **`page/sync.js`** runs in the page, where it can reach `window.vm` and
  Blockly. It opens the PeerJS connection, mirrors local edits to peers, and
  applies remote edits.
- Topology is a **star**: guests connect to the host and the host relays each
  change to the other guests. When someone joins, the host streams the whole
  `.sb3` (project JSON **plus** all assets) over the data channel, so no shared
  asset server is needed.

## Build

PeerJS is pulled from npm and bundled by rsbuild; the loadable extension is
emitted to `dist/`.

```bash
pnpm --filter scratch-p2p build   # one-off build  → dist/
pnpm --filter scratch-p2p dev     # rebuild on change (watch mode)
pnpm --filter scratch-p2p xpi     # build + package → artifacts/scratch-p2p.xpi
```

## Install (unpacked)

Build first (see above), then load `packages/scratch-p2p/dist`.

**Chrome / Edge**

1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `packages/scratch-p2p/dist`.

**Firefox**

1. Go to `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → pick `packages/scratch-p2p/dist/manifest.json`.

Requires Chrome 111+ / Firefox 128+.

### Installing from an `.xpi`

`pnpm --filter scratch-p2p xpi` produces `artifacts/scratch-p2p.xpi`. An `.xpi`
is just a zip with **`manifest.json` at its root** — if you make your own, zip
the _contents_ of `dist/`, not the `dist/` folder (a nested
`dist/manifest.json` is what makes Firefox say the add-on is **corrupt**).

Note that **release/stable Firefox only installs _signed_ add-ons**, so an
unsigned `.xpi` won't install permanently there. Your options:

- **Easiest (dev):** skip the `.xpi` and use **Load Temporary Add-on** above.
- Use **Firefox Developer Edition / Nightly / ESR** and set
  `xpinstall.signatures.required` to `false` in `about:config`, then open the
  `.xpi`.
- **Sign it** via [addons.mozilla.org](https://addons.mozilla.org/developers/)
  for a distributable signed `.xpi`.

## Use

1. Open a project in <https://scratch.mit.edu/projects/…/editor> or on
   <https://turbowarp.org>.
2. Click the extension icon → **Host a session**. Copy the room code.
3. Send the room code to a collaborator. They open the (same or any) editor,
   click the icon, paste the code → **Join**. The host's project loads for them
   and editing is now live.

## Limitations

- The PeerJS public broker is used only for signalling. For peers behind strict
  NATs a TURN server may be needed (none is configured by default).
- Initial sync transfers the full `.sb3`; very large projects take a moment.
- Live paint-editor (bitmap/SVG) edits sync the changed costume's bytes
  directly over the channel.
- Not published to any extension store — local/unpacked use only.

## License

MPL-2.0. Bundles [PeerJS](https://github.com/peers/peerjs) (MIT) from npm at
build time.
