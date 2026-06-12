/**
 * Build a small, deterministic `.sb3` the tests can open and assert against.
 * Kept in code (not a binary checked into git) so the expected sprites,
 * variables, lists and runtime behaviour below are the single source of truth.
 *
 * The project is also *runnable*: it has costumes (so the headless VM loads it)
 * and scripts that, on the green flag, exercise the runtime-reporting paths that
 * are easy to break — a `say` whose text comes from a variable reporter, and a
 * stage `ask and wait`. See `runtime.test.js`.
 *
 * @module test/fixture
 */
import { Project } from 'scratch4js';

/** Exactly what {@link writeFixture} puts in the project — assert against these. */
export const EXPECTED = {
  sprite: 'Cat',
  variable: { name: 'score', value: 7 },
  list: { name: 'inventory', items: ['sword', 'shield'] },
  /** What running the project (green flag) should produce. */
  run: {
    /** Sprite-local variable the Cat's script writes and then says. */
    greetingVar: 'greeting',
    /** The value it writes, and therefore the text of the say bubble. */
    sayText: 'win',
    /** The stage's `ask and wait` prompt. */
    question: 'Name?',
    /** An answer to feed back via `vm_input`. */
    answer: 'Alice',
  },
};

/** A minimal valid SVG costume, so the headless VM can load each target. */
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    '<rect width="10" height="10" fill="red"/></svg>',
);

/**
 * Create the fixture project and write it to `dest`.
 *
 * @param {string} dest - Absolute path to write the `.sb3` to.
 * @returns {Promise<void>}
 */
export async function writeFixture(dest) {
  const { writeFile } = await import('node:fs/promises');
  const project = Project.create();

  const stage = project.stage;
  stage.addCostume('backdrop1', SVG, { dataFormat: 'svg' });
  stage.setVariable(EXPECTED.variable.name, EXPECTED.variable.value);
  stage.setList(EXPECTED.list.name, EXPECTED.list.items);
  // Stage script: when green flag clicked → ask "Name?" and wait.
  stage.json.blocks = {
    stage_hat: hat('stage_ask'),
    stage_ask: {
      opcode: 'sensing_askandwait',
      next: null,
      parent: 'stage_hat',
      inputs: { QUESTION: [1, [10, EXPECTED.run.question]] },
      fields: {},
      shadow: false,
      topLevel: false,
    },
  };

  const cat = project.addSprite(EXPECTED.sprite);
  cat.addCostume('costume1', SVG, { dataFormat: 'svg' });
  const greetingId = cat.setVariable(EXPECTED.run.greetingVar, 'hi');
  // Cat script: when green flag clicked → set [greeting] to "win" → say (greeting).
  // The say reads the variable via an obscured-shadow reporter input — the exact
  // shape that regressed when bubbles stopped being captured.
  cat.json.blocks = {
    cat_hat: hat('cat_set'),
    cat_set: {
      opcode: 'data_setvariableto',
      next: 'cat_say',
      parent: 'cat_hat',
      inputs: { VALUE: [1, [10, EXPECTED.run.sayText]] },
      fields: { VARIABLE: [EXPECTED.run.greetingVar, greetingId] },
      shadow: false,
      topLevel: false,
    },
    cat_say: {
      opcode: 'looks_say',
      next: null,
      parent: 'cat_set',
      inputs: {
        MESSAGE: [3, [12, EXPECTED.run.greetingVar, greetingId], [10, '']],
      },
      fields: {},
      shadow: false,
      topLevel: false,
    },
  };

  await writeFile(dest, await project.save());
}

/** A `when green flag clicked` hat block wired to `next`. */
function hat(next) {
  return {
    opcode: 'event_whenflagclicked',
    next,
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: true,
    x: 0,
    y: 0,
  };
}
