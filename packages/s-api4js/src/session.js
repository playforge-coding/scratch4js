import { CookieJar } from 'tough-cookie';
import { CookieFetch, ScratchAPIError, query } from './http.js';
import { Users } from './users.js';
import { Projects } from './projects.js';
import { Studios } from './studios.js';
import { Search } from './search.js';
import { Cloud } from './cloud.js';

const SITE_HOST = 'https://scratch.mit.edu';
const API_HOST = 'https://api.scratch.mit.edu';
const PROJECTS_HOST = 'https://projects.scratch.mit.edu';
const ASSETS_HOST = 'https://assets.scratch.mit.edu';

const DEFAULT_USER_AGENT =
  's-api4js (+https://github.com/playforge-coding/scratch4js)';

/**
 * The entry point to the Scratch API.
 *
 * A `ScratchSession` owns a cookie jar and exposes the API as resource groups —
 * {@link ScratchSession#users users}, {@link ScratchSession#projects projects},
 * {@link ScratchSession#studios studios} and {@link ScratchSession#search
 * search} — plus a few site-level helpers. Construct one directly for public
 * (logged-out) reads, or use {@link ScratchSession.login} to authenticate and
 * unlock the editing methods (e.g. `session.projects.save(...)`).
 *
 * @example
 * // Public data — no login.
 * const session = new ScratchSession();
 * const user = await session.users.get('griffpatch');
 * const hits = await session.search.projects('platformer');
 *
 * @example
 * // Logged in — edit a project's .sb3.
 * import { Project } from 'scratch4js';
 * const session = await ScratchSession.login('username', 'password');
 * const project = await Project.load(await readFile('game.sb3'));
 * project.stage.setVariable('score', 0);
 * await session.projects.save(123456789, project);
 */
export class ScratchSession {
  /**
   * @param {object} [options]
   * @param {CookieJar} [options.jar] - Cookie store to use (a fresh one by default).
   * @param {typeof fetch} [options.fetch] - `fetch` implementation (defaults to global).
   * @param {string} [options.userAgent] - `User-Agent` sent with every request.
   */
  constructor({ jar = new CookieJar(), fetch: fetchImpl, userAgent } = {}) {
    /** @type {CookieFetch} The cookie-aware fetch wrapper. */
    this._http = new CookieFetch({
      jar,
      fetch: fetchImpl,
      userAgent: userAgent ?? DEFAULT_USER_AGENT,
    });

    /** @type {string | null} The logged-in username, or `null`. */
    this.username = null;
    /** @type {number | null} The logged-in user id, or `null`. */
    this.userId = null;
    /** @type {string | null} The `X-Token` for authenticated API calls. */
    this.xToken = null;
    /** @type {string | null} The CSRF token paired with the session cookie. */
    this.csrfToken = null;

    /** Base URL of the public read API (`api.scratch.mit.edu`). */
    this.apiHost = API_HOST;
    /** Base URL of the project-JSON store (`projects.scratch.mit.edu`). */
    this.projectsHost = PROJECTS_HOST;
    /** Base URL of the asset store (`assets.scratch.mit.edu`). */
    this.assetsHost = ASSETS_HOST;
    /** Base URL of the main site (`scratch.mit.edu`). */
    this.siteHost = SITE_HOST;

    /** @type {Users} User profiles and their public lists. */
    this.users = new Users(this);
    /** @type {Projects} Project reads, plus authenticated editing. */
    this.projects = new Projects(this);
    /** @type {Studios} Studio reads. */
    this.studios = new Studios(this);
    /** @type {Search} Project/studio search and explore feeds. */
    this.search = new Search(this);
  }

  /** @type {CookieJar} The underlying cookie jar (shared across requests). */
  get jar() {
    return this._http.jar;
  }

  /** @type {boolean} Whether this session is authenticated. */
  get loggedIn() {
    return this.xToken !== null;
  }

  /**
   * Log in with a username and password and return the ready-to-use session.
   * On success the session is authenticated and its `username`, `userId`,
   * `xToken` and `csrfToken` are populated.
   *
   * @param {string} username
   * @param {string} password
   * @param {ConstructorParameters<typeof ScratchSession>[0]} [options]
   * @returns {Promise<ScratchSession>}
   * @throws {ScratchAPIError} If the credentials are rejected.
   */
  static async login(username, password, options) {
    const session = new ScratchSession(options);
    await session.login(username, password);
    return session;
  }

