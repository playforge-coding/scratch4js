# s-api4js

A small, **class-based** wrapper for the
[Scratch API](https://en.scratch-wiki.info/wiki/Scratch_API).

Read public data — users, projects, studios, search — with no login, or log in
to edit a project's **`.sb3`**. Cookies are kept in a
[`tough-cookie`](https://github.com/salesforce/tough-cookie) jar, just like a
browser, so the CSRF / session handshake is handled for you. Written in plain
JS with JSDoc types; works in Node 18+.

> Pairs naturally with [`scratch4js`](../scratch4js): edit an `.sb3` in memory,
> then push it back to scratch.mit.edu with one call.

## Install

```bash
pnpm add s-api4js
```

## Quick start

### Public data (no login)

```js
import { ScratchSession } from 's-api4js';

const session = new ScratchSession();

const user = await session.users.get('griffpatch');
const project = await session.projects.get(123456789);
const remixes = await session.projects.remixes(123456789);
const hits = await session.search.projects('platformer', { limit: 10 });
const studio = await session.studios.get(30136012);
```

### Log in and edit a project's `.sb3`

```js
import { ScratchSession } from 's-api4js';
import { Project } from 'scratch4js';
import { readFile } from 'node:fs/promises';

const session = await ScratchSession.login('username', 'password');

// Edit the project in memory with scratch4js…
const project = await Project.load(await readFile('game.sb3'));
project.sprite('Sprite1').x = 0;
project.stage.setVariable('score', 0);

// …then save it back to scratch.mit.edu (uploads assets + writes project.json).
await session.projects.save(123456789, project);

// Metadata too:
await session.projects.setTitle(123456789, 'My remix');
await session.projects.setInstructions(123456789, 'Arrow keys to move.');
```

`save()` accepts a scratch4js `Project` or any `{ json, assets }` (where
`assets` is a `Map`/object of `md5ext → Uint8Array`). If you only changed
scripts and not costumes/sounds, `session.projects.setJson(id, json)` skips the
asset uploads.

### Cloud variables & cloud requests

Open a project's cloud connection (WebSocket) to set/read `☁` variables, listen
for changes, or run a **cloud-requests** server — the same request/response
protocol as [scratchattach](https://github.com/TimMcCool/scratchattach), so a
Scratch project built for it works unchanged.

```js
import { ScratchSession } from 's-api4js';

const session = await ScratchSession.login('username', 'password');
const cloud = session.cloud(123456789);

await cloud.connect();
cloud.on('set', ({ name, value }) => console.log(name, '=', value));
await cloud.setVar('score', 100); // values must be numeric by default

// A request/response server on the same connection:
const requests = cloud.requests();
requests.request('ping', () => 'pong');
requests.request('add', ([a, b]) => Number(a) + Number(b));
requests.request('greet', async ([name]) => `hello ${name}!`);
requests.request('leaderboard', () => ['alice: 10', 'bob: 8']); // a list
await requests.start();
```

A request handler receives the decoded string arguments (an array) plus a
context (`{ name, requestId, requester, args }`) and returns a string, number,
or array of strings. Strings are encoded to fit Scratch's numeric, 256-char
cloud values and chunked across `☁ FROM_HOST_n` automatically.

**Cloud storage** — a cloud-backed key-value store (scratchattach's Cloud Storage
protocol). Pick your own database: bundled `MemoryDatabase`/`JsonDatabase`, or
`SqlDatabase` for **SQLite**, **MySQL/MariaDB** or **PostgreSQL** (you supply a
tiny `query` wrapper around your driver — no driver is bundled).

```js
import { SqlDatabase } from 's-api4js';
import Database from 'better-sqlite3';

const db = new Database('storage.db');
const storage = cloud.storage();
storage.addDatabase(
  new SqlDatabase('scores', {
    dialect: 'sqlite', // or 'mysql' / 'postgres'
    query: (sql, params) => db.prepare(sql).all(params),
  }),
);
await storage.start(); // project can now get/set/keys
```

**Cloud events** — watch a project's activity by polling its public log. Works
**logged out**, and reports the acting user and `create`/`delete` (the live
socket carries neither):

```js
const events = cloud.events();
events.on('set', (a) => console.log(`${a.user} set ${a.name} = ${a.value}`));
events.on('create', (a) => console.log(`${a.user} created ${a.name}`));
await events.start();
```

**TurboWarp & custom servers** — everything above (variables, requests, storage,
events) works against any cloud server, not just Scratch's. TurboWarp's needs no
login:

```js
import { Cloud } from 's-api4js';

// No session required. Strings and long values are allowed here.
const cloud = Cloud.turbowarp(123456789, { contact: 'you@example.com' });
await cloud.setVar('message', 'hello');
cloud.requests().request('add', ([a, b]) => Number(a) + Number(b));

// Any other server:
const custom = new Cloud({ projectId: 1, host: 'wss://my.cloud.example' });
```

`cloud.events()` automatically listens on the WebSocket for servers without a
log API (TurboWarp/custom) and polls the log on Scratch. `cloud.logs()` is
Scratch-only.

Connecting to Scratch's cloud requires login and the [`ws`](https://github.com/websockets/ws)
package (a dependency). Reading the public log — `cloud.logs()` / `cloud.events()`
— does not.

## API

Everything hangs off a `ScratchSession`.

### `new ScratchSession(options?)` · `ScratchSession.login(username, password, options?)`

`options`: `{ jar?, fetch?, userAgent? }` — supply your own `tough-cookie`
`CookieJar`, a custom `fetch`, or a `User-Agent` string. `login` returns a
ready, authenticated session.

| Property / method                           | Description                                    |
| ------------------------------------------- | ---------------------------------------------- |
| `loggedIn`                                  | `true` once authenticated.                     |
| `username`, `userId`, `xToken`, `csrfToken` | Populated after login.                         |
| `jar`                                       | The underlying `tough-cookie` `CookieJar`.     |
| `login(username, password)`                 | Authenticate this session in place.            |
| `refreshSession()`                          | Re-read auth state from `/session/`.           |
| `logout()`                                  | Clear the server session and local auth state. |
| `health()`, `news()`, `featured()`          | Site-level endpoints.                          |

### `session.users`

`get(username)`, `followers(u, page?)`, `following(u, page?)`,
`favorites(u, page?)`, `projects(u, page?)`. `page` is `{ limit?, offset? }`.

### `session.projects`

Reads: `get(id)`, `remixes(id, page?)`, `comments(id, page?)`.

Writes (require login): `save(id, project)`, `setJson(id, json)`,
`uploadAsset(md5ext, bytes)`, `setMetadata(id, { title, instructions, description })`,
and the shortcuts `setTitle`, `setInstructions`, `setDescription`.

### `session.studios`

`get(id)`, `projects(id, page?)`, `curators(id, page?)`, `managers(id, page?)`,
`comments(id, page?)`.

### `session.search`

`projects(q, opts?)`, `studios(q, opts?)`, `exploreProjects(q?, opts?)`,
`exploreStudios(q?, opts?)`. `opts` is
`{ mode?: 'trending' | 'popular', language?, limit?, offset? }`.

### `session.cloud(projectId, options?)` · `Cloud.turbowarp(projectId, options?)` · `new Cloud(options)`

`session.cloud` returns a `Cloud` for Scratch (requires login), unless you pass a
custom `options.host` (then no login/cookie). `Cloud.turbowarp(id, { purpose?,
contact?, … })` is a logged-out TurboWarp preset; `new Cloud({ projectId, host,
… })` targets any server. `options`: `{ host, allowNonNumeric, lengthLimit,
rateLimit, userAgent, cookie, WebSocket }`. Constants: `Cloud.SCRATCH_HOST`,
`Cloud.TURBOWARP_HOST`.

`Cloud`: `connect()`, `disconnect()`, `reconnect()`, `setVar(name, value)`,
`setVars({ … })`, `getVar(name)`, `getAllVars()`, `logs({ variable?, limit?, offset? })`,
`on(event, fn)` / `off(event, fn)` (`set`, `connect`, `disconnect`, `error`),
and the builders `requests(options?)`, `events(options?)`, `storage(options?)`.

`CloudRequests`: `request(name, handler)`, `removeRequest(name)`, `start()`,
`stop()`, `on(event, fn)` (`request`, `unknownRequest`, `error`).

`CloudEvents`: `on(event, fn)` (`ready`, `set`, `create`, `delete`, `error`),
`start()`, `stop()`. `events({ source })` — `source` is `'logs'` (Scratch) or
`'websocket'` (TurboWarp/custom); it's auto-selected by default.

`CloudStorage`: `addDatabase(db)`, `getDatabase(name)`, `start()`, `stop()`,
`on(event, fn)`. Databases: `MemoryDatabase`, `JsonDatabase`, `SqlDatabase`
(`dialect`: `'sqlite' | 'mysql' | 'postgres'`).

## Errors

Any non-2xx response throws a `ScratchAPIError` carrying `status`, `url`,
`method` and the parsed `body`:

```js
import { ScratchAPIError } from 's-api4js';

try {
  await session.projects.save(123, project);
} catch (err) {
  if (err instanceof ScratchAPIError) console.error(err.status, err.body);
}
```

## Notes

- Only **public data** and **login + project editing** are implemented for now;
  more endpoints will follow.
- This is intended for Node. Browser use is limited by CORS — the login and
  asset hosts don't send permissive cross-origin headers.

## License

MPL-2.0
