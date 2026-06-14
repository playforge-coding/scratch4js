// A git layer for dev-local, backed by wasm-git (libgit2 compiled to
// WebAssembly). It runs entirely in the browser, on its own filesystem —
// independent of the WebContainer. The editor's in-memory file store is the
// source of truth for local commits; before each local git operation we mirror
// it into a working tree (this.dir), so `status`, `add`, `commit`, and `log`
// reflect exactly what's in the editor.
//
// Each project gets its own working tree + IndexedDB database (keyed by
// `repoDir`), so histories don't bleed across the dashboard's projects.
//
// Two extras on top of the basics:
//   • Persistence — the working tree is mounted on IDBFS (IndexedDB), restored
//     on boot and synced after every mutating operation, so the repo survives
//     reloads.
//   • Remotes — clone / fetch / pull / push over HTTP. Browsers can't reach most
//     git servers directly (no CORS), so requests are routed through a
//     configurable CORS proxy, and an optional token is injected as an
//     Authorization header. We do this by wrapping wasm-git's own
//     `emscriptenhttpconnect` transport.
//
// We load the *async* build (`lg2_async.js` + `.wasm`) on the main thread. Those
// files are copied to `vendor/wasm-git/` at build time (see rsbuild.config.mjs)
// and loaded with a native dynamic import so Emscripten can resolve the wasm next
// to its own script URL — hence the `webpackIgnore`.

const VENDOR_PATH = 'vendor/wasm-git/lg2_async.js';
const DEFAULT_CORS_PROXY = 'https://cors.isomorphic-git.org';

// The async wasm-git build wraps `callMain` to be async — it suspends the wasm
// (via Asyncify) while network/XHR work happens, so `callMain` now returns a
// Promise. Its bundled `callWithOutput` helper predates that change and treats
// the returned Promise as a numeric exit code (`if (0 !== promise) throw …`), so
// *every* command throws `"[object Promise]: "`. We sidestep that helper by
// passing our own `print`/`printErr`/`quit` straight to the module factory (the
// module only installs its broken helper when neither `print` nor `printErr` is
// set), and awaiting `callMain` ourselves — see `run`. Output is captured into a
// per-module buffer stashed on the module instance, so engines don't clobber
// each other's output.
const CAPTURE = Symbol('wasmGitCapture');

function captureOverrides() {
  const cap = { stdout: [], stderr: [], exitCode: 0 };
  return {
    cap,
    overrides: {
      print: (line) => cap.stdout.push(line),
      printErr: (line) => cap.stderr.push(line),
      // libgit2 exits through Emscripten's exit path; record the status instead
      // of letting the default handler throw (mirrors wasm-git's sync helper).
      quit: (status) => {
        cap.exitCode = status;
      },
    },
  };
}

let factoryPromise;
function loadFactory() {
  if (!factoryPromise) {
    const url = new URL(VENDOR_PATH, document.baseURI).href;
    factoryPromise = import(/* webpackIgnore: true */ url).then(
      (m) => m.default,
    );
  }
  return factoryPromise;
}

/** Drop a project's persisted git database (call after deleting the project). */
export function deleteGitDatabase(repoDir) {
  try {
    indexedDB.deleteDatabase(repoDir);
  } catch {
    /* nothing persisted */
  }
}

/** A WebContainer-independent git working tree backed by wasm-git. */
export class GitEngine {
  /**
   * @param {object} [opts]
   * @param {string} [opts.repoDir]  working-tree path (and IndexedDB db name)
   * @param {{ name: string, email: string }} [opts.author]
   * @param {string} [opts.corsProxy]  prefix for remote HTTP requests ('' to disable)
   * @param {boolean} [opts.persistent]  persist the repo to IndexedDB (default true)
   */
  constructor(opts = {}) {
    this.dir = opts.repoDir ?? '/repo';
    this.author = opts.author ?? {
      name: 'dev-local',
      email: 'dev-local@users.noreply.github.com',
    };
    this.corsProxy = opts.corsProxy ?? DEFAULT_CORS_PROXY;
    /** whether the caller asked for persistence (may degrade if IDBFS fails) */
    this._wantPersist = opts.persistent ?? true;
    /** whether persistence is actually active after boot */
    this.persistent = false;
    /** @type {string|null} Authorization header value for remote requests */
    this._authHeader = null;

    /** @type {any} the initialized Emscripten module, once booted */
    this._lg = null;
    this._bootPromise = null;
    // wasm-git is one shared instance with a single working directory, so all
    // operations are serialized onto this promise chain.
    this._queue = Promise.resolve();
  }

  /** Set/clear remote credentials. Sent as HTTP Basic auth (works with GitHub /
   * GitLab / Gitea personal access tokens). Pass no token to clear. */
  setAuth({ username, token } = {}) {
    if (token) {
      const user = username || 'x-access-token';
      this._authHeader = `Basic ${btoa(`${user}:${token}`)}`;
    } else {
      this._authHeader = null;
    }
  }

