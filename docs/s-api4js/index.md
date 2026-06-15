---
title: The Scratch API wrapper
description: Read public Scratch data and log in to edit projects online with s-api4js, a small class-based wrapper.
---

# The Scratch API wrapper (`s-api4js`)

[`s-api4js`](https://github.com/playforge-coding/scratch4js/tree/main/packages/s-api4js)
is a small, **class-based** wrapper for the
[Scratch API](https://en.scratch-wiki.info/wiki/Scratch_API). Read public data —
users, projects, studios, search — with no login, or log in to **edit a
project's `.sb3` online**: download it, change it, and save it back to
scratch.mit.edu.

Cookies live in a [`tough-cookie`](https://github.com/salesforce/tough-cookie)
jar, just like a browser, so the CSRF / session handshake is handled for you.
It's plain JavaScript with JSDoc types and runs on Node 18+.

```
   new ScratchSession()                    ScratchSession.login(user, pass)
            │                                          │
            ▼                                          ▼
   ┌──────────────────┐                     ┌────────────────────────┐
   │  public reads    │                     │  authenticated writes  │
   │  users·projects  │                     │  download · save       │
   │  studios·search  │                     │  share · metadata      │
   └──────────────────┘                     └────────────────────────┘
                  \                          /
                   ▼ cookie jar (tough-cookie) ▼
                       api / projects / assets
                          .scratch.mit.edu
```

## Why it pairs with scratch4js

[`scratch4js`](/api/overview) edits an `.sb3` in memory; `s-api4js` moves it to
and from the website. Together they round-trip:

```js
import { ScratchSession } from 's-api4js';
import { Project } from 'scratch4js';

const session = await ScratchSession.login('username', 'password');

// 1. Download the live project as an editable scratch4js Project.
const { json, assets } = await session.projects.download(123456789);
const project = new Project(json, assets);

// 2. Edit it in memory.
project.stage.setVariable('score', 0);

// 3. Save it back to scratch.mit.edu (uploads assets + writes project.json).
await session.projects.save(123456789, project);
```

## In this section

- **[Getting started](/s-api4js/getting-started)** — install and make your first
  calls.
- **[Public data](/s-api4js/public-data)** — users, projects, studios and search,
  no login required.
- **[Authentication](/s-api4js/authentication)** — how login works, the cookie
  jar, and custom `fetch`.
- **[Editing projects](/s-api4js/editing-projects)** — download, save and publish
  a project's `.sb3`.
- **[Cloud variables & requests](/s-api4js/cloud)** — set and read `☁` variables
  over WebSocket, and run a scratchattach-compatible cloud-requests server.
- **[Reference](/s-api4js/reference)** — every class, method and endpoint.

::: tip Drive it from an AI agent
The [`scratch-mcp` server](/mcp-server/online-projects) builds on `s-api4js` to
let an AI agent open, edit and publish online projects through MCP tools — always
asking you to confirm before it touches the live project.
:::

## Scope

**Public data**, **login + project editing** and **cloud variables / requests**
are implemented today; more endpoints will follow. The package targets Node —
browser use is limited by CORS, since the login and asset hosts don't send
permissive cross-origin headers.
