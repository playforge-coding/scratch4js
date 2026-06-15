import { ScratchAPIError } from './http.js';
import { CloudRequests } from './cloud-requests.js';
import { CloudEvents } from './cloud-events.js';
import { CloudStorage } from './cloud-storage.js';

/** The cloud-variable symbol Scratch prefixes every cloud var name with. */
const CLOUD_PREFIX = '☁ ';

const SCRATCH_CLOUD_HOST = 'wss://clouddata.scratch.mit.edu';
const SCRATCH_LOGS_HOST = 'https://clouddata.scratch.mit.edu';

/**
 * A live connection to a project's cloud variables over Scratch's cloud-data
 * WebSocket (the same protocol the Scratch player uses). Set and read `☁`
 * variables, listen for changes, or build a {@link CloudRequests} server on top.
 *
 * Create one from a logged-in session — `session.cloud(projectId)` — which fills
 * in the auth cookie, username and origin for you. Connecting to Scratch's cloud
 * requires login; reading the public {@link Cloud#logs logs} does not.
 *
 * Values are limited to {@link Cloud#lengthLimit} characters and, unless
 * {@link Cloud#allowNonNumeric} is set, must be numeric — that's a Scratch rule,
 * not ours.
 *
 * @example
 * const session = await ScratchSession.login('user', 'pass');
 * const cloud = session.cloud(123456789);
 * await cloud.connect();
 * cloud.on('set', ({ name, value }) => console.log(name, '=', value));
 * await cloud.setVar('score', 100);
 */
export class Cloud {
  /**
   * @param {object} options
   * @param {number | string} options.projectId - The project whose cloud to join.
   * @param {string} [options.username] - Username sent in the handshake / sets.
   * @param {string} [options.cookie] - `Cookie` header (e.g. `scratchsessionsid=…;`).
   * @param {string} [options.origin] - `Origin` header for the WebSocket.
   * @param {string} [options.userAgent] - `User-Agent` header for the WebSocket.
   * @param {string} [options.host] - WebSocket URL (defaults to Scratch's).
   * @param {string} [options.logsHost] - Base URL of the cloud-data log API.
   * @param {boolean} [options.allowNonNumeric] - Permit non-numeric values.
   * @param {number} [options.lengthLimit] - Max value length (Scratch caps at 256).
   * @param {number} [options.rateLimit] - Min seconds between sets (default 0.1).
   * @param {new (url: string, options?: any) => any} [options.WebSocket] - WebSocket
   *   implementation. Defaults to the `ws` package, then `globalThis.WebSocket`.
   *   Note: the global/browser WebSocket can't send the auth cookie, so on
   *   Node the `ws` package is preferred.
   * @param {typeof fetch} [options.fetch] - `fetch` used for {@link Cloud#logs}.
   */
  constructor({
    projectId,
    username = 'player1000',
    cookie,
    origin,
    userAgent,
    host = SCRATCH_CLOUD_HOST,
    logsHost = SCRATCH_LOGS_HOST,
    allowNonNumeric = false,
    lengthLimit = 256,
    rateLimit = 0.1,
    WebSocket: WebSocketCtor,
    fetch: fetchImpl,
  } = {}) {
    if (projectId === undefined || projectId === null) {
      throw new ScratchAPIError('Cloud requires a projectId.');
    }
    /** @type {number | string} */
    this.projectId = projectId;
    /** @type {string} */
    this.username = username;
    /** @type {string | undefined} */
    this.cookie = cookie;
    /** @type {string | undefined} */
    this.origin = origin;
    /** @type {string | undefined} */
    this.userAgent = userAgent;
    /** @type {string} The WebSocket URL of the cloud server. */
    this.host = host;
    /** @type {string} Base URL of the cloud-data log API. */
    this.logsHost = logsHost;
    /** @type {boolean} Whether non-numeric values are allowed. */
    this.allowNonNumeric = allowNonNumeric;
    /** @type {number} Max value length. */
    this.lengthLimit = lengthLimit;
    /** @type {number} Minimum seconds between variable sets. */
    this.rateLimit = rateLimit;

    this._WebSocketCtor = WebSocketCtor;
    this._fetch = fetchImpl ?? globalThis.fetch;

    /** @type {any} The open socket, or `null` when disconnected. */
    this._socket = null;
    /** @type {boolean} Whether a connection is currently established. */
    this.connected = false;
    /** @type {Record<string, string>} Latest value seen for each variable. */
    this._vars = {};
    /** @type {Map<string, Set<Function>>} Registered event listeners. */
    this._listeners = new Map();
    /** Tail of the send queue — serializes sends and applies the rate limit. */
    this._sendChain = Promise.resolve();
    this._lastSent = 0;
  }

  // ---- Events -------------------------------------------------------------

