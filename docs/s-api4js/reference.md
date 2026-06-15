---
title: Reference
description: Every s-api4js class, method and Scratch API endpoint in one place.
---

# Reference

The package exports `ScratchSession`, the resource classes (`Users`, `Projects`,
`Studios`, `Search`), the cloud classes (`Cloud`, `CloudRequests`,
`CloudEvents`, `CloudStorage`), the database adapters (`MemoryDatabase`,
`JsonDatabase`, `SqlDatabase`), the `Encoding` helpers (`encode`, `decode`) and
`ScratchAPIError`. In normal use you only construct a `ScratchSession` —
everything else is reached through it.

```js
import { ScratchSession, ScratchAPIError } from 's-api4js';
```

## `ScratchSession`

The entry point. Owns the cookie jar, holds auth state, and exposes the resource
groups.

### Construction

```js
new ScratchSession(options?)
ScratchSession.login(username, password, options?) // → Promise<ScratchSession>
```

`options`:

| Option      | Default         | Purpose                                |
| ----------- | --------------- | -------------------------------------- |
| `jar`       | new `CookieJar` | The `tough-cookie` store.              |
| `fetch`     | global `fetch`  | Custom `fetch` implementation.         |
| `userAgent` | package UA      | `User-Agent` header for every request. |

### Properties

| Property                                               | Type             | Notes                                      |
| ------------------------------------------------------ | ---------------- | ------------------------------------------ |
| `loggedIn`                                             | `boolean`        | `true` once authenticated (getter).        |
| `username`                                             | `string \| null` | Set after login.                           |
| `userId`                                               | `number \| null` | Set after login.                           |
| `xToken`                                               | `string \| null` | `X-Token` for authenticated calls.         |
| `csrfToken`                                            | `string \| null` | CSRF token paired with the session cookie. |
| `jar`                                                  | `CookieJar`      | The shared cookie jar (getter).            |
| `users` / `projects` / `studios` / `search`            | resource         | The API groups.                            |
| `apiHost` / `projectsHost` / `assetsHost` / `siteHost` | `string`         | Base URLs.                                 |

### Methods

| Method                      | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `login(username, password)` | Authenticate this session in place. → `this`   |
| `refreshSession()`          | Re-read auth state from `/session/`.           |
| `logout()`                  | Clear the server session and local auth state. |
| `health()`                  | `GET /health`.                                 |
| `news()`                    | `GET /news`.                                   |
| `featured()`                | `GET /proxy/featured`.                         |

::: details Lower-level helpers
`apiGet(path, params?)`, `authedJson(url, options?, extraHeaders?)`,
`authedFetch(url, options?, extraHeaders?)`, `authHeaders()` and `requireAuth()`
are used internally by the resource classes and are available if you need to call
an endpoint that doesn't have a dedicated method yet.
:::

## `session.users`

| Method                       | Endpoint                          |
| ---------------------------- | --------------------------------- |
| `get(username)`              | `GET /users/<username>`           |
| `followers(username, page?)` | `GET /users/<username>/followers` |
| `following(username, page?)` | `GET /users/<username>/following` |
| `favorites(username, page?)` | `GET /users/<username>/favorites` |
| `projects(username, page?)`  | `GET /users/<username>/projects`  |

`page` is `{ limit?, offset? }` (Scratch caps `limit` at 40).

## `session.projects`

**Reads** (no login required for shared content):

| Method                  | Endpoint                                                |
| ----------------------- | ------------------------------------------------------- |
| `get(id)`               | `GET /projects/<id>`                                    |
| `remixes(id, page?)`    | `GET /projects/<id>/remixes`                            |
| `comments(id, page?)`   | `GET /users/<author>/projects/<id>/comments`            |
| `token(id)`             | `GET /projects/<id>` → `project_token`                  |
| `getJson(id, token?)`   | `GET projects.scratch.mit.edu/<id>?token=…`             |
| `downloadAsset(md5ext)` | `GET assets.scratch.mit.edu/<md5ext>`                   |
| `download(id)`          | `getJson` + every referenced asset → `{ json, assets }` |

**Writes** (require login + ownership):

| Method                                                     | Endpoint                               |
| ---------------------------------------------------------- | -------------------------------------- |
| `setJson(id, json)`                                        | `PUT projects.scratch.mit.edu/<id>`    |
| `uploadAsset(md5ext, bytes)`                               | `POST assets.scratch.mit.edu/<md5ext>` |
| `save(id, project)`                                        | upload all assets, then `setJson`      |
| `setMetadata(id, { title?, instructions?, description? })` | `PUT /projects/<id>`                   |
| `setTitle(id, title)`                                      | shortcut for `setMetadata`             |
| `setInstructions(id, instructions)`                        | shortcut for `setMetadata`             |
| `setDescription(id, description)`                          | shortcut for `setMetadata`             |
| `share(id)`                                                | `PUT /proxy/projects/<id>/share`       |
| `unshare(id)`                                              | `PUT /proxy/projects/<id>/unshare`     |

`save()` accepts a `scratch4js` `Project` or any `{ json, assets }`, where
`assets` is a `Map`/object of `md5ext → Uint8Array` or an array of
`[md5ext, bytes]` pairs. See [Editing projects](/s-api4js/editing-projects).

## `session.studios`

| Method                | Endpoint                     |
| --------------------- | ---------------------------- |
| `get(id)`             | `GET /studios/<id>`          |
| `projects(id, page?)` | `GET /studios/<id>/projects` |
| `curators(id, page?)` | `GET /studios/<id>/curators` |
| `managers(id, page?)` | `GET /studios/<id>/managers` |
| `comments(id, page?)` | `GET /studios/<id>/comments` |

