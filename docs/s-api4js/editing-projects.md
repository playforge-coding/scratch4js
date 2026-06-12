---
title: Editing projects
description: Download a Scratch project, edit its .sb3 in memory, then save and publish it back to scratch.mit.edu.
---

# Editing projects

With a logged-in session you can round-trip a project: **download** it, edit it
in memory (best with [`scratch4js`](/api/overview)), then **save** it back — and
optionally **publish** it. You must own the project you write to.

```js
import { ScratchSession } from 's-api4js';
import { Project } from 'scratch4js';

const session = await ScratchSession.login(
  process.env.SCRATCH_USER,
  process.env.SCRATCH_PASS,
);
```

## Download

`projects.download(id)` fetches the `project.json` plus every costume and sound
it references. It returns `{ json, assets }`, where `assets` is a `Map` of
`md5ext → Uint8Array` — exactly the shape a `scratch4js` `Project` is built from:

```js
const { json, assets } = await session.projects.download(123456789);
const project = new Project(json, assets);

console.log(project.sprites.map((s) => s.name));
```

Shared projects download without a login; your own **unshared** projects need
one (the session's `X-Token` resolves the project token for you). Lower-level
pieces are available if you need them:

```js
const token = await session.projects.token(id); // the short-lived project_token
const json = await session.projects.getJson(id); // just project.json
const bytes = await session.projects.downloadAsset('abc123….svg'); // one asset
```

## Edit

Do the editing with `scratch4js` — sprites, scripts, costumes, sounds, variables
and lists are all plain getters and setters:

```js
const cat = project.sprite('Sprite1');
cat.x = 0;
cat.size = 150;
project.stage.setVariable('score', 0);
```

See the [scratch4js guide](/guide/introduction) for the full editing surface.

## Save

`projects.save(id, project)` uploads every asset, then writes the new
`project.json` — i.e. it saves the edited `.sb3` back to the website:

```js
await session.projects.save(123456789, project);
```

`save()` accepts a `scratch4js` `Project` **or** any `{ json, assets }`, where
`assets` is a `Map`/object of `md5ext → Uint8Array` (or an array of
`[md5ext, bytes]` pairs). The asset store is content-addressed by MD5, so
re-uploading unchanged assets is a harmless no-op.

If you changed only scripts and not costumes/sounds, skip the asset uploads:

```js
await session.projects.setJson(123456789, project.json);
```

Or upload a single asset yourself:

```js
await session.projects.uploadAsset('abc123….svg', svgBytes);
```

## Metadata

Title, instructions and the "Notes and Credits" description are separate from the
`.sb3` and edit through `api.scratch.mit.edu`:

```js
await session.projects.setTitle(123456789, 'My remix');
await session.projects.setInstructions(123456789, 'Arrow keys to move.');
await session.projects.setDescription(123456789, 'Thanks for playing!');

// Or several at once:
await session.projects.setMetadata(123456789, {
  title: 'My remix',
  instructions: 'Arrow keys to move.',
  description: 'Thanks for playing!',
});
```

## Publish

`projects.share(id)` publishes a project so it becomes publicly visible
(`PUT /proxy/projects/<id>/share`); `unshare(id)` reverses it:

```js
await session.projects.share(123456789);
await session.projects.unshare(123456789);
```

::: warning Publishing is outward-facing
Sharing makes a project public. If you're building a tool or agent on top of
`s-api4js`, confirm with the user before sharing — the
[`scratch-mcp` server](/mcp-server/online-projects) does exactly this.
:::

## Full round-trip

```js
import { ScratchSession } from 's-api4js';
import { Project } from 'scratch4js';

const session = await ScratchSession.login(
  process.env.SCRATCH_USER,
  process.env.SCRATCH_PASS,
);

const id = 123456789;
const { json, assets } = await session.projects.download(id);
const project = new Project(json, assets);

project.stage.setVariable('high-score', 0);

await session.projects.save(id, project);
await session.projects.setTitle(id, 'Updated by s-api4js');
```
