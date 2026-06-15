// 05 — Cloud chatbot
//
// A chatbot made using cloud vars is here.
//
// Requires the `ws` package (a dependency of s-api4js) for the WebSocket.

import { ScratchSession } from 's-api4js';
import { resolve } from 'node:path';

// Load credentials from the repo-root .env if present (shell env still wins).
try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'));
} catch {
  // No .env file — rely on the environment as documented above.
}

const { SCRATCH_USER, SCRATCH_PASS, PROJECT_ID, GEMINI_KEY } = process.env;

if (!SCRATCH_USER || !SCRATCH_PASS || !PROJECT_ID || !GEMINI_KEY) {
  console.error('Set SCRATCH_USER, SCRATCH_PASS, PROJECT_ID and GEMINI_KEY.');
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

// server status
requests.request('ping', () => 'Server is up.');

// cheap chatbot
//
// The handler receives the decoded string arguments as an array and must return
// a string (or number / string[]). The Scratch project sends the prompt and the
// requesting username as the two arguments. Keep replies short: each response is
// streamed back over the cloud two characters at a time, so long answers are
// slow to arrive on the Scratch side.
requests.request('prompt', async ([prompt, username]) => {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': GEMINI_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are a kind and helpful assistant. If you do not know the answer, say "I do not know." Keep replies to one or two short sentences. The user's username is ${username}. Prompt: ${prompt}`,
              },
            ],
          },
        ],
        // Disable "thinking" for faster, cheaper replies.
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text?.trim() || 'Sorry, I could not think of a reply.';
});

requests.on('request', ({ name, args }) =>
  console.log(`--> request ${name}(${args.join(', ')})`),
);
requests.on('error', ({ error, ctx }) =>
  console.error(`request ${ctx.name} failed:`, error),
);

await requests.start();
console.log('Cloud requests server running. Press Ctrl+C to stop.');
