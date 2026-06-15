import { CloudRequests } from './cloud-requests.js';

/**
 * A cloud-backed key-value store for a Scratch project. It runs a
 * {@link CloudRequests} server exposing a fixed set of requests — `get`, `set`,
 * `keys`, `database_names` and `ping` — that read and write one or more
 * {@link import('./database.js').Database databases}. The request names and
 * argument order match
 * {@link https://github.com/TimMcCool/scratchattach scratchattach}'s Cloud
 * Storage, so its companion Scratch project works unchanged.
 *
 * The databases are pluggable: use the bundled
 * {@link import('./database.js').MemoryDatabase MemoryDatabase},
 * {@link import('./database.js').JsonDatabase JsonDatabase} or
 * {@link import('./database.js').SqlDatabase SqlDatabase} (SQLite, MySQL/MariaDB
 * or PostgreSQL), or supply your own object with `get`/`set`/`keys`.
 *
 * @example
 * import { SqlDatabase } from 's-api4js';
 * import Database from 'better-sqlite3';
 *
 * const db = new Database('storage.db');
 * const storage = session.cloud(123456789).storage();
 * storage.addDatabase(
 *   new SqlDatabase('scores', {
 *     dialect: 'sqlite',
 *     query: (sql, params) => db.prepare(sql).all(params),
 *   }),
 * );
 * await storage.start();
 */
export class CloudStorage {
  /**
   * @param {import('./cloud.js').Cloud} cloud
   * @param {ConstructorParameters<typeof CloudRequests>[1]} [options]
   */
  constructor(cloud, options) {
    /** @type {CloudRequests} The underlying request server. */
    this.requests = new CloudRequests(cloud, options);
    /** @type {Map<string, import('./database.js').Database>} */
    this._databases = new Map();

    this.requests
      .request('get', ([db, key]) => this._get(db, key))
      .request('set', ([db, key, value]) => this._set(db, key, value))
      .request('keys', ([db]) => this._keys(db))
      .request('database_names', () => [...this._databases.keys()])
      .request('ping', () => 'Database backend is running');
  }

  /**
   * Register a database. The Scratch project addresses it by its `name`.
   *
   * @param {import('./database.js').Database} database
   * @returns {this}
   */
  addDatabase(database) {
    this._databases.set(database.name, database);
    return this;
  }

  /**
   * Look up a registered database by name.
   *
   * @param {string} name
   * @returns {import('./database.js').Database | null}
   */
  getDatabase(name) {
    return this._databases.get(name) ?? null;
  }

  /** Connect (if needed) and start serving storage requests. @returns {Promise<this>} */
  async start() {
    await this.requests.start();
    return this;
  }

  /** Stop serving storage requests. */
  stop() {
    this.requests.stop();
  }

  /**
   * Subscribe to a {@link CloudRequests} event (`request`, `unknownRequest`,
   * `error`).
   *
   * @param {'request' | 'unknownRequest' | 'error'} event
   * @param {(payload: any) => void} listener
   * @returns {this}
   */
  on(event, listener) {
    this.requests.on(event, listener);
    return this;
  }

  // ---- Request handlers ---------------------------------------------------

  /** @param {string} dbName @param {string} key */
  async _get(dbName, key) {
    const db = this.getDatabase(dbName);
    if (!db) return `Error: Database ${dbName} doesn't exist`;
    return db.get(key);
  }

  /** @param {string} dbName @param {string} key @param {string} value */
  async _set(dbName, key, value) {
    const db = this.getDatabase(dbName);
    if (!db) return `Error: Database ${dbName} doesn't exist`;
    await db.set(key, value);
  }

  /** @param {string} dbName */
  async _keys(dbName) {
    const db = this.getDatabase(dbName);
    if (!db) return `Error: Database ${dbName} doesn't exist`;
    return db.keys();
  }
}
