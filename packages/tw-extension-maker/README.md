# tw-extension-maker

An in-browser IDE for building [TurboWarp](https://turbowarp.org) / Scratch
extensions — a self-hostable, reusable alternative to spinning up a StackBlitz
each time. Edit a real multi-file project in **Monaco**, bundle it with
**Rsbuild + [`tw-plugin-webpack`](https://www.npmjs.com/package/tw-plugin-webpack)**
inside a **WebContainer**, then open it straight in TurboWarp to try it — all
client-side, no backend.

It scaffolds and builds the _exact_ project that
[`create-tw-extension`](../create-tw-extension) generates (Rsbuild bundler), so
what you prototype here matches what you'd get on disk from the CLI.

## How it works

```
┌── host app (this package) ────────────────────────────────────────────┐
│  Rsbuild + React + Tailwind v4 + Radix UI + a custom split-pane layout │
│                                                                        │
│   Monaco editor ──edits──▶ WebContainer (in-browser Node)              │
│                              ├─ npm install                            │
│                              ├─ rsbuild build  (Rspack wasm binding)   │
│                              │    + tw-plugin-webpack → single file    │
│                              └─ dist/<id>.js ──┐                       │
│                                                ▼                       │
│   "Open in TurboWarp" tab ◀── data: URL of the built extension        │
└────────────────────────────────────────────────────────────────────────┘
```

The WebContainer runs a genuine Rsbuild build. Rspack ships a
`wasm32-wasip1-threads` binding (since Rspack 1.4) that NAPI-RS loads inside
WebContainers, so the same `rsbuild build` you'd run locally runs in the browser.

## Trying the extension

The **Open in TurboWarp** button opens the real editor in a new tab at
`turbowarp.org/editor?extension=data:text/javascript;base64,…`, with your freshly
built extension inlined in the URL — TurboWarp auto-loads it (no upload, no
confirmation prompt) and your blocks appear in the palette. A `data:` URL is used
because TurboWarp **refuses to be embedded in an iframe** as an editor, and a
self-contained URL needs no server or cross-origin fetch. Rebuild and click again
to pick up changes.

## Develop

```sh
pnpm --filter tw-extension-maker dev
```

Open the printed URL. The dev server sends the COOP/COEP headers WebContainers
need; the first boot installs dependencies inside the container (takes a minute),
then it builds automatically. Toggle **Auto-build on save** off to build manually
with the **Build** button, then hit **Open in TurboWarp** to try it.

The **Terminal** panel is a real interactive shell inside the WebContainer
(xterm.js ↔ `jsh`) — it streams the install/build output with full ANSI, and you
can run your own commands there (`ls`, `cat`, `node`, `npm …`). The Build button
runs `npm run build` as its own process so the result can be read back out, but
you can also just run it yourself in the terminal.

## Build & deploy (GitHub Pages)

```sh
PUBLIC_PATH=/<repo>/ pnpm --filter tw-extension-maker build
```

`PUBLIC_PATH` is the subpath your Pages site is served from (e.g. `/scratch4js/`);
omit it for a user/apex page served at `/`.

Static hosts like GitHub Pages can't set response headers, so the build ships a
[`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) shim
(`public/coi-serviceworker.js`, registered first in `index.html`). It re-serves
the page with COOP/COEP on the client and reloads once, giving
`crossOriginIsolated === true` — required for both WebContainers and Monaco's
workers. On Cloudflare Pages / Netlify / Vercel you can instead set the headers
directly and delete the shim.

### Cross-origin isolation details

The app uses COEP **`credentialless`** (rather than `require-corp`); WebContainers
support it and it keeps cross-origin subresource handling lenient. WebContainers
run best in Chromium-based browsers.

## What's inside

| Area               | Implementation                                                        |
| ------------------ | --------------------------------------------------------------------- |
| Build tool (host)  | Rsbuild + `@rsbuild/plugin-react`                                     |
| Styling            | Tailwind CSS v4 (`@theme` tokens, PostCSS plugin)                     |
| Primitives         | Radix UI (`radix-ui`): Tooltip, Dialog, Switch                        |
| Editor             | Monaco (`@monaco-editor/react`) with locally-bundled workers          |
| Terminal           | xterm.js bound to an interactive WebContainer `jsh` shell             |
| In-browser bundler | `@webcontainer/api` running Rsbuild + `tw-plugin-webpack`             |
| Layout             | Custom resizable split-pane system (`src/layout/`) — no panel library |
| Try it             | Opens `turbowarp.org/editor?extension=<data-url>` in a new tab        |

## Loading the result into TurboWarp manually

Besides **Open in TurboWarp**, you can **Copy** or **Download** the source from
the toolbar, then in the TurboWarp editor: **Add Extension → Custom Extension →
Files/Text**, and provide `<id>.js`.

## License

MPL-2.0