  /**
   * Authenticate this (existing) session in place. Usually you'll prefer the
   * static {@link ScratchSession.login}.
   *
   * @param {string} username
   * @param {string} password
   * @returns {Promise<this>}
   */
  async login(username, password) {
    // 1. Prime the CSRF cookie — Scratch rejects the login POST without it.
    const csrfToken = await this._primeCsrfToken();

    // 2. POST credentials. The session cookie comes back via Set-Cookie and is
    //    captured by the jar automatically.
    const response = await this._http.fetch(`${SITE_HOST}/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${SITE_HOST}/`,
      },
      body: JSON.stringify({ username, password }),
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    const result = Array.isArray(body) ? body[0] : body;
    if (!response.ok || (result && result.success === 0)) {
      throw new ScratchAPIError(
        `Login failed: ${result?.msg || response.statusText || 'unknown error'}`,
        {
          status: response.status,
          url: `${SITE_HOST}/login/`,
          method: 'POST',
          body,
        },
      );
    }

    // 3. Pull the X-Token and account details from the session endpoint.
    await this.refreshSession();
    return this;
  }

  /**
   * Refresh `xToken`/`username`/`userId`/`csrfToken` from `/session/`. Requires
   * the `scratchsessionsid` cookie (set during {@link ScratchSession#login}).
   *
   * @returns {Promise<any>} The raw session payload.
   */
  async refreshSession() {
    const data = await this._http.json(`${SITE_HOST}/session/`, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${SITE_HOST}/`,
      },
    });
    if (!data?.user?.token) {
      throw new ScratchAPIError(
        'Session is not authenticated (no user token).',
        {
          url: `${SITE_HOST}/session/`,
          body: data,
        },
      );
    }
    this.username = data.user.username;
    this.userId = data.user.id;
    this.xToken = data.user.token;
    this.csrfToken = this._cookieValue('scratchcsrftoken') ?? this.csrfToken;
    return data;
  }

  /**
   * Log out: clear the session cookie on the server and reset local auth state.
   *
   * @returns {Promise<void>}
   */
  async logout() {
    if (this.csrfToken) {
      try {
        await this._http.fetch(`${SITE_HOST}/accounts/logout/`, {
          method: 'POST',
          headers: {
            'X-CSRFToken': this.csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: `${SITE_HOST}/`,
          },
          body: JSON.stringify({ csrfmiddlewaretoken: this.csrfToken }),
        });
      } catch {
        // Best-effort — clear local state regardless of the network result.
      }
    }
    this.username = null;
    this.userId = null;
    this.xToken = null;
  }

  // ---- Site-level helpers -------------------------------------------------

  /** Scratch website status (version, uptime, load…). @returns {Promise<any>} */
  health() {
    return this._http.json(`${API_HOST}/health`);
  }

  /** The Scratch News feed. @returns {Promise<any[]>} */
  news() {
    return this._http.json(`${API_HOST}/news`);
  }

  /** Front-page featured projects and studios. @returns {Promise<any>} */
  featured() {
    return this._http.json(`${API_HOST}/proxy/featured`);
  }

  // ---- Cloud variables ----------------------------------------------------

  /**
   * Open a {@link Cloud} for a project's cloud variables.
   *
   * For Scratch's own cloud (the default) this requires login and pre-fills the
   * session's auth (cookie, username, origin). For a **custom host** — pass
   * `options.host` — no login is required and no Scratch cookie is attached, so
   * this works on a logged-out session too. For TurboWarp specifically, the
   * {@link Cloud.turbowarp} factory is more convenient.
   *
   * Call {@link Cloud#connect} before use, or just `await cloud.setVar(...)`
   * (the first set connects automatically). Build a request/response server with
   * `cloud.requests()`.
   *
   * @example
   * const cloud = session.cloud(123456789);
   * await cloud.setVar('score', 100);
   *
   * @example
   * // A custom, unauthenticated cloud server:
   * const cloud = session.cloud(123456789, { host: 'wss://my.cloud.example' });
   *
   * @param {number | string} projectId
   * @param {Partial<ConstructorParameters<typeof Cloud>[0]>} [options] - Overrides
   *   (e.g. `host` for a custom/TurboWarp cloud, or a custom `WebSocket`).
   * @returns {Cloud}
   */
  cloud(projectId, options = {}) {
    /** @type {Partial<ConstructorParameters<typeof Cloud>[0]>} */
    const base = {
      projectId,
      userAgent: this._http.userAgent,
      fetch: this._http._fetch,
    };
    // Scratch's cloud (the default host) needs the session cookie + login; a
    // custom host is treated as unauthenticated unless the caller says otherwise.
    const isScratch = !options.host || options.host === Cloud.SCRATCH_HOST;
    if (isScratch) {
      this.requireAuth();
      const sessionId = this._cookieValue('scratchsessionsid');
      base.username = this.username ?? undefined;
      base.cookie = sessionId ? `scratchsessionsid=${sessionId};` : undefined;
      base.origin = this.siteHost;
    }
    return new Cloud({ ...base, ...options });
  }

  // ---- Internal plumbing (used by the resource classes) -------------------

  /**
   * GET a path on the public API and return its parsed JSON.
   *
   * @param {string} path - Path beginning with `/` (e.g. `/users/foo`).
   * @param {Record<string, any>} [params] - Query parameters.
   * @returns {Promise<any>}
   */
  apiGet(path, params) {
    return this._http.json(`${API_HOST}${path}${query(params)}`);
  }

  /**
   * Perform an authenticated request and return its parsed JSON. Merges the
   * auth headers (`X-Token`, `X-CSRFToken`, …) into the request.
   *
   * @param {string} url - Absolute URL.
   * @param {RequestInit} [options]
   * @param {Record<string, string>} [extraHeaders]
   * @returns {Promise<any>}
   */
  authedJson(url, options = {}, extraHeaders = {}) {
    return this._http.json(url, {
      ...options,
      headers: { ...this.authHeaders(), ...extraHeaders, ...options.headers },
    });
  }

  /**
   * Perform a request with the auth headers merged in and return the raw
   * {@link Response} (for non-JSON bodies, e.g. downloading asset bytes).
   *
   * @param {string} url - Absolute URL.
   * @param {RequestInit} [options]
   * @param {Record<string, string>} [extraHeaders]
   * @returns {Promise<Response>}
   */
  authedFetch(url, options = {}, extraHeaders = {}) {
    return this._http.fetch(url, {
      ...options,
      headers: { ...this.authHeaders(), ...extraHeaders, ...options.headers },
    });
  }

  /**
   * The headers an authenticated, state-changing request needs.
   *
   * @returns {Record<string, string>}
   */
  authHeaders() {
    /** @type {Record<string, string>} */
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${SITE_HOST}/`,
    };
    if (this.xToken) headers['X-Token'] = this.xToken;
    if (this.csrfToken) headers['X-CSRFToken'] = this.csrfToken;
    return headers;
  }

  /** Throw unless this session is logged in. */
  requireAuth() {
    if (!this.loggedIn) {
      throw new ScratchAPIError(
        'This action requires login. Use ScratchSession.login(username, password) first.',
      );
    }
  }

  /**
   * Hit `/csrf_token/` to make Scratch set the `scratchcsrftoken` cookie, then
   * return its value.
   *
   * @returns {Promise<string>}
   */
  async _primeCsrfToken() {
    await this._http.fetch(`${SITE_HOST}/csrf_token/`, {
      headers: {
        Referer: `${SITE_HOST}/`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const token = this._cookieValue('scratchcsrftoken');
    if (!token) {
      throw new ScratchAPIError(
        'Could not obtain a CSRF token from scratch.mit.edu.',
        { url: `${SITE_HOST}/csrf_token/` },
      );
    }
    this.csrfToken = token;
    return token;
  }

  /**
   * Read a cookie value out of the jar for the Scratch site.
   *
   * @param {string} name
   * @returns {string | null}
   */
  _cookieValue(name) {
    const cookies = this.jar.getCookiesSync(`${SITE_HOST}/`);
    const match = cookies.find((c) => c.key === name);
    return match ? match.value : null;
  }
}