  setCorsProxy(proxy) {
    this.corsProxy = proxy ?? '';
  }

  async _ready() {
    if (this._lg) return this._lg;
    if (!this._bootPromise) this._bootPromise = this._boot();
    return this._bootPromise;
  }

  async _boot() {
    const factory = await loadFactory();
    // Pass output handlers straight into the module so wasm-git skips installing
    // its (Promise-broken) `callWithOutput` helper. See note above CAPTURE.
    const { cap, overrides } = captureOverrides();
    const lg = await factory(overrides);
    lg[CAPTURE] = cap;
    const FS = lg.FS;

    // libgit2 reads the committer identity from the global gitconfig.
    tryMkdir(FS, '/home');
    tryMkdir(FS, '/home/web_user');
    FS.writeFile(
      '/home/web_user/.gitconfig',
      `[user]\n\tname = ${this.author.name}\n\temail = ${this.author.email}\n` +
        `[init]\n\tdefaultBranch = main\n`,
    );

    mkdirp(FS, this.dir);
    // Mount IndexedDB-backed storage and restore any previous repo. Degrade to
    // in-memory if IDBFS is unavailable (e.g. private browsing).
    if (this._wantPersist) {
      try {
        FS.mount(FS.filesystems.IDBFS, {}, this.dir);
        await syncfs(FS, true); // populate from IndexedDB
        this.persistent = true;
      } catch {
        this.persistent = false;
      }
    }
    FS.chdir(this.dir);

    this._installHttpProxy(lg);
    this._lg = lg;
    return lg;
  }

  /** Wrap wasm-git's HTTP transport to route through the CORS proxy and inject
   * auth — without touching any other fetch/XHR on the page. */
  _installHttpProxy(lg) {
    const original = lg.emscriptenhttpconnect;
    if (typeof original !== 'function' || original.__wrapped) return;
    const wrapper = (url, buffersize, method, headers) => {
      let target = url;
      if (this.corsProxy && /^https?:\/\//.test(url)) {
        target = `${this.corsProxy}/${url.replace(/^https?:\/\//, '')}`;
      }
      const merged = this._authHeader
        ? { ...(headers || {}), Authorization: this._authHeader }
        : headers;
      return original(target, buffersize, method, merged);
    };
    wrapper.__wrapped = true;
    lg.emscriptenhttpconnect = wrapper;
  }

  /** Serialize `fn` (which receives the booted module) onto the op queue. */
  _enqueue(fn) {
    const task = this._queue.then(() => this._ready()).then(fn);
    this._queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }

  async _persist(lg) {
    if (this.persistent) {
      try {
        await syncfs(lg.FS, false); // flush memory → IndexedDB
      } catch {
        /* best effort */
      }
    }
  }

  // ── local operations ──────────────────────────────────────────────────────

  /** Has a repository been created/cloned here yet? */
  async isRepo() {
    const lg = await this._ready();
    return pathExists(lg.FS, `${this.dir}/.git`);
  }

  /**
   * On boot, report whether a persisted repo was restored. Doesn't touch the
   * editor — the caller decides when to pull the work tree back in (see
   * {@link readFiles}), so it can't clobber the editor mid-startup.
   */
  async restore() {
    const lg = await this._ready();
    return {
      initialized: pathExists(lg.FS, `${this.dir}/.git`),
      persistent: this.persistent,
    };
  }

  /** `git init` the working tree, then mirror the current files into it. */
  async init(files) {
    return this._enqueue(async (lg) => {
      await run(lg, this.dir, ['init', '.']); // lg2's init requires an explicit dir
      writeFiles(lg.FS, this.dir, files);
      await this._persist(lg);
      return true;
    });
  }

  /**
   * Mirror `files` into the work tree and return the parsed short status plus
   * the current branch. Reports `initialized: false` if the tree isn't a repo.
   * @returns {Promise<{initialized:boolean, branch:string|null, entries:Array}>}
   */
  async status(files) {
    return this._enqueue(async (lg) => {
      writeFiles(lg.FS, this.dir, files);
      if (!pathExists(lg.FS, `${this.dir}/.git`))
        return { initialized: false, branch: null, entries: [] };
      const entries = parseStatus(
        await run(lg, this.dir, ['status', '--short', '--untracked-files=all']),
      );
      return {
        initialized: true,
        branch: currentBranch(lg, this.dir),
        entries,
      };
    });
  }

  /** Stage every change and commit it. Returns libgit2's commit output. */
  async commit(files, message) {
    return this._enqueue(async (lg) => {
      writeFiles(lg.FS, this.dir, files);
      await run(lg, this.dir, ['add', '.']);
      const out = await run(lg, this.dir, ['commit', '-m', message]);
      await this._persist(lg);
      return out;
    });
  }

