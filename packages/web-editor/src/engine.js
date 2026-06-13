import { WebContainer } from '@webcontainer/api';

// How much recent terminal output to keep so a terminal that mounts late (or
// remounts) can replay history instead of showing a blank screen.
const OUTPUT_BUFFER_LIMIT = 96 * 1024;

/**
 * Convert a flat { 'a/b.js': contents } map into the nested
 * `{ a: { directory: { 'b.js': { file: { contents } } } } }` tree the
 * WebContainer API mounts.
 *
 * @param {Record<string,string>} files
 * @returns {import('@webcontainer/api').FileSystemTree}
 */
export function toFileSystemTree(files) {
  /** @type {import('@webcontainer/api').FileSystemTree} */
  const tree = {};
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node[dir]) node[dir] = { directory: {} };
      node = node[dir].directory;
    }
    node[parts[parts.length - 1]] = { file: { contents } };
  }
  return tree;
}

// A tiny static file server we run inside the container to serve the build
// output directory with permissive CORS, so another origin (e.g. a preview /
// player site) can fetch built files by a short URL. This avoids inlining whole
// files into giant data: URLs.
const buildServerScript = (
  serveDir,
  port,
) => `import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.css': 'text/css', '.html': 'text/html' };
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  try {
    const data = await readFile(${JSON.stringify(serveDir)} + path);
    res.setHeader('Content-Type', TYPES[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(${port});
`;

/**
 * Generic WebContainer-backed build engine. Owns the single bootable
 * WebContainer, an interactive `jsh` shell wired to a terminal, and a CORS
 * static server for the build output. Project specifics (which files, which
 * build command, where the output lands) are passed in by the caller.
 *
 * Status flow: idle → booting → installing → ready → building → built ⇄ building;
 * any step → error.
 */
export class WebContainerEngine {
  /**
   * @param {object} [config]
   * @param {string} [config.serveDir]  build-output dir the preview server serves
   * @param {number} [config.previewPort]
   * @param {string[]} [config.installCommand]
   * @param {string} [config.shell]
   */
  constructor(config = {}) {
    this.serveDir = config.serveDir ?? 'dist';
    this.previewPort = config.previewPort ?? 8088;
    this.installCommand = config.installCommand ?? ['npm', 'install'];
    this.shellCommand = config.shell ?? 'jsh';
    // A CORS static server for the build output. Useful for *same-page* previews
    // (an iframe of the build), but note its `*.webcontainer-api.io` URL is only
    // reachable from the page that booted the container — not arbitrary external
    // origins. Off by default; opt in when a same-page preview needs it.
    this.previewServer = config.previewServer ?? false;

    /** @type {import('@webcontainer/api').WebContainer | null} */
    this.container = null;
    this.status = 'idle';

    /** @type {Set<(status: string) => void>} */
    this.statusSubs = new Set();
    /** @type {Set<(chunk: string) => void>} */
    this.outputSubs = new Set();
    this.outputBuffer = '';
    /** Cross-origin URL of the in-container preview server (once ready). */
    this.previewUrl = null;
    /** @type {Set<(url: string) => void>} */
    this.previewSubs = new Set();

    /** @type {import('@webcontainer/api').WebContainerProcess | null} */
    this.shell = null;
    /** @type {WritableStreamDefaultWriter<string> | null} */
    this.shellInput = null;

    this.cols = 80;
    this.rows = 24;
    this._bootPromise = null;
  }

  /** @param {(status: string) => void} cb */
  onStatus(cb) {
    this.statusSubs.add(cb);
    cb(this.status);
    return () => this.statusSubs.delete(cb);
  }

  /** @param {(chunk: string) => void} cb — replays scrollback immediately. */
  onOutput(cb) {
    this.outputSubs.add(cb);
    if (this.outputBuffer) cb(this.outputBuffer);
    return () => this.outputSubs.delete(cb);
  }

  /** @param {(url: string) => void} cb — fires once the preview server is up. */
  onPreviewUrl(cb) {
    this.previewSubs.add(cb);
    if (this.previewUrl) cb(this.previewUrl);
    return () => this.previewSubs.delete(cb);
  }

  _setStatus(status) {
    this.status = status;
    for (const cb of this.statusSubs) cb(status);
  }

  /** @param {string} chunk */
  _output(chunk) {
    this.outputBuffer = (this.outputBuffer + chunk).slice(-OUTPUT_BUFFER_LIMIT);
    for (const cb of this.outputSubs) cb(chunk);
  }

  /** Write a status line into the terminal, styled (dim cyan). */
  _sys(message) {
    this._output(`\r\n\x1b[36m› ${message}\x1b[0m\r\n`);
  }

