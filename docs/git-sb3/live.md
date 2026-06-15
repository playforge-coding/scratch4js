---
title: Live diffs
description: Serve a visual diff that refreshes as you edit — on file save, or in real time from the TurboWarp userscript over WebSockets.
---

# Live diffs

`git sb3 watch` serves the [visual diff](/git-sb3/visual-diff) as a live page.
Leave it open in a browser while you work and it re-renders whenever the project
changes — no manual refresh. Two things drive an update:

- **File save** — an `fs.watch` on the working `.sb3`. Any tool that writes the
  file (the Scratch editor's _Save_, [`scratch4js`](/api/overview), a script)
  refreshes the page.
- **Userscript push** — the [TurboWarp Desktop userscript](/userscript/) streams
  the live project to the watch server as you edit, so the diff updates in real
  time, before anything touches disk.

```
  TurboWarp Desktop + userscript            file save / scratch4js / editor
        │  project changed                          │  writes game.sb3
        ▼  vm.saveProjectSb3() bytes                ▼
        └──────────► git sb3 watch (ws://localhost:9061) ◄──── fs.watch
                              │  re-diff vs baseline, render scratchblocks
                              ▼  push updated body over WebSocket
                       browser report page  ──►  swaps in, no reload
```

## Start it

```bash
git sb3 watch game.sb3
# Live diff: http://localhost:9061/
```

Open the URL and keep the tab visible. A badge in the top-right shows the live
connection state (`● live` when connected). The baseline (old) side is fixed for
the session — by default `HEAD` — and the new side tracks your edits. See the
[`watch` command](/git-sb3/commands#watch) for the argument forms and options.

## Real-time from the editor

For live updates _as you edit_ (not just on save), run the
[userscript](/userscript/) in TurboWarp Desktop. It connects to the watch server
on `ws://localhost:9061` and, on every change to the project
(`PROJECT_CHANGED`, debounced), serializes the project with
`vm.saveProjectSb3()` and sends the bytes. The watch server diffs them against
the baseline and pushes the re-rendered report to every open page.

This reuses the same userscript that powers
[scratch-mcp live reload](/mcp-server/live-reload) — the two features run side by
side on different ports (`9060` for live reload, `9061` for the diff). Nothing to
configure; if no watch server is running, the userscript's connection just
retries quietly.

::: tip Typical loop

1. `git sb3 watch game.sb3` in a terminal, open `http://localhost:9061/`.
2. Edit the project in TurboWarp Desktop with the userscript loaded.
3. Watch the diff against `HEAD` update block-by-block as you build — a live
   view of exactly what your next commit will change.
   :::

## How the page updates

The page only swaps the report **body** (`#g4-report`) when an update arrives;
the scratchblocks stylesheet stays in `<head>`, so updates are cheap and the
scroll position is preserved. The injected client reconnects automatically if
the watch server restarts.

The protocol is deliberately small — the server sends
`{ type: "init" | "update", html }` to pages, and the userscript sends one
binary `.sb3` frame per change. No state is kept on the client.
