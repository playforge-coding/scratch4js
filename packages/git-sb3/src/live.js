/**
 * The live visual-diff server. Serves the diff report over HTTP and keeps it
 * fresh over a WebSocket: whenever the "new" side of the diff changes, it
 * re-renders the report body and pushes it to every open page, which swaps it
 * in without a reload.
 *
 * Two things drive an update:
 *
 *   - **File save** — an `fs.watch` on the working `.sb3`. The parent directory
 *     is watched (not the file) so atomic save-and-rename still fires.
 *   - **Userscript push** — the TurboWarp Desktop userscript connects here and
 *     sends the live project's `.sb3` bytes (a binary frame) on every edit, so
 *     the diff updates as you build, before anything touches disk.
 *
 * The baseline ("old") side is fixed for the session (a commit, ref or file).
 *
 * @module live
 */
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createRenderer } from './render.js';
import { loadSb3, readSb3 } from './sb3.js';
import {
  diffProjects,
  renderDiffBody,
  reportStyles,
  wrapReportPage,
} from './visual-diff.js';

const log = (...args) =>
  process.stderr.write(`[git-sb3:live] ${args.join(' ')}\n`);

/**
 * Start a live diff server. Resolves once it is listening.
 *
 * @param {object} options
 * @param {object} options.baselineJson - The "old" side (fixed for the session).
 * @param {string} options.newPath - Path of the working `.sb3` to watch.
 * @param {object} [options.initialNewJson] - Parsed working project, if already
 *   read, to render the first page without re-reading disk.
 * @param {string} [options.title='git-sb3 live diff'] - Page/heading title.
 * @param {string} [options.oldLabel='baseline']
 * @param {string} [options.newLabel='live']
 * @param {string} [options.language='en']
 * @param {number} [options.port=9061]
 * @param {boolean} [options.watchFile=true] - Watch `newPath` on disk.
 * @returns {Promise<LiveServer>}
 */
export async function startLiveDiff(options) {
  const {
    baselineJson,
    newPath,
    initialNewJson,
    title = 'git-sb3 live diff',
    oldLabel = 'baseline',
    newLabel = 'live',
    language = 'en',
    port = 9061,
    watchFile = true,
  } = options;

  // One renderer (one jsdom window) is reused for every re-render.
  const renderer = createRenderer();
  const styles = reportStyles(renderer);

  let currentBody = '';

  /**
   * Re-diff a parsed working project against the baseline and cache the body.
   *
   * @param {object} newJson
   * @returns {object} The diff model.
   */
  function rerender(newJson) {
    const model = diffProjects(baselineJson, newJson, { language });
    currentBody = renderDiffBody(model, renderer, {
      title,
      oldLabel,
      newLabel,
    });
    return model;
  }

  // First render: the working file as it is on disk right now.
  let firstJson = initialNewJson;
  if (!firstJson) {
    try {
      firstJson = (await readSb3(newPath)).json;
    } catch {
      firstJson = baselineJson; // No file yet → an empty diff.
    }
  }
  rerender(firstJson);

  const http = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url, 'http://localhost');
    if (
      req.method === 'GET' &&
      (url.pathname === '/' || url.pathname === '/index.html')
    ) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(wrapReportPage({ title, styles, body: currentBody, live: true }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  });

  const wss = new WebSocketServer({ server: http });
  // The WSS re-emits the http server's errors; handle them so a port clash
  // rejects the start promise (below) instead of crashing the process.
  wss.on('error', (err) => log(`server error: ${err.message}`));

  function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const ws of wss.clients) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  /** Re-render from new project bytes and push to every open page. */
  async function update(bytes) {
    try {
      const { json } = await loadSb3(bytes);
      const model = rerender(json);
      broadcast({ type: 'update', html: currentBody, summary: model.summary });
      return model.summary;
    } catch (err) {
      log(`ignored a bad project push: ${err.message}`);
      return null;
    }
  }

  wss.on('connection', (ws) => {
    // Send the current diff straight away so a freshly opened page renders.
    ws.send(JSON.stringify({ type: 'init', html: currentBody }));
    ws.on('message', (data, isBinary) => {
      // Binary frames are project pushes from the userscript; viewers (the
      // browser page) never send anything.
      if (isBinary) update(data);
    });
    ws.on('error', (err) => log(`socket error: ${err.message}`));
  });

  let watcher = null;
  if (watchFile) {
    watcher = watchSb3(newPath, async () => {
      try {
        const { json } = await readSb3(newPath);
        const model = rerender(json);
        broadcast({
          type: 'update',
          html: currentBody,
          summary: model.summary,
        });
      } catch {
        // The file may be mid-write; the next event will catch the final bytes.
      }
    });
  }

  await new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, () => {
      http.removeListener('error', reject);
      resolve();
    });
  });

  return new LiveServer(http, wss, watcher, port);
}

/**
 * Watch a single `.sb3` for changes, debounced. Watches the containing
 * directory and filters by filename so editors that save by writing a temp
 * file and renaming it (which swaps the inode) still trigger.
 *
 * @param {string} file
 * @param {() => void} onChange
 * @returns {import('node:fs').FSWatcher | null}
 */
function watchSb3(file, onChange) {
  const dir = path.dirname(path.resolve(file));
  const base = path.basename(file);
  let timer = null;
  try {
    return watch(dir, (_event, filename) => {
      if (filename && filename !== base) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, 150);
    });
  } catch {
    return null;
  }
}

/** A running live diff server. */
export class LiveServer {
  /**
   * @param {import('node:http').Server} http
   * @param {import('ws').WebSocketServer} wss
   * @param {import('node:fs').FSWatcher | null} watcher
   * @param {number} port
   */
  constructor(http, wss, watcher, port) {
    this.http = http;
    this.wss = wss;
    this.watcher = watcher;
    this.port = port;
  }

  /** @returns {string} The URL to open in a browser. */
  get url() {
    return `http://localhost:${this.port}/`;
  }

  /** @returns {number} Number of connected clients (pages + userscripts). */
  get clients() {
    return this.wss.clients.size;
  }

  /** Shut the server down. */
  close() {
    if (this.watcher) this.watcher.close();
    // Force open sockets closed so http.close() can complete promptly.
    for (const ws of this.wss.clients) ws.terminate();
    return new Promise((resolve) => {
      this.wss.close(() => this.http.close(() => resolve()));
    });
  }
}
