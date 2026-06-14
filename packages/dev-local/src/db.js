// Project persistence in IndexedDB. Each project is a self-contained workspace:
// its file map, the entry file, and a build descriptor (from a template, or a
// best guess for a clone). Edits are saved back so work survives reloads. The
// git history for a project lives separately, in its own IDBFS database keyed by
// the project id (see gitEngine.js).

const DB_NAME = 'dev-local';
const STORE = 'projects';
const VERSION = 1;

/** @typedef {{
 *   id: string,
 *   name: string,
 *   source: 'template' | 'clone',
 *   templateId?: string,
 *   cloneUrl?: string,
 *   files: Record<string,string>,
 *   entryFile: string | null,
 *   build: object | null,
 *   createdAt: number,
 *   updatedAt: number,
 * }} ProjectRecord */

let dbPromise;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<ProjectRecord[]>} newest first */
export async function listProjects() {
  const db = await openDB();
  const all = await request(db.transaction(STORE).objectStore(STORE).getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** @param {string} id @returns {Promise<ProjectRecord|undefined>} */
export async function getProject(id) {
  const db = await openDB();
  return request(db.transaction(STORE).objectStore(STORE).get(id));
}

/** @param {ProjectRecord} project */
export async function saveProject(project) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(project);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(project);
    tx.onerror = () => reject(tx.error);
  });
}

/** @param {string} id */
export async function deleteProject(id) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Generate a project id. */
export function newId() {
  return crypto.randomUUID();
}

/** The IDBFS database name holding a project's git repo. */
export function repoDirFor(id) {
  return `/git/${id}`;
}
