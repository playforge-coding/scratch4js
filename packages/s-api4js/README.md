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
