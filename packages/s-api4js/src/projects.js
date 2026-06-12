import { ScratchAPIError } from './http.js';

/** @typedef {import('./users.js').Page} Page */

/** Common asset extensions → MIME type for the upload `Content-Type` header. */
const ASSET_MIME = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};

/**
 * Projects: public reads plus the authenticated writes that let a logged-in
 * session edit a project. Reached through {@link ScratchSession#projects}.
 *
 * The headline method is {@link Projects#save} — given a project id and a
 * {@link https://github.com/playforge-coding/scratch4js scratch4js} `Project`
 * (or any `{ json, assets }`), it uploads the assets and writes the new
 * `project.json`, i.e. it saves an edited `.sb3` back to the website.
 */
export class Projects {
  /** @param {import('./session.js').ScratchSession} session */
  constructor(session) {
    /** @type {import('./session.js').ScratchSession} */
    this.session = session;
  }

  // ---- Public reads -------------------------------------------------------

  /**
   * Fetch a project's metadata.
   *
   * @param {number | string} id
   * @returns {Promise<any>} `{ id, title, description, author, stats, ... }`.
   */
  get(id) {
    return this.session.apiGet(`/projects/${id}`);
  }

  /**
   * A project's remixes.
   *
   * @param {number | string} id
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  remixes(id, page = {}) {
    return this.session.apiGet(`/projects/${id}/remixes`, page);
  }

  /**
   * Top-level comments on a project (replies excluded). Scratch keys project
   * comments by author, so this resolves the author from the project first.
   *
   * @param {number | string} id
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  async comments(id, page = {}) {
    const project = await this.get(id);
    const username = project?.author?.username;
    if (!username) {
      throw new ScratchAPIError(
        `Cannot resolve the author of project ${id} to read its comments.`,
      );
    }
    return this.session.apiGet(
      `/users/${encodeURIComponent(username)}/projects/${id}/comments`,
      page,
    );
  }

  // ---- Downloading (read the editable project) ---------------------------

  /**
   * Fetch the short-lived `project_token` needed to read a project's JSON from
   * the project store. Sent with the session's `X-Token` when logged in, so it
   * works for your own unshared projects too.
   *
   * @param {number | string} id
   * @returns {Promise<string | undefined>}
   */
  async token(id) {
    const meta = await this.session.authedJson(
      `${this.session.apiHost}/projects/${id}`,
    );
    return meta?.project_token;
  }

  /**
   * Download a project's `project.json` (the inverse of {@link Projects#setJson}).
   * Resolves a `project_token` automatically unless you pass one.
   *
   * @param {number | string} id
   * @param {string} [token] - A `project_token` from {@link Projects#token}.
   * @returns {Promise<object>} The parsed `project.json`.
   */
  async getJson(id, token) {
    const t = token ?? (await this.token(id));
    const url = `${this.session.projectsHost}/${id}${
      t ? `?token=${encodeURIComponent(t)}` : ''
    }`;
    return this.session.authedJson(url);
  }

