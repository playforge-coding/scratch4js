import { readFile, writeFile } from 'node:fs/promises';
import { ScratchAPIError } from './http.js';

/**
 * @typedef {object} Database
 * A key-value store a {@link import('./cloud-storage.js').CloudStorage} can read
 * and write on behalf of a Scratch project. Bring your own backend by
 * implementing this shape, or use one of the adapters in this module.
 * @property {string} name - The database name the project addresses it by.
 * @property {(key: string) => Promise<string | null> | string | null} get
 * @property {(key: string, value: string) => Promise<void> | void} set
 * @property {() => Promise<string[]> | string[]} keys
 */

/**
 * An in-memory {@link Database}. Fast and dependency-free, but not persisted —
 * handy for tests or ephemeral state.
 */
export class MemoryDatabase {
  /**
   * @param {string} name
   * @param {Record<string, string>} [initial]
   */
  constructor(name, initial = {}) {
    /** @type {string} */
    this.name = name;
    /** @type {Record<string, string>} */
    this.data = { ...initial };
  }

  /** @param {string} key @returns {string | null} */
  get(key) {
    return Object.prototype.hasOwnProperty.call(this.data, key)
      ? this.data[key]
      : null;
  }

  /** @param {string} key @param {string} value */
  set(key, value) {
    this.data[key] = String(value);
  }

  /** @returns {string[]} */
  keys() {
    return Object.keys(this.data);
  }
}

/**
 * A {@link Database} persisted to a JSON file — the same simple store
 * scratchattach uses by default. Loaded lazily and saved after every `set`
 * (writes are serialized).
 */
export class JsonDatabase {
  /**
   * @param {string} name
   * @param {object} options
   * @param {string} options.path - Path to the JSON file (`.json` appended if missing).
   */
  constructor(name, { path } = {}) {
    if (!path) throw new ScratchAPIError('JsonDatabase requires a `path`.');
    /** @type {string} */
    this.name = name;
    /** @type {string} */
    this.path = path.endsWith('.json') ? path : `${path}.json`;
    /** @type {Record<string, string> | null} */
    this._data = null;
    this._saveChain = Promise.resolve();
  }

  async _load() {
    if (this._data) return;
    try {
      this._data = JSON.parse(await readFile(this.path, 'utf8'));
    } catch {
      this._data = {};
    }
    if (Array.isArray(this._data)) {
      throw new ScratchAPIError(
        `Database file ${this.path} must hold a JSON object, not an array.`,
      );
    }
  }

  /** @param {string} key @returns {Promise<string | null>} */
  async get(key) {
    await this._load();
    return Object.prototype.hasOwnProperty.call(this._data, key)
      ? this._data[key]
      : null;
  }

  /** @param {string} key @param {string} value @returns {Promise<void>} */
  async set(key, value) {
    await this._load();
    this._data[key] = String(value);
    await this.save();
  }

  /** @returns {Promise<string[]>} */
  async keys() {
    await this._load();
    return Object.keys(this._data);
  }

  /** Flush the current data to disk. @returns {Promise<void>} */
  save() {
    this._saveChain = this._saveChain.then(() =>
      writeFile(this.path, JSON.stringify(this._data ?? {}, null, 2)),
    );
    return this._saveChain;
  }
}

/**
 * A {@link Database} backed by a SQL table, for **SQLite**, **MySQL/MariaDB** or
 * **PostgreSQL**. s-api4js doesn't ship a database driver — you supply a small
 * `query(sql, params)` function wrapping your client of choice, and this adapter
 * builds the dialect-appropriate SQL (placeholders, upsert) and (optionally)
 * creates the table.
 *
 * The table has two text columns, `k` (primary key) and `v`. `query` must run a
 * parameterized statement and resolve to an **array of row objects**.
 *
 * @example
 * // SQLite via better-sqlite3 (synchronous driver)
 * import Database from 'better-sqlite3';
 * const db = new Database('storage.db');
 * const store = new SqlDatabase('scores', {
 *   dialect: 'sqlite',
 *   query: (sql, params) => db.prepare(sql).all(params),
 * });
 *
 * @example
 * // PostgreSQL via pg
 * import { Pool } from 'pg';
 * const pool = new Pool();
 * const store = new SqlDatabase('scores', {
 *   dialect: 'postgres',
 *   query: async (sql, params) => (await pool.query(sql, params)).rows,
 * });
 *
 * @example
 * // MySQL / MariaDB via mysql2/promise
 * import mysql from 'mysql2/promise';
 * const pool = mysql.createPool({ database: 'scratch' });
 * const store = new SqlDatabase('scores', {
 *   dialect: 'mysql',
 *   query: async (sql, params) => (await pool.execute(sql, params))[0],
 * });
 */
