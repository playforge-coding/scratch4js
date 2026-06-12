/** @typedef {import('./users.js').Page} Page */

/**
 * @typedef {object} SearchOptions
 * @property {'trending' | 'popular'} [mode] - Result ordering. Defaults to `popular`.
 * @property {string} [language] - ISO language code (e.g. `en`) to bias results.
 * @property {number} [limit] - Max items to return (Scratch caps this at 40).
 * @property {number} [offset] - How many items to skip.
 */

/**
 * Project/studio discovery: keyword search and the explore (browse) feeds.
 * Reached through {@link ScratchSession#search}; no login required.
 */
export class Search {
  /** @param {import('./session.js').ScratchSession} session */
  constructor(session) {
    /** @type {import('./session.js').ScratchSession} */
    this.session = session;
  }

  /**
   * Search shared projects by keyword.
   *
   * @param {string} q - The search query.
   * @param {SearchOptions} [options]
   * @returns {Promise<any[]>}
   */
  projects(q, { mode, language, limit, offset } = {}) {
    return this.session.apiGet('/search/projects', {
      q,
      mode,
      language,
      limit,
      offset,
    });
  }

  /**
   * Search studios by keyword.
   *
   * @param {string} q - The search query.
   * @param {SearchOptions} [options]
   * @returns {Promise<any[]>}
   */
  studios(q, { mode, language, limit, offset } = {}) {
    return this.session.apiGet('/search/studios', {
      q,
      mode,
      language,
      limit,
      offset,
    });
  }

  /**
   * Browse projects in the explore feed. `q` defaults to `*` (everything);
   * pass a category tag (e.g. `animations`) to narrow it.
   *
   * @param {string} [q]
   * @param {SearchOptions} [options]
   * @returns {Promise<any[]>}
   */
  exploreProjects(q = '*', { mode, language, limit, offset } = {}) {
    return this.session.apiGet('/explore/projects', {
      q,
      mode,
      language,
      limit,
      offset,
    });
  }

  /**
   * Browse studios in the explore feed.
   *
   * @param {string} [q]
   * @param {SearchOptions} [options]
   * @returns {Promise<any[]>}
   */
  exploreStudios(q = '*', { mode, language, limit, offset } = {}) {
    return this.session.apiGet('/explore/studios', {
      q,
      mode,
      language,
      limit,
      offset,
    });
  }
}
