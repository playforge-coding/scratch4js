/**
 * s-api4js — a small, class-based wrapper for the
 * {@link https://en.scratch-wiki.info/wiki/Scratch_API Scratch API}.
 *
 * Create a {@link ScratchSession} for public reads (users, projects, studios,
 * search), or {@link ScratchSession.login} to authenticate and edit a
 * project's `.sb3` (`session.projects.save(id, project)`). Cookies are kept in
 * a `tough-cookie` jar, just like a browser.
 *
 * @module s-api4js
 */
export { ScratchSession } from './session.js';
export { Users } from './users.js';
export { Projects } from './projects.js';
export { Studios } from './studios.js';
export { Search } from './search.js';
export { ScratchAPIError } from './http.js';
