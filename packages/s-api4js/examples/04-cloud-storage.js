// 04 — Cloud storage and cloud events
//
// Run a cloud-backed key-value store for a Scratch project (scratchattach's
// Cloud Storage protocol), and separately watch a project's cloud activity by
// polling its public log.
//
//   SCRATCH_USER=you SCRATCH_PASS=secret PROJECT_ID=123456789 \
//     node examples/04-cloud-storage.js
//
// This example uses a JSON-file database (no driver needed). For a real backend,
// swap in SqlDatabase with your dialect — see the comments below.

import { ScratchSession, JsonDatabase } from 's-api4js';

const { SCRATCH_USER, SCRATCH_PASS, PROJECT_ID } = process.env;

if (!SCRATCH_USER || !SCRATCH_PASS || !PROJECT_ID) {
  console.error('Set SCRATCH_USER, SCRATCH_PASS and PROJECT_ID.');
  process.exit(1);
}

const session = await ScratchSession.login(SCRATCH_USER, SCRATCH_PASS);
const cloud = session.cloud(PROJECT_ID);

// --- Cloud storage ---------------------------------------------------------
const storage = cloud.storage();

storage.addDatabase(new JsonDatabase('scores', { path: './scores' }));

// For SQLite / MySQL / MariaDB / PostgreSQL, bring your own driver:
//
//   import { SqlDatabase } from 's-api4js';
//   import Database from 'better-sqlite3';
//   const db = new Database('storage.db');
//   storage.addDatabase(new SqlDatabase('scores', {
//     dialect: 'sqlite',
//     query: (sql, params) => db.prepare(sql).all(params),
//   }));
//
//   import { Pool } from 'pg';
//   const pool = new Pool();
//   storage.addDatabase(new SqlDatabase('scores', {
//     dialect: 'postgres',
//     query: async (sql, params) => (await pool.query(sql, params)).rows,
//   }));

storage.on('request', ({ name, args }) => console.log('→', name, args));
await storage.start();
console.log('Cloud storage running. The project can now get/set/keys.');

// --- Cloud events ----------------------------------------------------------
// Poll the public log to see who changed what (works even logged out).
const events = cloud.events();
events.on('set', (a) => console.log(`${a.user} set ☁ ${a.name} = ${a.value}`));
events.on('create', (a) => console.log(`${a.user} created ☁ ${a.name}`));
events.on('delete', (a) => console.log(`${a.user} deleted ☁ ${a.name}`));
await events.start();
console.log('Watching cloud activity. Press Ctrl+C to stop.');