export class SqlDatabase {
  /**
   * @param {string} name
   * @param {object} options
   * @param {'sqlite' | 'mysql' | 'postgres'} options.dialect - `mysql` also covers MariaDB.
   * @param {(sql: string, params: any[]) => Promise<any[]> | any[]} options.query
   *   Run a parameterized statement; resolve to an array of row objects.
   * @param {string} [options.table] - Table name (default `cloud_storage`).
   * @param {string} [options.keyType] - SQL type of the key column.
   * @param {string} [options.valueType] - SQL type of the value column (default `TEXT`).
   * @param {boolean} [options.ensureSchema] - Create the table on first use (default `true`).
   */
  constructor(
    name,
    {
      dialect,
      query,
      table = 'cloud_storage',
      keyType,
      valueType,
      ensureSchema = true,
    } = {},
  ) {
    if (dialect !== 'sqlite' && dialect !== 'mysql' && dialect !== 'postgres') {
      throw new ScratchAPIError(
        "SqlDatabase `dialect` must be 'sqlite', 'mysql' or 'postgres'.",
      );
    }
    if (typeof query !== 'function') {
      throw new ScratchAPIError('SqlDatabase requires a `query` function.');
    }
    /** @type {string} */
    this.name = name;
    /** @type {'sqlite' | 'mysql' | 'postgres'} */
    this.dialect = dialect;
    this._query = query;
    /** @type {string} */
    this.table = table;
    // MySQL can't index an unbounded TEXT primary key — give the key a length.
    this.keyType = keyType ?? (dialect === 'mysql' ? 'VARCHAR(255)' : 'TEXT');
    this.valueType = valueType ?? 'TEXT';
    this._ensureSchema = ensureSchema;
    /** @type {Promise<any> | null} */
    this._ready = null;
  }

  /** Placeholder for the i-th parameter (`$1` on Postgres, `?` elsewhere). */
  _ph(i) {
    return this.dialect === 'postgres' ? `$${i}` : '?';
  }

  async _init() {
    if (!this._ensureSchema) return;
    if (!this._ready) {
      this._ready = Promise.resolve(
        this._query(
          `CREATE TABLE IF NOT EXISTS ${this.table} ` +
            `(k ${this.keyType} PRIMARY KEY, v ${this.valueType})`,
          [],
        ),
      );
    }
    await this._ready;
  }

  /** @param {string} key @returns {Promise<string | null>} */
  async get(key) {
    await this._init();
    const rows = await this._query(
      `SELECT v FROM ${this.table} WHERE k = ${this._ph(1)}`,
      [key],
    );
    if (!rows || rows.length === 0) return null;
    return columnValue(rows[0], 'v');
  }

  /** @param {string} key @param {string} value @returns {Promise<void>} */
  async set(key, value) {
    await this._init();
    let sql;
    if (this.dialect === 'mysql') {
      sql =
        `INSERT INTO ${this.table} (k, v) VALUES (?, ?) ` +
        `ON DUPLICATE KEY UPDATE v = VALUES(v)`;
    } else if (this.dialect === 'postgres') {
      sql =
        `INSERT INTO ${this.table} (k, v) VALUES ($1, $2) ` +
        `ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`;
    } else {
      sql =
        `INSERT INTO ${this.table} (k, v) VALUES (?, ?) ` +
        `ON CONFLICT(k) DO UPDATE SET v = excluded.v`;
    }
    await this._query(sql, [key, String(value)]);
  }

  /** @returns {Promise<string[]>} */
  async keys() {
    await this._init();
    const rows = await this._query(`SELECT k FROM ${this.table}`, []);
    return (rows ?? []).map((row) => columnValue(row, 'k'));
  }
}

/**
 * Pull a column out of a driver's row object, tolerating case differences and
 * positional (array) rows.
 *
 * @param {any} row
 * @param {string} column
 * @returns {string | null}
 */
function columnValue(row, column) {
  if (row == null) return null;
  if (Array.isArray(row)) return row[0] ?? null;
  if (column in row) return row[column];
  const upper = column.toUpperCase();
  if (upper in row) return row[upper];
  const values = Object.values(row);
  return values.length ? values[0] : null;
}
