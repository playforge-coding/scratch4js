import { encode, decode } from './encoding.js';

/**
 * The default cloud variables a response is striped across, cycling through
 * `FROM_HOST_1` … `FROM_HOST_9`. Matches scratchattach's defaults so the same
 * Scratch project works unchanged.
 */
const DEFAULT_RESPONSE_VARS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A "cloud requests" server: a Scratch project sends a named request (with
 * arguments) by writing an encoded value to the `☁ TO_HOST` variable, and this
 * class decodes it, runs your handler, and streams the (encoded) return value
 * back over the `☁ FROM_HOST_n` variables — chunked to fit Scratch's 256-char
 * cloud limit, exactly like
 * {@link https://github.com/TimMcCool/scratchattach scratchattach}. That means a
 * project built for scratchattach's request/response sprite talks to this server
 * without changes.
 *
 * Build one from a {@link Cloud}: `cloud.requests()`.
 *
 * @example
 * const cloud = session.cloud(123456789);
 * const requests = cloud.requests();
 * requests.request('ping', () => 'pong');
 * requests.request('add', ([a, b]) => Number(a) + Number(b));
 * requests.request('greet', async ([name]) => `hello ${name}!`);
 * await requests.start();
 */
export class CloudRequests {
  /**
   * @param {import('./cloud.js').Cloud} cloud
   * @param {object} [options]
   * @param {string} [options.requestVar] - Variable the project writes requests to (default `TO_HOST`).
   * @param {string[]} [options.usedCloudVars] - Suffixes of the `FROM_HOST_*` response vars.
   */
  constructor(cloud, { requestVar = 'TO_HOST', usedCloudVars } = {}) {
    /** @type {import('./cloud.js').Cloud} */
    this.cloud = cloud;
    /** @type {string} */
    this.requestVar = requestVar;
    /** @type {string[]} */
    this.usedCloudVars = usedCloudVars ?? DEFAULT_RESPONSE_VARS;

    /** @type {Map<string, (args: string[], ctx: RequestContext) => any>} */
    this._handlers = new Map();
    /** @type {Map<string, (ctx: RequestContext) => void>} */
    this._events = new Map();
    /** @type {boolean} */
    this.running = false;

    /** Partial requests being reassembled, keyed by request id. */
    this._parts = new Map();
    /** Request ids already answered (most-recent first, capped). */
    this._responded = [];
    /** Recent responses, so the project can re-request a dropped packet. */
    this._packetMemory = [];
    /** Index into {@link CloudRequests#usedCloudVars} for the next response set. */
    this._currentVar = 0;
    /** Serializes whole responses so two requests never interleave packets. */
    this._responseChain = Promise.resolve();

    this._onSet = this._onSet.bind(this);
  }

  /**
   * Register a request handler. The handler receives the decoded string
   * arguments (an array) and a {@link RequestContext}, and returns the value to
   * send back: a string, a number, or an array of strings (sent as a list). It
   * may be async.
   *
   * @param {string} name
   * @param {(args: string[], ctx: RequestContext) => any} handler
   * @returns {this}
   */
  request(name, handler) {
    this._handlers.set(name, handler);
    return this;
  }

  /** Remove a handler added with {@link CloudRequests#request}. @param {string} name */
  removeRequest(name) {
    this._handlers.delete(name);
    return this;
  }

  /**
   * Subscribe to a lifecycle event: `request` (a handled request arrived),
   * `unknownRequest` (no handler), or `error` (`{ error, ctx }`).
   *
   * @param {'request' | 'unknownRequest' | 'error'} event
   * @param {(payload: any) => void} listener
   * @returns {this}
   */
  on(event, listener) {
    this._events.set(event, listener);
    return this;
  }

  /** @param {string} event @param {any} payload */
  _event(event, payload) {
    try {
      this._events.get(event)?.(payload);
    } catch {
      // a misbehaving event listener shouldn't break request handling
    }
  }

  /**
   * Connect (if needed) and start handling requests. Resolves once listening.
   *
   * @returns {Promise<this>}
   */
  async start() {
    if (this.running) return this;
    this.running = true;
    this.cloud.on('set', this._onSet);
    if (!this.cloud.connected) await this.cloud.connect();
    return this;
  }

  /** Stop handling requests (the underlying cloud stays connected). */
  stop() {
    this.running = false;
    this.cloud.off('set', this._onSet);
  }

  /**
   * Handle a `set` event from the cloud. Mirrors scratchattach's wire protocol:
   * the value is `"<rawRequest>.<requestId>"`; a leading `-` marks a continuation
   * chunk, and a 9-digit id ending in `9` is a dropped-packet re-request.
   *
   * @param {{ name: string, value: any }} activity
   */
  _onSet({ name, value }) {
    if (name !== this.requestVar) return;
    const text = String(value);
    const dot = text.indexOf('.');
    if (dot === -1) return;
    const rawRequest = text.slice(0, dot);
    const requestId = text.slice(dot + 1);

    // A dropped packet was re-requested: resend it from memory.
    if (requestId.length === 9 && requestId.endsWith('9')) {
      this._resendPacket(requestId.slice(0, -1), Number(rawRequest));
      return;
    }

    // Already answered (e.g. a duplicate from the log fallback) — ignore.
    if (this._responded.includes(requestId)) return;

    // A continuation chunk of a larger request: buffer it and wait for the rest.
    if (text[0] === '-') {
      if (!this._parts.has(requestId)) this._parts.set(requestId, []);
      this._parts.get(requestId).push(rawRequest.slice(1));
      return;
    }

    this._responded.unshift(requestId);
    this._responded = this._responded.slice(0, 35);

    // Reassemble any earlier chunks, then this final piece.
    let assembled = '';
    if (this._parts.has(requestId)) {
      assembled = this._parts.get(requestId).join('');
      this._parts.delete(requestId);
    }
    assembled += rawRequest;

    const decoded = decode(assembled);
    const args = decoded.split('&');
    const requestName = args.shift();

    /** @type {RequestContext} */
    const ctx = { name: requestName, requestId, args, requester: null };

    const handler = this._handlers.get(requestName);
    if (!handler) {
      this._event('unknownRequest', ctx);
      return;
    }
    this._event('request', ctx);
    // Run concurrently; the response is serialized inside _handle.
    this._handle(handler, ctx);
  }

  /**
   * Run a handler and queue its (parsed) output for transmission.
   *
   * @param {(args: string[], ctx: RequestContext) => any} handler
   * @param {RequestContext} ctx
   */
  async _handle(handler, ctx) {
    let output;
    try {
      output = await handler(ctx.args, ctx);
    } catch (error) {
      this._event('error', { error, ctx });
      output = [`Error in request ${ctx.name}`, 'Check the server console'];
    }
    this._responseChain = this._responseChain
      .then(() => this._parseOutput(ctx.requestId, output))
      .catch(() => {});
  }

  /**
   * Encode a handler's return value and chunk it onto the response variables.
   *
   * @param {string} requestId
   * @param {string | number | string[] | null | undefined} output
   */
  async _parseOutput(requestId, output) {
    if (output === null || output === undefined) return;

    // Integer-only responses to ids ending in "0" are sent verbatim (faster on
    // the Scratch side); validation code 3222 marks them. Everything else is
    // encoded; lists join each encoded item with "89" (a newline). 2222 marks
    // the final packet.
    let sendAsInteger = false;
    if (String(requestId).endsWith('0')) {
      const numeric =
        typeof output !== 'boolean' &&
        !String(output).includes('-') &&
        /^[0-9]+$/.test(String(output));
      sendAsInteger = numeric;
    }

    let payload;
    if (sendAsInteger) {
      payload = String(output);
    } else if (Array.isArray(output)) {
      payload = output.map((item) => encode(item) + '89').join('');
    } else {
      payload = encode(output === '' ? '-' : output);
    }
    await this._respond(requestId, payload, sendAsInteger ? 3222 : 2222);
  }

  /**
   * Send an (already encoded) payload back, splitting it across as many packets
   * as the cloud length limit needs.
   *
   * @param {string} requestId
   * @param {string} payload
   * @param {number} validation - Trailing code on the final packet (2222/3222).
   */
  async _respond(requestId, payload, validation = 2222) {
    const memory = { rid: requestId, packets: {} };
    let remaining = payload;
    const limit = this.cloud.lengthLimit - (String(requestId).length + 6);
    let i = 0;

    while (remaining !== '') {
      if (remaining.length > limit) {
        const part = remaining.slice(0, limit);
        remaining = remaining.slice(limit);
        i += 1;
        const iter = String(i).padStart(3, '0');
        const value = `${part}.${requestId}${iter}1`;
        memory.packets[i] = value;
        await this._setResponseVar(value);
      } else {
        await this._setResponseVar(`${remaining}.${requestId}${validation}`);
        this._packetMemory.push(memory);
        if (this._packetMemory.length > 15) this._packetMemory.shift();
        remaining = '';
      }
    }
  }

  /**
   * Re-send a single previously-sent packet that the project says it missed.
   *
   * @param {string} requestId
   * @param {number} packetId
   */
  _resendPacket(requestId, packetId) {
    const memory = this._packetMemory.find((m) => m.rid === requestId);
    const value = memory?.packets[packetId];
    if (value === undefined) return;
    this._responseChain = this._responseChain
      .then(() => this._setResponseVar(value))
      .catch(() => {});
  }

  /**
   * Write one response packet to the next `FROM_HOST_*` variable, cycling
   * through {@link CloudRequests#usedCloudVars}.
   *
   * @param {string} value
   */
  async _setResponseVar(value) {
    const suffix = this.usedCloudVars[this._currentVar];
    this._currentVar = (this._currentVar + 1) % this.usedCloudVars.length;
    await this.cloud.setVar(`FROM_HOST_${suffix}`, value);
  }
}

/**
 * @typedef {object} RequestContext
 * @property {string} name - The request name.
 * @property {string[]} args - Decoded string arguments.
 * @property {string} requestId - The id the project assigned this request.
 * @property {string | null} requester - The requesting user, if known (the
 *   WebSocket stream doesn't carry it; use {@link import('./cloud.js').Cloud#logs}).
 */