  /**
   * Download one asset (costume or sound) by its `md5ext` filename.
   *
   * @param {string} md5ext - `<md5>.<ext>`.
   * @returns {Promise<Uint8Array>}
   */
  async downloadAsset(md5ext) {
    const url = `${this.session.assetsHost}/${md5ext}`;
    const response = await this.session.authedFetch(url);
    if (!response.ok) {
      throw new ScratchAPIError(
        `GET ${url} → ${response.status} ${response.statusText}`,
        { status: response.status, url, method: 'GET' },
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Download a complete, editable project: its `project.json` plus every
   * costume/sound it references. The shape it returns (`{ json, assets }`,
   * where `assets` is a `Map` of `md5ext → Uint8Array`) is exactly what
   * {@link Projects#save} accepts and what a
   * {@link https://github.com/playforge-coding/scratch4js scratch4js} `Project`
   * is built from, so you can round-trip: download → edit → save.
   *
   * @param {number | string} id
   * @returns {Promise<{ json: object, assets: Map<string, Uint8Array> }>}
   */
  async download(id) {
    const token = await this.token(id);
    const json = await this.getJson(id, token);
    const assets = new Map();
    for (const md5ext of collectAssetIds(json)) {
      assets.set(md5ext, await this.downloadAsset(md5ext));
    }
    return { json, assets };
  }

  // ---- Authenticated writes ----------------------------------------------

  /**
   * Update a project's editable metadata. Any omitted field is left unchanged.
   * Requires a logged-in session that owns the project.
   *
   * @param {number | string} id
   * @param {object} fields
   * @param {string} [fields.title]
   * @param {string} [fields.instructions]
   * @param {string} [fields.description] - The "Notes and Credits" text.
   * @returns {Promise<any>} The updated project metadata.
   */
  setMetadata(id, fields) {
    this.session.requireAuth();
    const body = {};
    if (fields.title !== undefined) body.title = fields.title;
    if (fields.instructions !== undefined)
      body.instructions = fields.instructions;
    if (fields.description !== undefined) body.description = fields.description;
    return this.session.authedJson(
      `${this.session.apiHost}/projects/${id}`,
      { method: 'PUT', body: JSON.stringify(body) },
      { 'Content-Type': 'application/json' },
    );
  }

  /** @param {number | string} id @param {string} title */
  setTitle(id, title) {
    return this.setMetadata(id, { title });
  }

  /** @param {number | string} id @param {string} instructions */
  setInstructions(id, instructions) {
    return this.setMetadata(id, { instructions });
  }

  /** @param {number | string} id @param {string} description */
  setDescription(id, description) {
    return this.setMetadata(id, { description });
  }

  /**
   * Overwrite a project's `project.json` (its scripts, sprites, costumes…).
   * This is the core of saving an edited project. Note: any costume/sound the
   * JSON references by `md5ext` must already exist on Scratch's asset server —
   * use {@link Projects#uploadAsset}, or just call {@link Projects#save} which
   * does both. Requires a logged-in session that owns the project.
   *
   * @param {number | string} id
   * @param {object | string} json - The `project.json` (object or JSON string).
   * @returns {Promise<any>} `{ status: 'ok', ... }` on success.
   */
  setJson(id, json) {
    this.session.requireAuth();
    const body = typeof json === 'string' ? json : JSON.stringify(json);
    return this.session.authedJson(
      `${this.session.projectsHost}/${id}`,
      { method: 'PUT', body },
      { 'Content-Type': 'application/json' },
    );
  }

  /**
   * Upload one asset (costume or sound) to Scratch's content-addressed asset
   * store. The store is keyed by MD5, so re-uploading an existing asset is a
   * harmless no-op. Requires a logged-in session.
   *
   * @param {string} md5ext - The asset filename, `<md5>.<ext>` (e.g. `abc….svg`).
   * @param {Uint8Array | ArrayBuffer | Buffer} bytes - The raw asset bytes.
   * @returns {Promise<any>} The asset server's response (`{ status, ... }`).
   */
  uploadAsset(md5ext, bytes) {
    this.session.requireAuth();
    const ext = md5ext.split('.').pop()?.toLowerCase() ?? '';
    const contentType = ASSET_MIME[ext] ?? 'application/octet-stream';
    return this.session.authedJson(
      `${this.session.assetsHost}/${md5ext}`,
      { method: 'POST', body: toBytes(bytes) },
      { 'Content-Type': contentType },
    );
  }

  /**
   * Save an edited project back to Scratch: upload every asset it references,
   * then write its `project.json`. Accepts a
   * {@link https://github.com/playforge-coding/scratch4js scratch4js} `Project`
   * (anything with a `.json` object and an `.assets` `Map`) or a plain
   * `{ json, assets }`. Requires a logged-in session that owns the project.
   *
   * @example
   * import { Project } from 'scratch4js';
   * const project = await Project.load(await readFile('game.sb3'));
   * project.sprite('Sprite1').x = 0;
   * await session.projects.save(123456789, project);
   *
   * @param {number | string} id
   * @param {{ json: object | string, assets?: AssetSource }} project
   * @returns {Promise<any>} The `setJson` result once everything is saved.
   */
  async save(id, project) {
    this.session.requireAuth();
    const { json, assets } = normalizeProject(project);
    for (const [md5ext, bytes] of assets) {
      await this.uploadAsset(md5ext, bytes);
    }
    return this.setJson(id, json);
  }

  /**
   * Publish (share) a project so it's publicly visible. Requires a logged-in
   * session that owns the project.
   *
   * @param {number | string} id
   * @returns {Promise<any>} The share endpoint's response.
   */
  share(id) {
    this.session.requireAuth();
    return this.session.authedJson(
      `${this.session.apiHost}/proxy/projects/${id}/share`,
      { method: 'PUT' },
    );
  }

  /**
   * Unpublish (unshare) a project. Requires a logged-in session that owns the
   * project.
   *
   * @param {number | string} id
   * @returns {Promise<any>} The unshare endpoint's response.
   */
  unshare(id) {
    this.session.requireAuth();
    return this.session.authedJson(
      `${this.session.apiHost}/proxy/projects/${id}/unshare`,
      { method: 'PUT' },
    );
  }
}

/**
 * Collect the unique `md5ext` filenames every target in a `project.json`
 * references (costumes and sounds).
 *
 * @param {any} json
 * @returns {string[]}
 */
function collectAssetIds(json) {
  const ids = new Set();
  for (const target of json?.targets ?? []) {
    for (const costume of target.costumes ?? []) {
      if (costume.md5ext) ids.add(costume.md5ext);
    }
    for (const sound of target.sounds ?? []) {
      if (sound.md5ext) ids.add(sound.md5ext);
    }
  }
  return [...ids];
}

/**
 * @typedef {Map<string, Uint8Array> | Record<string, Uint8Array> |
 *   Array<[string, Uint8Array] | { md5ext?: string, name?: string, bytes?: Uint8Array, data?: Uint8Array }>} AssetSource
 */

/**
 * Coerce the many shapes a caller might pass into `{ json, assets }` where
 * `assets` is an array of `[md5ext, Uint8Array]` pairs.
 *
 * @param {any} project
 * @returns {{ json: object | string, assets: Array<[string, Uint8Array]> }}
 */
function normalizeProject(project) {
  if (!project || typeof project !== 'object' || project.json === undefined) {
    throw new ScratchAPIError(
      'save() expects a scratch4js Project or an object like { json, assets }.',
    );
  }
  const json = project.json;
  const source = project.assets;
  /** @type {Array<[string, Uint8Array]>} */
  const assets = [];

  if (!source) {
    // nothing to upload
  } else if (source instanceof Map) {
    for (const [k, v] of source) assets.push([k, toBytes(v)]);
  } else if (Array.isArray(source)) {
    for (const item of source) {
      if (Array.isArray(item)) {
        assets.push([item[0], toBytes(item[1])]);
      } else {
        const key = item.md5ext ?? item.name;
        const value = item.bytes ?? item.data;
        if (key && value) assets.push([key, toBytes(value)]);
      }
    }
  } else if (typeof source === 'object') {
    for (const [k, v] of Object.entries(source)) assets.push([k, toBytes(v)]);
  }

  return { json, assets };
}

/**
 * Normalize asset bytes to a `Uint8Array` (a valid `fetch` body).
 *
 * @param {Uint8Array | ArrayBuffer | Buffer} bytes
 * @returns {Uint8Array}
 */
function toBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  throw new ScratchAPIError('Asset bytes must be a Uint8Array or ArrayBuffer.');
}
