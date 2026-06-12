import { CookieJar } from 'tough-cookie';

/**
 * Error thrown when the Scratch API returns a non-2xx response, or when a
 * request cannot be completed. Carries the HTTP status and (when available) the
 * parsed response body for inspection.
 */
export class ScratchAPIError extends Error {
  /**
   * @param {string} message
   * @param {object} [info]
   * @param {number} [info.status] - HTTP status code, if a response was received.
   * @param {string} [info.url] - The request URL.
   * @param {string} [info.method] - The request method.
   * @param {unknown} [info.body] - Parsed (JSON) or raw (text) response body.
   */
  constructor(message, { status, url, method, body } = {}) {
    super(message);
    this.name = 'ScratchAPIError';
    /** @type {number | undefined} HTTP status code, if any. */
    this.status = status;
    /** @type {string | undefined} The request URL. */
    this.url = url;
    /** @type {string | undefined} The request method. */
    this.method = method;
    /** @type {unknown} The response body, parsed as JSON when possible. */
    this.body = body;
  }
}

/**
 * Thin wrapper around `fetch` that persists cookies in a {@link CookieJar}
 * across requests — the way a browser would. Scratch's auth flow is entirely
 * cookie-driven (`scratchcsrftoken`, `scratchsessionsid`), so every request
 * shares one jar: the `Cookie` header is filled from it before sending and any
 * `Set-Cookie` headers are written back to it afterwards.
 */
export class CookieFetch {
  /**
   * @param {object} [options]
   * @param {CookieJar} [options.jar] - Cookie store. A fresh one is created if omitted.
   * @param {typeof fetch} [options.fetch] - `fetch` implementation (defaults to the global).
   * @param {string} [options.userAgent] - `User-Agent` sent with every request.
   */
  constructor({ jar = new CookieJar(), fetch: fetchImpl, userAgent } = {}) {
    if (!fetchImpl && typeof globalThis.fetch !== 'function') {
      throw new ScratchAPIError(
        'No global fetch available; pass a `fetch` implementation (Node >=18 has one built in).',
      );
    }
    /** @type {CookieJar} The shared cookie store. */
    this.jar = jar;
    /** @type {typeof fetch} */
    this._fetch = fetchImpl ?? globalThis.fetch;
    /** @type {string | undefined} */
    this.userAgent = userAgent;
  }

  /**
   * Perform a request, threading cookies through the jar.
   *
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<Response>}
   */
  async fetch(url, options = {}) {
    const headers = new Headers(options.headers);
    if (this.userAgent && !headers.has('User-Agent')) {
      headers.set('User-Agent', this.userAgent);
    }
    const cookieString = await this.jar.getCookieString(url);
    if (cookieString) headers.set('Cookie', cookieString);

    let response;
    try {
      response = await this._fetch(url, { ...options, headers });
    } catch (cause) {
      throw new ScratchAPIError(`Request to ${url} failed: ${cause.message}`, {
        url,
        method: options.method ?? 'GET',
      });
    }

    // Persist any cookies the server set. `getSetCookie` returns the raw
    // header lines (Node 18.14+ / undici); fall back gracefully if absent.
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      try {
        await this.jar.setCookie(cookie, response.url || url);
      } catch {
        // Ignore cookies the jar rejects (e.g. wrong domain) — not fatal.
      }
    }
    return response;
  }

  /**
   * Like {@link CookieFetch#fetch} but parses the JSON body and throws a
   * {@link ScratchAPIError} on any non-2xx status.
   *
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<any>}
   */
  async json(url, options = {}) {
    const method = options.method ?? 'GET';
    const response = await this.fetch(url, options);
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      throw new ScratchAPIError(
        `${method} ${url} → ${response.status} ${response.statusText}`,
        { status: response.status, url, method, body },
      );
    }
    return body;
  }
}

/**
 * Build a query string from a plain object, skipping `undefined`/`null`
 * values. Returns `''` (not `'?'`) when nothing is set.
 *
 * @param {Record<string, string | number | undefined | null>} [params]
 * @returns {string}
 */
export function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const string = search.toString();
  return string ? `?${string}` : '';
}
