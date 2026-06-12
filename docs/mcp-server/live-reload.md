---
title: Live reload
description: How the WebSocket + HTTP bridge live-reloads saves into TurboWarp Desktop.
---

# How live reload works

The bridge is a plain WebSocket + HTTP server. The userscript connects over
WebSocket and answers JSON requests (`loadSB3` / `start` / `stop` / `screenshot`).
On `loadSB3` it fetches the bytes from `GET /get.sb3?path=…` and loads them into
the TurboWarp VM; `save_project` writes the file then sends `loadSB3`, so the
editor always shows the latest save. For a snapshot the userscript calls the
renderer's `requestSnapshot` and returns a PNG data URL; the server then serves
that as a compressed JPEG (`screenshot`, via [sharp](https://sharp.pixelplumbing.com))
or passes the lossless PNG through unchanged (`screenshot_pixelperfect`).
