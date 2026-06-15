---
title: Cloud variables & requests
description: Connect to a project's cloud variables over WebSocket, set and read them, and run a scratchattach-compatible cloud-requests server.
---

# Cloud variables & requests

A logged-in session can open a project's **cloud connection** — the same
WebSocket the Scratch player uses — to set and read `☁` variables in real time,
listen for changes, or run a **cloud-requests** server: a Scratch project sends
named requests with arguments, and your code answers over the cloud.

The request/response wire protocol is byte-for-byte compatible with
[scratchattach](https://github.com/TimMcCool/scratchattach), so a project built
for its requests sprite works against `s-api4js` unchanged.

```js
import { ScratchSession } from 's-api4js';

const session = await ScratchSession.login(
  process.env.SCRATCH_USER,
  process.env.SCRATCH_PASS,
);

const cloud = session.cloud(123456789);
await cloud.connect();
```

Connecting to Scratch's cloud requires login and the
[`ws`](https://github.com/websockets/ws) package (a dependency of `s-api4js`).
Reading the public log does not.

## Setting and reading variables

`session.cloud(id)` fills in the auth cookie, username and origin for you. Set a
variable with `setVar` — values must be **numeric** and at most **256
characters** unless you opt out:

```js
await cloud.setVar('score', 100); // ☁ is added for you
await cloud.setVars({ x: 10, y: 20 });

cloud.on('set', ({ name, value }) => console.log(`☁ ${name} = ${value}`));

cloud.getVar('score'); // latest value seen since connecting
cloud.getAllVars(); // { score: '100', x: '10', y: '20' }
```

Sets are queued and rate-limited (default one per 0.1 s) so you won't trip
Scratch's limits. To allow text values, pass `allowNonNumeric`:

```js
const cloud = session.cloud(123456789, { allowNonNumeric: true });
```

### Reading the log without a connection

The cloud-data log is public, so `logs()` works logged out — handy for reading
recent activity or the requester behind a change:

```js
const recent = await cloud.logs({ limit: 25 });
// [{ user, verb, name: '☁ score', value: '100', timestamp }, …]
const justScore = await cloud.logs({ variable: 'score' });
```

### TurboWarp clouds

Point the connection at a different cloud host:

```js
const cloud = session.cloud(123456789, {
  host: 'wss://clouddata.turbowarp.org',
});
```

## Cloud requests

Build a request server on the same connection with `cloud.requests()`. Register
handlers by name; each receives the decoded string **arguments** (an array) and
a **context**, and returns what to send back:

```js
const requests = cloud.requests();

requests.request('ping', () => 'pong');
requests.request('add', ([a, b]) => Number(a) + Number(b));
requests.request('greet', async ([name]) => `hello ${name}!`);
requests.request('leaderboard', () => ['alice: 10', 'bob: 8']); // a list

requests.on('request', ({ name, args }) => console.log(name, args));
requests.on('error', ({ error, ctx }) => console.error(ctx.name, error));

await requests.start();
```

A handler returns:

- a **string** — encoded and sent back (chunked if it's long);
- a **number** — sent efficiently when the request allows it;
- an **array of strings** — delivered as a list.

The context is `{ name, args, requestId, requester }`. The WebSocket stream
doesn't carry the requesting username, so `requester` is `null`; resolve it from
`cloud.logs()` if you need it.

### How it works on the wire

The Scratch project writes an encoded request to `☁ TO_HOST` and reads the
answer from `☁ FROM_HOST_1` … `☁ FROM_HOST_9`. Because cloud values are numeric
and capped at 256 characters, text is [encoded](#encoding) to digits and split
across as many packets as needed; the server cycles through the `FROM_HOST_n`
variables and can re-send a dropped packet on request. All of this is handled
for you — you just register handlers.

You can customize the variable names if your project differs from the default:

```js
const requests = cloud.requests({
  requestVar: 'TO_HOST',
  usedCloudVars: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
});
```

## Cloud storage

A **cloud storage** server is a cloud-requests server with a fixed set of
requests — `get`, `set`, `keys`, `database_names`, `ping` — backed by one or
more databases. It speaks scratchattach's Cloud Storage protocol, so its
companion Scratch project works unchanged. Build one with `cloud.storage()` and
register databases:

```js
import { ScratchSession, SqlDatabase } from 's-api4js';
import Database from 'better-sqlite3';

const session = await ScratchSession.login(
  process.env.SCRATCH_USER,
  process.env.SCRATCH_PASS,
);

const db = new Database('storage.db');
const storage = session.cloud(123456789).storage();

storage.addDatabase(
  new SqlDatabase('scores', {
    dialect: 'sqlite',
    query: (sql, params) => db.prepare(sql).all(params),
  }),
);

await storage.start();
```

The project can now `set` (`scores`, key, value), `get` (`scores`, key) and list
`keys` (`scores`) over the cloud.

### Choosing a database

A database is any object with `name`, `get(key)`, `set(key, value)` and `keys()`
(async or sync). Three adapters are bundled:

| Adapter          | Backing store                         | When                       |
| ---------------- | ------------------------------------- | -------------------------- |
| `MemoryDatabase` | A plain object (not persisted)        | Tests, ephemeral state     |
| `JsonDatabase`   | A JSON file (`{ path }`)              | Small, local, zero-setup   |
| `SqlDatabase`    | SQLite / MySQL / MariaDB / PostgreSQL | Real, shared, durable data |

`SqlDatabase` ships **no driver** — you pass a small `query(sql, params)`
function wrapping the client you already use, and the adapter writes the
dialect-appropriate SQL (placeholders, upsert) and creates the two-column table
(`k`, `v`) on first use. `query` must resolve to an array of row objects.

```js
// SQLite — better-sqlite3 (synchronous)
new SqlDatabase('scores', {
  dialect: 'sqlite',
  query: (sql, params) => db.prepare(sql).all(params),
});

// PostgreSQL — pg
new SqlDatabase('scores', {
  dialect: 'postgres',
  query: async (sql, params) => (await pool.query(sql, params)).rows,
});

// MySQL / MariaDB — mysql2/promise
new SqlDatabase('scores', {
  dialect: 'mysql',
  query: async (sql, params) => (await pool.execute(sql, params))[0],
});
```

Options: `table` (default `cloud_storage`), `keyType` / `valueType`, and
`ensureSchema` (set `false` to manage the table yourself).

## Cloud events

To watch a project's cloud activity — including **who** changed a variable and
variable `create`/`delete`, neither of which the live socket reports — poll its
public log with `cloud.events()`. Because it reads the log, it works **without
login**:

```js
import { Cloud } from 's-api4js';

const events = new Cloud({ projectId: 123456789 }).events({ interval: 1 });

events.on('set', (a) => console.log(`${a.user} set ☁ ${a.name} = ${a.value}`));
events.on('create', (a) => console.log(`${a.user} created ☁ ${a.name}`));
events.on('delete', (a) => console.log(`${a.user} deleted ☁ ${a.name}`));

await events.start();
```

`start()` seeds its cursor from the current log, so only **future** activity
fires. Each activity event receives `{ user, verb, name, value, timestamp }`.
`interval` is the poll period in seconds (default `1`).

For instant, in-process change notifications on a connected socket, use the
`set` event on the [connection](#setting-and-reading-variables) instead — it's
immediate, but logged-in only and without the acting user.

## Encoding {#encoding}

The text ⇄ digits scheme is exported in case you need it directly. It matches
scratchattach's table and the companion Scratch decoder sprite:

```js
import { encode, decode } from 's-api4js';

encode('hi there'); // '3537205935295529'
decode('3537205935295529'); // 'hi there'
```

Each character becomes its two-digit index in a fixed table; unknown characters
become a space.
