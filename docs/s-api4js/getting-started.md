---
title: Getting started
description: Install s-api4js and make your first public and authenticated calls to the Scratch API.
---

# Getting started

## Install

```bash
pnpm add s-api4js
```

`s-api4js` needs Node 18 or newer (it uses the built-in global `fetch`). Its only
runtime dependency is [`tough-cookie`](https://github.com/salesforce/tough-cookie).
To edit projects you'll usually also want [`scratch4js`](/api/overview):

```bash
pnpm add s-api4js scratch4js
```

## Your first call (no login)

Everything hangs off a `ScratchSession`. Construct one and read public data right
away:

```js
import { ScratchSession } from 's-api4js';

const session = new ScratchSession();

const user = await session.users.get('griffpatch');
console.log(user.username, '· joined', user.history.joined.slice(0, 10));

const hits = await session.search.projects('platformer', { limit: 5 });
for (const p of hits) console.log(p.id, p.title);
```

The session groups the API into four resources — `users`, `projects`, `studios`
and `search` — plus the site-level helpers `health()`, `news()` and `featured()`.
See [Public data](/s-api4js/public-data) for the full list.

## Logging in

`ScratchSession.login` performs the CSRF + session handshake and returns a
ready, authenticated session:

```js
const session = await ScratchSession.login('username', 'password');

console.log(session.loggedIn); // true
console.log(session.username, session.userId);
```

Once logged in, the project-editing methods unlock — `download`, `save`,
`share`, `setTitle`, and so on. See [Authentication](/s-api4js/authentication)
and [Editing projects](/s-api4js/editing-projects).

::: warning Keep credentials out of source
Read them from the environment (or a secrets manager), never hard-code them:

```js
const session = await ScratchSession.login(
  process.env.SCRATCH_USER,
  process.env.SCRATCH_PASS,
);
```

:::

## Handling errors

Any non-2xx response throws a `ScratchAPIError` carrying the `status`, `url`,
`method` and parsed `body`:

```js
import { ScratchSession, ScratchAPIError } from 's-api4js';

try {
  await session.projects.get(0);
} catch (err) {
  if (err instanceof ScratchAPIError) {
    console.error(err.status, err.url, err.body);
  }
}
```

## Next steps

- [Public data](/s-api4js/public-data) — the read-only endpoints.
- [Editing projects](/s-api4js/editing-projects) — download → edit → save →
  publish.
- [Reference](/s-api4js/reference) — every method and the endpoints it hits.