  /** Parsed `git log` for the current branch (empty before the first commit). */
  async log() {
    return this._enqueue(async (lg) => {
      if (!pathExists(lg.FS, `${this.dir}/.git`)) return [];
      try {
        return parseLog(await run(lg, this.dir, ['log']));
      } catch {
        return []; // unborn branch — no commits yet
      }
    });
  }

  /** Read the current work tree back out as a `{ path: contents }` map (for
   * loading a cloned/pulled/restored repo into the editor). */
  async readFiles() {
    return this._enqueue((lg) => readWorkTree(lg.FS, this.dir));
  }

  /** Wipe the repository (and its persisted copy). The editor's files are left
   * untouched. */
  async deleteRepo() {
    return this._enqueue(async (lg) => {
      clearAll(lg.FS, this.dir);
      await this._persist(lg);
      return true;
    });
  }

  // ── remote operations ─────────────────────────────────────────────────────

  /** Clone `url` into the work tree and return its files. Replaces anything
   * already here. */
  async clone(url) {
    return this._enqueue(async (lg) => {
      clearAll(lg.FS, this.dir); // clone requires an empty target
      await run(lg, this.dir, ['clone', url, '.']);
      const files = readWorkTree(lg.FS, this.dir);
      await this._persist(lg);
      return files;
    });
  }

  /** Fetch from origin (updates remote-tracking refs; no work-tree change). */
  async fetch() {
    return this._enqueue(async (lg) => {
      await run(lg, this.dir, ['fetch', 'origin']);
      await this._persist(lg);
      return true;
    });
  }

  /** Fetch + merge origin/<branch>, then return the merged files. */
  async pull() {
    return this._enqueue(async (lg) => {
      const branch = currentBranch(lg, this.dir) || 'main';
      await run(lg, this.dir, ['fetch', 'origin']);
      await run(lg, this.dir, ['merge', `origin/${branch}`]);
      const files = readWorkTree(lg.FS, this.dir);
      await this._persist(lg);
      return files;
    });
  }

  /** Push committed changes to the remote. Configures `origin` from `url` (and a
   * push refspec) when needed — required for a repo created with `init`. */
  async push(url) {
    return this._enqueue(async (lg) => {
      const branch = currentBranch(lg, this.dir) || 'main';
      ensureRemote(lg.FS, this.dir, url, branch);
      const out = await run(lg, this.dir, ['push']);
      await this._persist(lg);
      return out;
    });
  }
}

// ── wasm-git invocation ─────────────────────────────────────────────────────

/**
 * Run one git command. `callMain` is async in the wasm-git build we load, so it
 * must be awaited; stdout/stderr and the exit status are captured through the
 * per-module overrides set in {@link GitEngine#_boot} (see {@link captureOverrides}).
 * Returns stdout joined by newlines, and throws on a non-zero exit (message = stderr).
 */
async function run(lg, dir, args) {
  lg.FS.chdir(dir); // re-assert cwd before each call (WASMFS can reset it)
  const cap = lg[CAPTURE];
  cap.stdout.length = 0;
  cap.stderr.length = 0;
  cap.exitCode = 0;
  let caught;
  try {
    await lg.callMain(args);
  } catch (err) {
    caught = err;
  }
  if (caught || cap.exitCode !== 0) {
    const stderr = cap.stderr.join('\n').trim();
    const detail =
      stderr ||
      (caught && (typeof caught === 'string' ? caught : caught.message)) ||
      `git command failed (exit ${cap.exitCode})`;
    throw new Error(
      detail.replace(/^\d+:\s*/, '').trim() || 'git command failed',
      { cause: caught },
    );
  }
  return cap.stdout.join('\n');
}

/** Promisified Emscripten `FS.syncfs`. populate=true loads from IndexedDB. */
function syncfs(FS, populate) {
  return new Promise((resolve, reject) => {
    FS.syncfs(populate, (err) => (err ? reject(err) : resolve()));
  });
}

function currentBranch(lg, dir) {
  try {
    const head = new TextDecoder().decode(lg.FS.readFile(`${dir}/.git/HEAD`));
    const ref = head.match(/ref:\s*refs\/heads\/(.+)/);
    return ref ? ref[1].trim() : head.trim().slice(0, 7) || null;
  } catch {
    return null;
  }
}

/** Ensure `origin` exists with a push refspec for `branch`, writing .git/config
 * directly (lg2's `push` takes no args and relies on this configuration). */
