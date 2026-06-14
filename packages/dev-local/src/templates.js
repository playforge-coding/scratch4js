// Project templates the dashboard can scaffold. Each template produces a flat
// file map plus how to build + preview it: an `entryFile` to open first and a
// `build` descriptor (`{ command, outputPath, mimeType }`) the WebContainer
// engine runs, reading `outputPath` back for the live preview.
//
// Every template is intentionally zero-dependency so the first WebContainer boot
// is instant (`npm install` has nothing to fetch). They're starting points — a
// real shell is one panel away.

// ── 1. Vanilla web app — JS + CSS inlined into a single HTML file ────────────

const vanillaAppJs = `// Edit me! This file is bundled into the preview on the right.
// Saving triggers an automatic rebuild (toggle "Auto-build" off to disable).

const root = document.getElementById('app');

let count = 0;
function render() {
  root.innerHTML = \`
    <h1>👋 Hello from dev-local</h1>
    <p>This page was edited in Monaco, built inside a WebContainer,
       and is previewing live — all in your browser.</p>
    <button id="btn">Clicked \${count} time\${count === 1 ? '' : 's'}</button>
    <p class="time">Built at \${new Date().toLocaleTimeString()}</p>
  \`;
  document.getElementById('btn').addEventListener('click', () => {
    count += 1;
    render();
  });
}

render();
`;

const vanillaCss = `:root {
  color-scheme: dark;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 30% 20%, #1d2029, #0e0f13);
  color: #e6e8ef;
}

#app { text-align: center; padding: 2rem; }
h1 { margin: 0 0 0.5rem; font-size: 1.6rem; }
p { color: #9aa1b2; max-width: 28rem; line-height: 1.5; }

button {
  margin-top: 1rem;
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border: none;
  border-radius: 8px;
  background: #6b5cff;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}
button:hover { background: #7d70ff; }
.time { margin-top: 1.5rem; font-size: 0.8rem; color: #6a7080; }
`;

const vanillaBuild = `import { readFile, mkdir, writeFile } from 'node:fs/promises';

const js = await readFile('src/app.js', 'utf-8');
const css = await readFile('src/style.css', 'utf-8');

const html = \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>dev-local app</title>
    <style>\${css}</style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">\${js}</script>
  </body>
</html>
\`;

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log('Built dist/index.html (' + html.length + ' bytes)');
`;

// ── 2. Static HTML — author one self-contained page, build copies it ─────────

const staticHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Static page</title>
    <style>
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: #0e0f13; color: #e6e8ef;
      }
      a { color: #7d70ff; }
    </style>
  </head>
  <body>
    <main style="text-align:center">
      <h1>A plain static page</h1>
      <p>Edit <code>src/index.html</code> — it's served as-is.</p>
    </main>
  </body>
</html>
`;

const staticBuild = `import { readFile, mkdir, writeFile } from 'node:fs/promises';

const html = await readFile('src/index.html', 'utf-8');
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log('Copied src/index.html → dist/index.html');
`;

// ── 3. Node script — runs in the container, preview shows its output ──────────

const nodeMain = `// A plain Node script. \`npm run build\` runs it and captures stdout,
// which the preview shows as text. Try requiring node: built-ins, doing math,
// generating data — anything Node can do.

const now = new Date().toISOString();
console.log('Hello from Node ' + process.version);
console.log('The time is ' + now);
console.log('');
console.log('Fibonacci:');
let [a, b] = [0, 1];
for (let i = 0; i < 10; i++) {
  process.stdout.write(a + ' ');
  [a, b] = [b, a + b];
}
console.log('');
`;

const nodeBuild = `import { mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const out = execSync('node main.js', { encoding: 'utf-8' });
await mkdir('dist', { recursive: true });
await writeFile('dist/output.txt', out);
console.log('Wrote dist/output.txt (' + out.length + ' bytes)');
`;

function pkg(name, description) {
  return (
    JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        description,
        scripts: { build: 'node build.mjs' },
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * @typedef {object} Template
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {() => { files: Record<string,string>, entryFile: string,
 *   build: { command: string[], outputPath: string, mimeType?: string } }} scaffold
 */

/** @type {Template[]} */
export const TEMPLATES = [
  {
    id: 'vanilla',
    label: 'Vanilla web app',
    description: 'JS + CSS bundled into a live HTML preview.',
    scaffold: () => ({
      files: {
        'package.json': pkg('dev-local-app', 'A vanilla web app'),
        'build.mjs': vanillaBuild,
        'src/app.js': vanillaAppJs,
        'src/style.css': vanillaCss,
      },
      entryFile: 'src/app.js',
      build: {
        command: ['npm', 'run', 'build'],
        outputPath: 'dist/index.html',
        mimeType: 'text/html',
      },
    }),
  },
  {
    id: 'static',
    label: 'Static HTML',
    description: 'One self-contained HTML page, served as-is.',
    scaffold: () => ({
      files: {
        'package.json': pkg('static-site', 'A static HTML page'),
        'build.mjs': staticBuild,
        'src/index.html': staticHtml,
      },
      entryFile: 'src/index.html',
      build: {
        command: ['npm', 'run', 'build'],
        outputPath: 'dist/index.html',
        mimeType: 'text/html',
      },
    }),
  },
  {
    id: 'node',
    label: 'Node script',
    description: 'A Node program; the preview shows its output.',
    scaffold: () => ({
      files: {
        'package.json': pkg('node-script', 'A Node script'),
        'build.mjs': nodeBuild,
        'main.js': nodeMain,
      },
      entryFile: 'main.js',
      build: {
        command: ['npm', 'run', 'build'],
        outputPath: 'dist/output.txt',
        mimeType: 'text/plain',
      },
    }),
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
