---
title: Authentication
description: How s-api4js logs in to Scratch — the CSRF + session handshake, the cookie jar, tokens, and custom fetch.
---

# Authentication

Logging in unlocks the project-editing methods (`download` reads work without it
for shared projects, but `save`, `share` and metadata writes need an
authenticated session). Authentication is entirely cookie-driven, and
`s-api4js` keeps those cookies in a [`tough-cookie`](https://github.com/salesforce/tough-cookie)
jar so you don't have to manage them.

## Logging in

```js
import { ScratchSession } from 's-api4js';

// Static helper — constructs and authenticates in one call.
const session = await ScratchSession.login('username', 'password');

// …or authenticate an existing session in place.
const s = new ScratchSession();
await s.login('username', 'password');
```

After a successful login the session is populated:

| Property    | Value                                            |
| ----------- | ------------------------------------------------ |
| `loggedIn`  | `true`                                           |
| `username`  | The account username.                            |
| `userId`    | The numeric user id.                             |
| `xToken`    | The `X-Token` sent with authenticated API calls. |
| `csrfToken` | The CSRF token paired with the session cookie.   |

## What login does

`login()` runs the same handshake a browser does:

1. **`GET /csrf_token/`** — primes the `scratchcsrftoken` cookie.
2. **`POST /login/`** — sends the credentials with the CSRF header; Scratch
   replies with the `scratchsessionsid` cookie, captured into the jar.
3. **`GET /session/`** — reads back the account details and the `X-Token` used
   for authenticated requests.

A rejected login throws a [`ScratchAPIError`](/s-api4js/reference#scratchapierror)
(status `403`); the message includes Scratch's reason where available.

You can re-read the session state at any time, and clear it when done:

```js
await session.refreshSession(); // re-fetch /session/ (xToken, username, …)
await session.logout(); // clear the server session + local auth state
```

## The cookie jar

The jar is shared across every request the session makes. Reach it via
`session.jar` to inspect or persist cookies — for example to resume a session
later without logging in again:

```js
import { CookieJar } from 'tough-cookie';

// Persist after login.
const serialized = JSON.stringify(session.jar.toJSON());

// Resume later.
const jar = CookieJar.fromJSON(JSON.parse(serialized));
const resumed = new ScratchSession({ jar });
await resumed.refreshSession(); // re-hydrate xToken / username from the cookies
```

## Constructor options

`new ScratchSession(options)` and `ScratchSession.login(user, pass, options)`
both accept:

| Option      | Default             | Purpose                                          |
| ----------- | ------------------- | ------------------------------------------------ |
| `jar`       | a fresh `CookieJar` | The `tough-cookie` store to use.                 |
| `fetch`     | global `fetch`      | A custom `fetch` implementation.                 |
| `userAgent` | the package's UA    | The `User-Agent` header sent with every request. |

A custom `fetch` is handy for proxies, retries, or running on a runtime whose
`fetch` you want to control:

```js
const session = new ScratchSession({
  userAgent: 'my-app/1.0 (you@example.com)',
  fetch: (url, init) => myInstrumentedFetch(url, init),
});
```

::: info Hosts
Authenticated requests carry the `X-Token` (and `X-CSRFToken`) headers and the
session cookie, spread across four hosts: `scratch.mit.edu` (login/session),
`api.scratch.mit.edu` (reads + metadata writes), `projects.scratch.mit.edu`
(project JSON) and `assets.scratch.mit.edu` (costumes/sounds). Because all four
are subdomains of `scratch.mit.edu`, the jar sends the session cookie to each.
:::
