/** The cloud-variable symbol Scratch prefixes every cloud var name with. */
const CLOUD_PREFIX = '☁ ';

/**
 * Polls a project's public cloud-data log and emits an event for each new
 * activity. Unlike the WebSocket `set` events on {@link import('./cloud.js').Cloud},
 * this works **without login** and reports the acting user, the exact server
 * timestamp, and variable creation/deletion (`create`/`delete`) — none of which
 * the live socket carries. The trade-off is latency: changes surface on the next
 * poll, not instantly.
 *
 * Build one with `cloud.events()`.
 *
 * @example
 * const events = new Cloud({ projectId: 123456789 }).events();
 * events.on('set', (a) => console.log(`${a.user} set ${a.name} = ${a.value}`));
 * events.on('create', (a) => console.log(`${a.user} created ${a.name}`));
 * await events.start();
 */
export class CloudEvents {
  /**
   * @param {import('./cloud.js').Cloud} cloud
   * @param {object} [options]
   * @param {number} [options.interval] - Seconds between log polls (default 1).
   * @param {number} [options.limit] - Rows fetched per poll (default 25).
   */
  constructor(cloud, { interval = 1, limit = 25 } = {}) {
    /** @type {import('./cloud.js').Cloud} */
    this.cloud = cloud;
    /** @type {number} */
    this.interval = interval;
    /** @type {number} */
    this.limit = limit;
    /** @type {boolean} */
    this.running = false;

    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    this._lastTimestamp = 0;
    this._timer = null;
  }

  /**
   * Subscribe to an event: `ready` (initial poll done), `set`, `create`,
   * `delete`, or `error` (`Error`). Activity events receive
   * `{ user, verb, name, value, timestamp }`.
   *
   * @param {'ready' | 'set' | 'create' | 'delete' | 'error'} event
   * @param {(payload?: any) => void} listener
   * @returns {this}
   */
  on(event, listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(listener);
    return this;
  }

  /** Remove a listener. @param {string} event @param {Function} listener @returns {this} */
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
        // a throwing listener mustn't break the poll loop
      }
    }
  }

  /**
   * Seed the cursor from the current log (so only *future* activity fires),
   * emit `ready`, and begin polling. Resolves once polling has started.
   *
   * @returns {Promise<this>}
   */
  async start() {
    if (this.running) return this;
    this.running = true;
    try {
      const logs = await this.cloud.logs({ limit: this.limit });
      if (logs.length > 0) this._lastTimestamp = logs[0].timestamp;
    } catch {
      // a failed initial fetch just means we start from timestamp 0
    }
    this._emit('ready');
    this._loop();
    return this;
  }

  /** Stop polling. */
  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  async _loop() {
    if (!this.running) return;
    try {
      const logs = await this.cloud.logs({ limit: this.limit });
      // The log is newest-first; replay oldest-first so events arrive in order.
      for (const activity of [...logs].reverse()) {
        if (activity.timestamp <= this._lastTimestamp) continue;
        this._lastTimestamp = activity.timestamp;
        // Scratch verbs are e.g. "set_var", "create_var", "del_var".
        const type = String(activity.verb ?? 'set_var').replace(/_var$/, '');
        const event = type === 'del' ? 'delete' : type;
        this._emit(event, {
          user: activity.user,
          verb: activity.verb,
          name: stripPrefix(String(activity.name ?? '')),
          value: activity.value,
          timestamp: activity.timestamp,
        });
      }
    } catch (error) {
      this._emit('error', error);
    }
    if (this.running) {
      this._timer = setTimeout(() => this._loop(), this.interval * 1000);
    }
  }
}

/** @param {string} name @returns {string} */
function stripPrefix(name) {
  return name.startsWith(CLOUD_PREFIX) ? name.slice(CLOUD_PREFIX.length) : name;
}
