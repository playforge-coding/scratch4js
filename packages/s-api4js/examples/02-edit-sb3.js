// 02 — Log in and save an edited .sb3
//
// Log in, edit a project in memory with scratch4js, then push it back to
// scratch.mit.edu. You must own the project whose id you pass.
//
//   SCRATCH_USER=you SCRATCH_PASS=secret PROJECT_ID=123456789 \
//     node examples/02-edit-sb3.js path/to/game.sb3

import { ScratchSession } from 's-api4js';
import { Project } from 'scratch4js';
import { readFile } from 'node:fs/promises';

const { SCRATCH_USER, SCRATCH_PASS, PROJECT_ID } = process.env;
const sb3Path = process.argv[2];

if (!SCRATCH_USER || !SCRATCH_PASS || !PROJECT_ID || !sb3Path) {
  console.error(
    'Set SCRATCH_USER, SCRATCH_PASS and PROJECT_ID, and pass an .sb3 path.',
  );
  process.exit(1);
}

// Authenticate. This performs the CSRF + session handshake and stores the
// X-Token needed to write to the project and asset servers.
const session = await ScratchSession.login(SCRATCH_USER, SCRATCH_PASS);
console.log(`Logged in as ${session.username} (#${session.userId})`);

// Edit the project in memory.
const project = await Project.load(await readFile(sb3Path));
project.stage.setVariable('saved-by-s-api4js', 1);
console.log(`Loaded ${project.targets.length} targets; saving…`);

// Upload every asset, then write the new project.json.
await session.projects.save(PROJECT_ID, project);
console.log(`Saved project ${PROJECT_ID}.`);
