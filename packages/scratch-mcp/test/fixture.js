/**
 * Build a small, deterministic `.sb3` the e2e test can open and assert against.
 * Kept in code (not a binary checked into git) so the expected sprites,
 * variables and lists below are the single source of truth for the assertions.
 *
 * @module test/fixture
 */
import { Project } from 'scratch4js';

/** Exactly what {@link writeFixture} puts in the project — assert against these. */
export const EXPECTED = {
  sprite: 'Cat',
  variable: { name: 'score', value: 7 },
  list: { name: 'inventory', items: ['sword', 'shield'] },
};

/**
 * Create the fixture project and write it to `dest`.
 *
 * @param {string} dest - Absolute path to write the `.sb3` to.
 * @returns {Promise<void>}
 */
export async function writeFixture(dest) {
  const { writeFile } = await import('node:fs/promises');
  const project = Project.create();
  project.addSprite(EXPECTED.sprite);
  project.stage.setVariable(EXPECTED.variable.name, EXPECTED.variable.value);
  project.stage.setList(EXPECTED.list.name, EXPECTED.list.items);
  await writeFile(dest, await project.save());
}