function ensureRemote(FS, dir, url, branch) {
  const path = `${dir}/.git/config`;
  let cfg;
  try {
    cfg = new TextDecoder().decode(FS.readFile(path));
  } catch {
    return; // not a repo
  }
  const pushLine = `\tpush = refs/heads/${branch}:refs/heads/${branch}\n`;
  if (/\[remote "origin"\]/.test(cfg)) {
    if (url)
      cfg = cfg.replace(/(\[remote "origin"\]\n\turl = ).*\n/, `$1${url}\n`);
    if (!/^\s*push\s*=/m.test(cfg))
      cfg = cfg.replace(/(\[remote "origin"\]\n)/, `$1${pushLine}`);
  } else if (url) {
    cfg +=
      `\n[remote "origin"]\n\turl = ${url}\n` +
      `\tfetch = +refs/heads/*:refs/remotes/origin/*\n${pushLine}`;
  }
  FS.writeFile(path, cfg);
}

// ── filesystem mirroring ────────────────────────────────────────────────────

/** Replace the work tree (everything under `dir` except .git) with `files`. */
function writeFiles(FS, dir, files) {
  clearWorkTree(FS, dir, dir);
  const encoder = new TextEncoder();
  for (const [path, contents] of Object.entries(files)) {
    const full = `${dir}/${path}`;
    mkdirp(FS, dirname(full));
    FS.writeFile(
      full,
      typeof contents === 'string' ? contents : encoder.encode(contents ?? ''),
    );
  }
}

/** Read every file under `dir` (except .git) into a `{ path: contents }` map. */
function readWorkTree(FS, dir) {
  const out = {};
  const walk = (cur, prefix) => {
    for (const name of FS.readdir(cur)) {
      if (name === '.' || name === '..') continue;
      if (cur === dir && name === '.git') continue;
      const full = `${cur}/${name}`;
      const rel = prefix ? `${prefix}/${name}` : name;
      if (FS.isDir(FS.stat(full).mode)) walk(full, rel);
      else out[rel] = new TextDecoder().decode(FS.readFile(full));
    }
  };
  walk(dir, '');
  return out;
}

function clearWorkTree(FS, cur, root) {
  for (const name of FS.readdir(cur)) {
    if (name === '.' || name === '..') continue;
    if (cur === root && name === '.git') continue; // never touch git metadata
    removeEntry(FS, `${cur}/${name}`);
  }
}

/** Remove everything under `dir`, including .git. */
function clearAll(FS, dir) {
  for (const name of FS.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    removeEntry(FS, `${dir}/${name}`);
  }
}

function removeEntry(FS, full) {
  if (FS.isDir(FS.stat(full).mode)) {
    for (const name of FS.readdir(full)) {
      if (name === '.' || name === '..') continue;
      removeEntry(FS, `${full}/${name}`);
    }
    FS.rmdir(full);
  } else {
    FS.unlink(full);
  }
}

function mkdirp(FS, dir) {
  let cur = '';
  for (const part of dir.split('/').filter(Boolean)) {
    cur += `/${part}`;
    if (!pathExists(FS, cur)) tryMkdir(FS, cur);
  }
}

function dirname(path) {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '' : path.slice(0, i);
}

function pathExists(FS, path) {
  try {
    FS.stat(path);
    return true;
  } catch {
    return false;
  }
}

function tryMkdir(FS, path) {
  try {
    FS.mkdir(path);
  } catch {
    /* already exists */
  }
}

// ── output parsing ──────────────────────────────────────────────────────────

/** Parse `git status --short` lines into structured entries. */
function parseStatus(out) {
  return out
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter(Boolean)
    .map((line) => {
      const x = line[0];
      const y = line[1];
      let path = line.slice(3);
      const arrow = path.indexOf(' -> '); // renames: "old -> new"
      if (arrow >= 0) path = path.slice(arrow + 4);
      return { x, y, path, label: statusLabel(x, y) };
    });
}

function statusLabel(x, y) {
  if (x === '?' || y === '?') return 'Untracked';
  const code = y !== ' ' ? y : x;
  return (
    {
      M: 'Modified',
      A: 'Added',
      D: 'Deleted',
      R: 'Renamed',
      C: 'Copied',
      T: 'Type changed',
    }[code] ?? 'Changed'
  );
}

/** Parse `git log` output into `{ hash, author, date, message }` commits. */
function parseLog(out) {
  const commits = [];
  let cur = null;
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const head = line.match(/^commit\s+([0-9a-f]{7,40})/);
    if (head) {
      if (cur) commits.push(cur);
      cur = { hash: head[1], author: '', date: '', message: '' };
    } else if (cur) {
      if (line.startsWith('Author:')) cur.author = line.slice(7).trim();
      else if (line.startsWith('Date:')) cur.date = line.slice(5).trim();
      else if (line.trim())
        cur.message += (cur.message ? '\n' : '') + line.trim();
    }
  }
  if (cur) commits.push(cur);
  return commits;
}
