---
title: Visual diffs
description: How git sb3 diff renders changed scripts as real scratchblocks SVGs in a self-contained HTML report.
---

# Visual diffs

`git diff` makes script changes _readable_; `git sb3 diff` makes them
**visual**. It renders each changed script as a real
[scratchblocks](https://scratchblocks.github.io/) SVG and lays them out in a
single, self-contained HTML file you open in a browser.

```bash
git sb3 diff game.sb3            # working tree vs HEAD → game.diff.html
git sb3 diff HEAD~3 game.sb3     # an older commit vs the working tree
git sb3 diff before.sb3 after.sb3
```

See [the `diff` command](/git-sb3/commands#diff) for how the two arguments are
resolved and the available options. To keep the report open and have it refresh
as you edit, use [`git sb3 watch`](/git-sb3/live) instead.

## What the report shows

The report walks every target (stage and sprites), matches their scripts between
the two versions, and classifies each one:

- **Added scripts** — rendered with a green-tinted background.
- **Removed scripts** — rendered with a red-tinted background.
- **Modified scripts** — shown old-vs-new side by side, each version tinted, with
  a precise line-level scratchblocks **text diff** in a collapsible panel so you
  can see exactly which blocks moved.
- **Costume & sound changes** — listed per target as added / removed.

Scripts are matched across versions by similarity, so an edited script lines up
as _one modification_ rather than an unrelated add and remove. A summary line at
the top reports how many targets changed and the script add / remove / modify
counts.

## How it's rendered

Everything runs headlessly in Node — no browser, no Scratch VM:

1. **Read.** The `.sb3` zip is opened with
   [`@turbowarp/jszip`](https://github.com/TurboWarp/jszip), the same reader
   [`scratch4js`](/api/overview) uses.
2. **Scripts → blocks.** Each target's flat block map is reconstructed into
   scratchblocks source with
   [`parse-sb3-blocks`](https://www.npmjs.com/package/parse-sb3-blocks).
3. **Blocks → SVG.** The source is rendered with
   [`scratchblocks`](https://scratchblocks.github.io/) running on a
   [`jsdom`](https://github.com/jsdom/jsdom) window.

scratchblocks normally measures text with a real `<canvas>` to size each block.
Rather than pull in the heavyweight native `canvas` dependency, `git-sb3` ships a
small **Helvetica advance-width shim** that reproduces browser text metrics
closely enough that block layout is visually indistinguishable — so the renderer
stays pure-JS and dependency-light.

The result is one HTML document with the scratchblocks stylesheet inlined and all
SVGs embedded, so you can open or share `game.diff.html` with nothing else
attached.

::: tip Render labels in another language
Pass `-l/--language <code>` to render block text in a Scratch-supported language,
e.g. `git sb3 diff game.sb3 -l es`.
:::

## Programmatic use

The diff model and report renderer are exported, so you can build reports in your
own tooling:

```js
import { readSb3 } from 'git-sb3/src/sb3.js';
import { diffProjects, renderReport } from 'git-sb3/src/visual-diff.js';
import { writeFile } from 'node:fs/promises';

const { json: before } = await readSb3('before.sb3');
const { json: after } = await readSb3('after.sb3');

const model = diffProjects(before, after);
await writeFile('diff.html', renderReport(model, { title: 'My diff' }));
```
