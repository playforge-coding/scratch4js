// 03 — Cloud variables and a cloud-requests server
//
// Log in, open a project's cloud connection, set/read cloud variables, then run
// a "cloud requests" server: a Scratch project sends named requests over the
// ☁ TO_HOST variable and this process answers over ☁ FROM_HOST_n — the same
// wire protocol as scratchattach, so a project built for it works unchanged.
//
//   SCRATCH_USER=you SCRATCH_PASS=secret PROJECT_ID=123456789 \
//     node examples/03-cloud-requests.js
//
// Requires the `ws` package (a dependency of s-api4js) for the WebSocket.

import { ScratchSession } from 's-api4js';

const { SCRATCH_USER, SCRATCH_PASS, PROJECT_ID } = process.env;

if (!SCRATCH_USER || !SCRATCH_PASS || !PROJECT_ID) {
  console.error('Set SCRATCH_USER, SCRATCH_PASS and PROJECT_ID.');
  process.exit(1);
}

const session = await ScratchSession.login(SCRATCH_USER, SCRATCH_PASS);
console.log(`Logged in as ${session.username}`);

// Open the cloud for this project. The session fills in the auth cookie,
// username and origin needed to connect and set variables.
const cloud = session.cloud(PROJECT_ID);

await cloud.connect();
console.log('Connected to the cloud.');

// React to any cloud variable change.
cloud.on('set', ({ name, value }) => console.log(`☁ ${name} = ${value}`));

// Set a cloud variable (values must be numeric unless allowNonNumeric is set).
await cloud.setVar('score', 100);

// Build a request/response server on the same connection.
const requests = cloud.requests();

requests.request('ping', () => 'pong');
requests.request('add', ([a, b]) => Number(a) + Number(b));
requests.request('greet', async ([name]) => `hello ${name}!`);
requests.request('leaderboard', () => ['alice: 10', 'bob: 8', 'carol: 5']);

requests.on('request', ({ name, args }) =>
  console.log(`→ request ${name}(${args.join(', ')})`),
);
requests.on('error', ({ error, ctx }) =>
  console.error(`request ${ctx.name} failed:`, error),
);

await requests.start();
console.log('Cloud requests server running. Press Ctrl+C to stop.');
