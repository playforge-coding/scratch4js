/** @typedef {import('./users.js').Page} Page */

/**
 * Read-only access to studios. Reached through {@link ScratchSession#studios};
 * none of these calls require login.
 */
export class Studios {
  /** @param {import('./session.js').ScratchSession} session */
  constructor(session) {
    /** @type {import('./session.js').ScratchSession} */
    this.session = session;
  }

  /**
   * Fetch a studio's info.
   *
   * @param {number | string} id
   * @returns {Promise<any>} `{ id, title, host, description, stats, ... }`.
   */
  get(id) {
    return this.session.apiGet(`/studios/${id}`);
  }

  /**
   * Projects added to a studio.
   *
   * @param {number | string} id
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  projects(id, page = {}) {
    return this.session.apiGet(`/studios/${id}/projects`, page);
  }

  /**
   * A studio's curators.
   *
   * @param {number | string} id
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  curators(id, page = {}) {
    return this.session.apiGet(`/studios/${id}/curators`, page);
  }

  /**
   * A studio's managers.
   *
   * @param {number | string} id
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  managers(id, page = {}) {
    return this.session.apiGet(`/studios/${id}/managers`, page);
  }

  /**
   * Top-level comments on a studio (replies excluded).
   *
   * @param {number | string} id
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  comments(id, page = {}) {
    return this.session.apiGet(`/studios/${id}/comments`, page);
  }
}
