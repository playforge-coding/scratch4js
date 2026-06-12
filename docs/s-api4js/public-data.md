---
title: Public data
description: Read users, projects, studios and search results from the Scratch API — no login required.
---

# Public data

None of the calls on this page need a login — construct a plain `ScratchSession`
and read away. They all hit `api.scratch.mit.edu` and return the API's JSON
verbatim.

```js
import { ScratchSession } from 's-api4js';
const session = new ScratchSession();
```

Most list endpoints accept a **page** object, `{ limit, offset }`. Scratch caps
`limit` at 40.

## Users — `session.users`

```js
const user = await session.users.get('griffpatch');

const followers = await session.users.followers('griffpatch', { limit: 20 });
const following = await session.users.following('griffpatch');
const favorites = await session.users.favorites('griffpatch');
const projects = await session.users.projects('griffpatch', { offset: 40 });
```

| Method                       | Returns                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `get(username)`              | The user's profile (`id`, `username`, `history`, `profile`, …). |
| `followers(username, page?)` | Recent followers.                                               |
| `following(username, page?)` | Users they recently followed.                                   |
| `favorites(username, page?)` | Their favorited projects.                                       |
| `projects(username, page?)`  | Their shared projects.                                          |

## Projects — `session.projects`

The read methods (the [editing methods](/s-api4js/editing-projects) need login):

```js
const project = await session.projects.get(123456789);
const remixes = await session.projects.remixes(123456789, { limit: 10 });
const comments = await session.projects.comments(123456789);
```

| Method                | Returns                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `get(id)`             | Project metadata (`title`, `description`, `author`, `stats`, …).                                      |
| `remixes(id, page?)`  | The project's remixes.                                                                                |
| `comments(id, page?)` | Top-level comments. Resolves the author automatically, since Scratch keys project comments by author. |

## Studios — `session.studios`

```js
const studio = await session.studios.get(30136012);
const inStudio = await session.studios.projects(30136012, { limit: 10 });
const curators = await session.studios.curators(30136012);
const managers = await session.studios.managers(30136012);
const comments = await session.studios.comments(30136012);
```

| Method                | Returns                                                   |
| --------------------- | --------------------------------------------------------- |
| `get(id)`             | Studio info (`title`, `host`, `description`, `stats`, …). |
| `projects(id, page?)` | Projects in the studio.                                   |
| `curators(id, page?)` | The studio's curators.                                    |
| `managers(id, page?)` | The studio's managers.                                    |
| `comments(id, page?)` | Top-level comments.                                       |

## Search & explore — `session.search`

`search` matches a query; `explore` browses a feed (pass a category tag, or `*`
for everything). Both take `{ mode, language, limit, offset }`, where `mode` is
`'popular'` (default) or `'trending'`.

```js
const found = await session.search.projects('platformer', {
  mode: 'trending',
  language: 'en',
  limit: 16,
});
const studios = await session.search.studios('art');

const browse = await session.search.exploreProjects('animations');
const browseStudios = await session.search.exploreStudios();
```

| Method                       | Returns                                         |
| ---------------------------- | ----------------------------------------------- |
| `projects(q, opts?)`         | Project search results.                         |
| `studios(q, opts?)`          | Studio search results.                          |
| `exploreProjects(q?, opts?)` | The project explore feed (`q` defaults to `*`). |
| `exploreStudios(q?, opts?)`  | The studio explore feed.                        |

## Site-level helpers

Directly on the session:

```js
const status = await session.health(); // version, uptime, load
const news = await session.news(); // the News feed
const featured = await session.featured(); // front-page featured rows
```

| Method       | Endpoint              |
| ------------ | --------------------- |
| `health()`   | `GET /health`         |
| `news()`     | `GET /news`           |
| `featured()` | `GET /proxy/featured` |