  /**
   * Boot the container (once), mount `files`, install deps, and start the
   * interactive shell + preview server.
   *
   * @param {Record<string,string>} files  flat { path: contents } map
   * @param {string} [label]  project name shown while mounting
   */
  async start(files, label = 'project') {
    if (!self.crossOriginIsolated) {
      this._setStatus('error');
      throw new Error(
        'This page is not cross-origin isolated, so a WebContainer cannot boot.',
      );
    }
    if (!this._bootPromise) this._bootPromise = this._boot(files, label);
    await this._bootPromise;
  }

  async _boot(files, label) {
    try {
      this._setStatus('booting');
      this._sys('Booting WebContainer…');
      this.container = await WebContainer.boot();

      this._sys(`Mounting ${label}…`);
      await this.container.mount(toFileSystemTree(files));

      this._setStatus('installing');
      const [cmd, ...args] = this.installCommand;
      this._sys(
        `Installing dependencies (${this.installCommand.join(' ')})… this can take a minute.`,
      );
      const code = await this._run(cmd, args);
      if (code !== 0) throw new Error(`install failed with exit code ${code}.`);

      await this._startShell();
      if (this.previewServer) await this._startPreviewServer();
      this._setStatus('ready');
      this._sys('Ready. This is a real shell — try ls, cat, node, npm.');
    } catch (err) {
      this._setStatus('error');
      this._sys(`Error: ${err?.message || err}`);
      this._bootPromise = null; // allow a retry
      throw err;
    }
  }

  async _startShell() {
    this.shell = await this.container.spawn(this.shellCommand, {
      terminal: { cols: this.cols, rows: this.rows },
    });
    this.shell.output.pipeTo(
      new WritableStream({ write: (chunk) => this._output(chunk) }),
    );
    this.shellInput = this.shell.input.getWriter();
  }

  async _startPreviewServer() {
    this.container.on('server-ready', (port, url) => {
      if (port !== this.previewPort) return;
      this.previewUrl = url;
      for (const cb of this.previewSubs) cb(url);
    });
    await this.container.fs.writeFile(
      '.web-editor-server.mjs',
      buildServerScript(this.serveDir, this.previewPort),
    );
    // Long-lived; don't await its exit. Output isn't piped (keeps the terminal clean).
    await this.container.spawn('node', ['.web-editor-server.mjs']);
  }

  /** Forward a keystroke/paste from the terminal to the interactive shell. */
  writeInput(data) {
    this.shellInput?.write(data);
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    try {
      this.shell?.resize({ cols, rows });
    } catch {
      /* shell not started yet */
    }
  }

  async writeFile(path, contents) {
    if (!this.container) throw new Error('WebContainer is not running.');
    await this.container.fs.writeFile(path, contents);
  }

  async addFile(path, contents = '') {
    if (!this.container) throw new Error('WebContainer is not running.');
    const dir = path.split('/').slice(0, -1).join('/');
    if (dir) await this.container.fs.mkdir(dir, { recursive: true });
    await this.container.fs.writeFile(path, contents);
  }

  async removeFile(path) {
    if (!this.container) throw new Error('WebContainer is not running.');
    await this.container.fs.rm(path, { recursive: true, force: true });
  }

  /**
   * Run a build command (its own pty process) and read the produced file back.
   *
   * @param {object} opts
   * @param {string[]} opts.command   e.g. ['npm', 'run', 'build']
   * @param {string} opts.outputPath  file to read after a successful build
   * @param {string} [opts.label]
   * @param {Record<string,string>} [opts.env]  extra env for the build process
   * @returns {Promise<{ code: number, contents: string | null }>}
   */
  async build({ command, outputPath, label = 'project', env }) {
    if (!this.container) throw new Error('WebContainer is not running.');
    if (this.status === 'building')
      throw new Error('A build is already in progress.');
    this._setStatus('building');
    this._sys(`Building ${label} (${command.join(' ')})…`);

    const [cmd, ...args] = command;
    const code = await this._run(cmd, args, env);
    this._refreshShellPrompt();
    if (code !== 0) {
      this._setStatus('error');
      return { code, contents: null };
    }

    let contents;
    try {
      contents = await this.container.fs.readFile(outputPath, 'utf-8');
    } catch (err) {
      this._setStatus('error');
      this._sys(
        `Build succeeded but ${outputPath} was not found: ${err?.message || err}`,
      );
      return { code: 1, contents: null };
    }
    this._setStatus('built');
    return { code, contents };
  }

  /** Spawn a command with a pty and stream its output to terminal subscribers. */
  async _run(command, args, env) {
    const proc = await this.container.spawn(command, args, {
      terminal: { cols: this.cols, rows: this.rows },
      ...(env ? { env } : {}),
    });
    proc.output.pipeTo(
      new WritableStream({ write: (chunk) => this._output(chunk) }),
    );
    return proc.exit;
  }

  /** Nudge the idle shell to redraw a fresh prompt after an engine-run command. */
  _refreshShellPrompt() {
    try {
      this.shellInput?.write('\n');
    } catch {
      /* shell not started */
    }
  }
}