  /**
   * Subscribe to an event: `set` (`{ name, value }` on every variable change),
   * `connect`, `disconnect`, or `error` (`Error`).
   *
   * @param {'set' | 'connect' | 'disconnect' | 'error'} event
   * @param {(payload?: any) => void} listener
   * @returns {this}
   */
  on(event, listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(listener);
    return this;
  }

  /**
   * Remove a listener previously registered with {@link Cloud#on}.
   *
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  off(event, listener) {
    this._listeners.get(event)?.delete(listener);
    return this;
  }

  /** @param {string} event @param {any} [payload] */
  _emit(event, payload) {
    for (const listener of this._listeners.get(event) ?? []) {
      try {
        listener(payload);
      } catch {
        // A throwing listener must not take down the socket loop.
      }
    }
  }

  // ---- Connection ---------------------------------------------------------

  /**
   * Open the WebSocket and perform the handshake. Resolves once connected.
   *
   * @returns {Promise<this>}
   */
  async connect() {
    if (this.connected) return this;
    const WebSocketImpl = await this._resolveWebSocket();

    await new Promise((resolve, reject) => {
      let socket;
      try {
        // `ws`-style options (headers/origin) — ignored by browser WebSocket.
        const headers = {};
        if (this.cookie) headers.Cookie = this.cookie;
        if (this.userAgent) headers['User-Agent'] = this.userAgent;
        if (this.origin) headers.Origin = this.origin;
        socket = new WebSocketImpl(this.host, { headers, origin: this.origin });
      } catch (cause) {
        reject(
          new ScratchAPIError(`Could not open cloud socket: ${cause.message}`, {
            url: this.host,
          }),
        );
        return;
      }
      this._socket = socket;

      const onOpen = () => {
        this.connected = true;
        this._handshake();
        this._emit('connect');
        resolve(this);
      };
      const onError = (event) => {
        const message = event?.message || event?.error?.message || 'unknown';
        if (!this.connected) {
          reject(
            new ScratchAPIError(`Cloud connection failed: ${message}`, {
              url: this.host,
            }),
          );
        }
        this._emit('error', new ScratchAPIError(`Cloud error: ${message}`));
      };
      const onClose = () => {
        this.connected = false;
        this._socket = null;
        this._emit('disconnect');
      };

      socket.addEventListener('open', onOpen);
      socket.addEventListener('message', (event) => this._receive(event.data));
      socket.addEventListener('error', onError);
      socket.addEventListener('close', onClose);
    });
    return this;
  }

