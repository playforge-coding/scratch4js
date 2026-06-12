---
title: Live reload
description: How the WebSocket + HTTP bridge live-reloads saves into TurboWarp Desktop.
---

# How live reload works

The bridge is a plain WebSocket + HTTP server. The userscript connects over
WebSocket and answers JSON requests (`loadSB3` / `start` / `stop` / `screenshot`).
On `loadSB3` it fetches the bytes from `GET /get.sb3?path=…` and loads them into
the TurboWarp VM; `save_project` writes the file then sends `loadSB3`, so the
editor always shows the latest save. `screenshot` calls the renderer's
`requestSnapshot` and returns the stage as a PNG data URL.
