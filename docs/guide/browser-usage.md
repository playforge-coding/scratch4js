---
title: Browser usage
description: Load and save .sb3 projects in the browser from file inputs, fetch and Blobs.
---

# Using scratch4js in the browser

scratch4js runs unchanged in the browser — it has no Node-only dependencies. The
only difference is where the bytes come from and go to.

## Loading from a file input

[`Project.load`](/api/project#project-load) accepts an `ArrayBuffer` or
`Uint8Array`, which is exactly what a `<input type="file">` gives you:

```html
<input type="file" id="file" accept=".sb3" />
```

```js
import { Project } from 'scratch4js';

document.getElementById('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const project = await Project.load(await file.arrayBuffer());

  console.log(project.sprites.map((s) => s.name));
});
```

## Saving to a download

[`save()`](/api/project#project-save) returns a `Uint8Array`. Wrap it in a `Blob`
and trigger a download:

```js
const bytes = await project.save();
const blob = new Blob([bytes], { type: 'application/octet-stream' });

const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'project.sb3';
a.click();
URL.revokeObjectURL(a.href);
```

## Loading over the network

```js
const res = await fetch('/projects/demo.sb3');
const project = await Project.load(await res.arrayBuffer());
```

## Using the UMD build via a `<script>` tag

For a no-bundler setup, load the self-contained UMD bundle (jszip is inlined) and
use the global `scratch4js`:

```html
<script src="https://unpkg.com/scratch4js/dist/umd/index.js"></script>
<script>
  const { Project } = scratch4js;
  // ...
</script>
```

## A note on bytes

Anywhere the API mentions "bytes" — `Project.load`, `addCostume`, `addSound`,
costume/sound `.data` — a `Uint8Array` or `ArrayBuffer` works in the browser just
as a `Buffer` does in Node. Inputs are normalised to `Uint8Array` internally, and
outputs are always `Uint8Array`.

## Next steps

- [API reference](/api/overview)
- [The MCP server](/mcp-server/)