## `session.search`

Each takes `{ mode?, language?, limit?, offset? }`, where `mode` is `'popular'`
(default) or `'trending'`.

| Method                       | Endpoint                                      |
| ---------------------------- | --------------------------------------------- |
| `projects(q, opts?)`         | `GET /search/projects`                        |
| `studios(q, opts?)`          | `GET /search/studios`                         |
| `exploreProjects(q?, opts?)` | `GET /explore/projects` (`q` defaults to `*`) |
| `exploreStudios(q?, opts?)`  | `GET /explore/studios`                        |

## `session.cloud(projectId, options?)`

Returns a [`Cloud`](#cloud) (requires login). `options` overrides the defaults:

| Option            | Default                           | Purpose                                  |
| ----------------- | --------------------------------- | ---------------------------------------- |
| `host`            | `wss://clouddata.scratch.mit.edu` | Cloud WebSocket URL (set for TurboWarp). |
| `allowNonNumeric` | `false`                           | Permit non-numeric values.               |
| `lengthLimit`     | `256`                             | Max value length.                        |
| `rateLimit`       | `0.1`                             | Minimum seconds between sets.            |
| `WebSocket`       | `ws`, then `globalThis.WebSocket` | WebSocket implementation.                |

### `Cloud`

| Method                                       | Description                                              |
| -------------------------------------------- | -------------------------------------------------------- |
| `connect()` / `disconnect()` / `reconnect()` | Manage the WebSocket (the first `setVar` connects too).  |
| `setVar(name, value)`                        | Set one `☁` variable (serialized + rate-limited).        |
| `setVars({ … })`                             | Set several, in order.                                   |
| `getVar(name)` / `getAllVars()`              | Latest value(s) seen since connecting.                   |
| `logs({ variable?, limit?, offset? })`       | `GET clouddata.scratch.mit.edu/logs` (no login needed).  |
| `on(event, fn)` / `off(event, fn)`           | Events: `set`, `connect`, `disconnect`, `error`.         |
| `requests(options?)`                         | Build a [`CloudRequests`](#cloudrequests) on this cloud. |
| `events(options?)`                           | Build a [`CloudEvents`](#cloudevents) log poller.        |
| `storage(options?)`                          | Build a [`CloudStorage`](#cloudstorage) key-value store. |

### `CloudRequests`

Built with `cloud.requests({ requestVar?, usedCloudVars? })`.

| Method                   | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `request(name, handler)` | Register a handler `(args, ctx) => string \| number \| string[]`. |
| `removeRequest(name)`    | Remove a handler.                                                 |
| `start()` / `stop()`     | Begin / stop handling requests.                                   |
| `on(event, fn)`          | Events: `request`, `unknownRequest`, `error`.                     |

The handler `ctx` is `{ name, args, requestId, requester }`.

### `CloudEvents`

Built with `cloud.events({ interval?, limit? })` — polls the public log, so it
works **without login** and reports the acting user and `create`/`delete`.

| Method               | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `on(event, fn)`      | Events: `ready`, `set`, `create`, `delete`, `error`. |
| `start()` / `stop()` | Seed the cursor and begin / stop polling.            |

Activity events receive `{ user, verb, name, value, timestamp }`.

### `CloudStorage`

Built with `cloud.storage(options?)` — a cloud-backed key-value store
(scratchattach's Cloud Storage protocol). Serves `get`, `set`, `keys`,
`database_names` and `ping` requests over the cloud.

| Method               | Description                                    |
| -------------------- | ---------------------------------------------- |
| `addDatabase(db)`    | Register a database (addressed by its `name`). |
| `getDatabase(name)`  | Look up a registered database.                 |
| `start()` / `stop()` | Begin / stop serving storage requests.         |
| `on(event, fn)`      | Events: `request`, `unknownRequest`, `error`.  |

Databases implement `{ name, get(key), set(key, value), keys() }`. Bundled:

| Class            | Backing store                                                         |
| ---------------- | --------------------------------------------------------------------- |
| `MemoryDatabase` | In-memory (not persisted).                                            |
| `JsonDatabase`   | A JSON file (`{ path }`).                                             |
| `SqlDatabase`    | SQLite / MySQL / MariaDB / PostgreSQL — `{ dialect, query, table? }`. |

`SqlDatabase` needs no bundled driver: pass a `query(sql, params)` wrapping your
client (better-sqlite3, mysql2, pg, …) that resolves to an array of row objects.
See [Cloud variables & requests](/s-api4js/cloud).

## `ScratchAPIError`

Thrown on any non-2xx response (or a failed request). Extends `Error`.

| Property  | Type                  | Description                              |
| --------- | --------------------- | ---------------------------------------- |
| `name`    | `string`              | `'ScratchAPIError'`.                     |
| `message` | `string`              | Human-readable summary.                  |
| `status`  | `number \| undefined` | HTTP status, if a response came back.    |
| `url`     | `string \| undefined` | The request URL.                         |
| `method`  | `string \| undefined` | The request method.                      |
| `body`    | `unknown`             | Parsed JSON (or raw text) response body. |

```js
import { ScratchAPIError } from 's-api4js';

try {
  await session.projects.save(123, project);
} catch (err) {
  if (err instanceof ScratchAPIError) {
    console.error(err.status, err.url, err.body);
  }
}
```