  /** Close the socket. @returns {Promise<void>} */
  async disconnect() {
    const socket = this._socket;
    this.connected = false;
    this._socket = null;
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore — we're tearing down anyway.
      }
    }
  }

  /** Reconnect (close, then open again). @returns {Promise<this>} */
  async reconnect() {
    await this.disconnect();
    return this.connect();
  }

  async _resolveWebSocket() {
    if (this._WebSocketCtor) return this._WebSocketCtor;
    // Prefer `ws`: unlike the global/browser WebSocket it can send the auth
    // cookie and Origin that Scratch's cloud server requires.
    try {
      const mod = await import('ws');
      this._WebSocketCtor = mod.default ?? mod.WebSocket;
    } catch {
      if (typeof globalThis.WebSocket === 'function') {
        this._WebSocketCtor = globalThis.WebSocket;
      } else {
        throw new ScratchAPIError(
          'No WebSocket available. Install `ws` or pass a `WebSocket` implementation.',
        );
      }
    }
    return this._WebSocketCtor;
  }

  _handshake() {
    this._raw({
      method: 'handshake',
      user: this.username,
      project_id: this.projectId,
    });
  }

  /**
   * Handle one raw WebSocket frame (one or more newline-separated JSON packets).
   *
   * @param {string | Buffer | ArrayBuffer} data
   */
  _receive(data) {
    const text =
      typeof data === 'string'
        ? data
        : Buffer.isBuffer?.(data)
          ? data.toString('utf8')
          : new TextDecoder().decode(data);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let packet;
      try {
        packet = JSON.parse(line);
      } catch {
        continue; // e.g. a plain-text server banner — not a cloud packet.
      }
      if (packet.method === 'set' && typeof packet.name === 'string') {
        const name = packet.name.startsWith(CLOUD_PREFIX)
          ? packet.name.slice(CLOUD_PREFIX.length)
          : packet.name;
        const value = packet.value;
        this._vars[name] = value;
        this._emit('set', { name, value, user: packet.user });
      }
    }
  }

  // ---- Reading ------------------------------------------------------------

  /**
   * The latest value seen for a variable since connecting (from the socket
   * stream). Use {@link Cloud#logs} to read history without a connection.
   *
   * @param {string} name - Variable name (with or without the `☁ ` prefix).
   * @returns {string | undefined}
   */
  getVar(name) {
    return this._vars[stripPrefix(name)];
  }

  /** A snapshot of every variable value seen so far. @returns {Record<string, string>} */
  getAllVars() {
    return { ...this._vars };
  }

  /**
   * Read the project's public cloud-data activity log (no login required).
   *
   * @param {object} [options]
   * @param {string} [options.variable] - Only return activity for this variable.
   * @param {number} [options.limit] - Max rows (default 100).
   * @param {number} [options.offset] - Rows to skip (default 0).
   * @returns {Promise<Array<{ user: string, verb: string, name: string, value: string, timestamp: number }>>}
   */
  async logs({ variable, limit = 100, offset = 0 } = {}) {
    if (typeof this._fetch !== 'function') {
      throw new ScratchAPIError('No fetch available to read cloud logs.');
    }
    const url = `${this.logsHost}/logs?projectid=${encodeURIComponent(
      this.projectId,
    )}&limit=${limit}&offset=${offset}`;
    const response = await this._fetch(url);
    if (!response.ok) {
      throw new ScratchAPIError(
        `GET ${url} → ${response.status} ${response.statusText}`,
        { status: response.status, url, method: 'GET' },
      );
    }
    /** @type {any[]} */
    let data = await response.json();
    if (variable !== undefined) {
      const want = CLOUD_PREFIX + stripPrefix(variable);
      data = data.filter((row) => row.name === want);
    }
    return data;
  }

  // ---- Writing ------------------------------------------------------------

  /**
   * Set a cloud variable. Serialized and rate-limited behind earlier sets.
   *
   * @param {string} name - Variable name (the `☁ ` prefix is added for you).
   * @param {string | number} value
   * @returns {Promise<void>}
   */
  setVar(name, value) {
    this._assertValue(value);
    return this._enqueue({
      method: 'set',
      name: CLOUD_PREFIX + stripPrefix(name),
      value,
      user: this.username,
      project_id: this.projectId,
    });
  }

  /**
   * Set several cloud variables. They're sent in order, each rate-limited.
   *
   * @param {Record<string, string | number>} values - `name → value`.
   * @returns {Promise<void>}
   */
  async setVars(values) {
    for (const [name, value] of Object.entries(values)) {
      await this.setVar(name, value);
    }
  }

  /**
   * Validate a value against Scratch's rules (length, and numeric-only unless
   * {@link Cloud#allowNonNumeric}).
   *
   * @param {string | number} value
   */
  _assertValue(value) {
    const text = String(value);
    if (text.length > this.lengthLimit) {
      throw new ScratchAPIError(
        `Cloud value exceeds the ${this.lengthLimit}-character limit.`,
      );
    }
    if (!this.allowNonNumeric) {
      const digits = text.replace(/[.-]/g, '');
      if (digits !== '' && !/^[0-9]+$/.test(digits)) {
        throw new ScratchAPIError(
          'Cloud value must be numeric (set allowNonNumeric to override).',
        );
      }
    }
  }

  /**
   * Queue a packet so sends are serialized and the rate limit is honoured.
   *
   * @param {object} packet
   * @returns {Promise<void>}
   */
  _enqueue(packet) {
    this._sendChain = this._sendChain.then(async () => {
      if (!this.connected) await this.connect();
      const wait = this._lastSent + this.rateLimit * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      this._raw(packet);
      this._lastSent = Date.now();
    });
    return this._sendChain;
  }

  /** Send a single packet immediately (no queueing). @param {object} packet */
  _raw(packet) {
    if (!this._socket) {
      throw new ScratchAPIError('Cloud socket is not connected.');
    }
    this._socket.send(JSON.stringify(packet) + '\n');
  }

  // ---- Higher-level helpers ----------------------------------------------

  /**
   * Build a {@link CloudRequests} server on this connection — handle named
   * requests from a Scratch project and respond over the cloud.
   *
   * @param {ConstructorParameters<typeof CloudRequests>[1]} [options]
   * @returns {CloudRequests}
   */
  requests(options) {
    return new CloudRequests(this, options);
  }

  /**
   * Watch this project's cloud activity by polling its public log. Reports the
   * acting user, exact timestamp and `create`/`delete` events — and works
   * without login (the WebSocket `set` events don't carry the user).
   *
   * @param {ConstructorParameters<typeof CloudEvents>[1]} [options]
   * @returns {CloudEvents}
   */
  events(options) {
    return new CloudEvents(this, options);
  }

  /**
   * Build a {@link CloudStorage} server on this connection — a cloud-backed
   * key-value store the Scratch project reads and writes through requests.
   *
   * @param {ConstructorParameters<typeof CloudRequests>[1]} [options]
   * @returns {CloudStorage}
   */
  storage(options) {
    return new CloudStorage(this, options);
  }
}

/** @param {string} name @returns {string} */
function stripPrefix(name) {
  return name.startsWith(CLOUD_PREFIX) ? name.slice(CLOUD_PREFIX.length) : name;
}

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
