/**
 * s-api4js — a small, class-based wrapper for the
 * {@link https://en.scratch-wiki.info/wiki/Scratch_API Scratch API}.
 *
 * Create a {@link ScratchSession} for public reads (users, projects, studios,
 * search), or {@link ScratchSession.login} to authenticate and edit a
 * project's `.sb3` (`session.projects.save(id, project)`). Cookies are kept in
 * a `tough-cookie` jar, just like a browser.
 *
 * A logged-in session can also open a project's cloud variables —
 * `session.cloud(id)` — to set/read `☁` variables over WebSocket or run a
 * {@link CloudRequests} server (compatible with scratchattach).
 *
 * @module s-api4js
 */
export { ScratchSession } from './session.js';
export { Users } from './users.js';
export { Projects } from './projects.js';
export { Studios } from './studios.js';
export { Search } from './search.js';
export { Cloud } from './cloud.js';
export { CloudRequests } from './cloud-requests.js';
export { CloudEvents } from './cloud-events.js';
export { CloudStorage } from './cloud-storage.js';
export { MemoryDatabase, JsonDatabase, SqlDatabase } from './database.js';
export { Encoding, encode, decode } from './encoding.js';
export { ScratchAPIError } from './http.js';
