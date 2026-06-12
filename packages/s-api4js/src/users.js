/**
 * @typedef {object} Page
 * @property {number} [limit] - Max items to return (Scratch caps this at 40).
 * @property {number} [offset] - How many items to skip.
 */

/**
 * Read-only access to user profiles and their public lists. Reached through
 * {@link ScratchSession#users}; none of these calls require login.
 */
export class Users {
  /** @param {import('./session.js').ScratchSession} session */
  constructor(session) {
    /** @type {import('./session.js').ScratchSession} */
    this.session = session;
  }

  /**
   * Fetch a user's public profile.
   *
   * @param {string} username
   * @returns {Promise<any>} `{ id, username, history, profile, ... }`.
   */
  get(username) {
    return this.session.apiGet(`/users/${enc(username)}`);
  }

  /**
   * A user's most recent followers.
   *
   * @param {string} username
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  followers(username, page = {}) {
    return this.session.apiGet(`/users/${enc(username)}/followers`, page);
  }

  /**
   * Users this user has recently followed.
   *
   * @param {string} username
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  following(username, page = {}) {
    return this.session.apiGet(`/users/${enc(username)}/following`, page);
  }

  /**
   * A user's favorited projects.
   *
   * @param {string} username
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  favorites(username, page = {}) {
    return this.session.apiGet(`/users/${enc(username)}/favorites`, page);
  }

  /**
   * A user's shared projects.
   *
   * @param {string} username
   * @param {Page} [page]
   * @returns {Promise<any[]>}
   */
  projects(username, page = {}) {
    return this.session.apiGet(`/users/${enc(username)}/projects`, page);
  }
}

/** @param {string} segment */
function enc(segment) {
  return encodeURIComponent(segment);
}
