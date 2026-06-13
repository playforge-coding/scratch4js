// Project persistence in IndexedDB. Each project is a self-contained extension
// workspace: its file map plus the bundler / package-manager chosen at creation.
// Edits are saved back so work survives reloads.

const DB_NAME = 'tw-extension-maker';
const STORE = 'projects';
const VERSION = 1;

/** @typedef {{
 *   id: string,
 *   name: string,
 *   bundler: string,
 *   packageManager: string,
 *   files: Record<string,string>,
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
