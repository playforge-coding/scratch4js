// 01 — Public data (no login)
//
// A read-only tour of the wrapper: fetch a user, one of their projects, search
// results and a studio. None of this needs credentials.
//
//   node examples/01-public-data.js

import { ScratchSession } from 's-api4js';

const session = new ScratchSession();

// A user profile.
const user = await session.users.get('griffpatch');
console.log(`User: ${user.username} (#${user.id})`);
console.log(`  joined ${user.history.joined.slice(0, 10)}`);
console.log(`  bio: ${user.profile.bio.split('\n')[0]}`);

// Their most recent shared projects.
const projects = await session.users.projects('griffpatch', { limit: 3 });
console.log(`\nRecent projects:`);
for (const p of projects) {
  console.log(`  ${p.id}  ${p.title}  (loves ${p.stats.loves})`);
}

// Search the site.
const hits = await session.search.projects('platformer', { limit: 5 });
console.log(`\nSearch "platformer":`);
for (const p of hits) console.log(`  ${p.id}  ${p.title}`);

// A studio and a sample of its projects.
const studio = await session.studios.get(30136012);
const inStudio = await session.studios.projects(30136012, { limit: 3 });
console.log(`\nStudio: ${studio.title}`);
for (const p of inStudio) console.log(`  ${p.id}  ${p.title}`);
