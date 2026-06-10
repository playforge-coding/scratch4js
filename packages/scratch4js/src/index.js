/**
 * scratch4js — read and edit Scratch `.sb3` projects with a small, declarative
 * API. Load bytes into a {@link Project}, tweak the {@link Stage} and
 * {@link Sprite} targets (position, size, costumes, sounds, variables…), then
 * save back to bytes.
 *
 * @module scratch4js
 */
export { Project } from './project.js';
export { Target, Stage, Sprite } from './target.js';
export { Costume, Sound } from './assets.js';
export { md5 } from './md5.js';
export { uid } from './ids.js';
export { sniffFormat } from './format.js';
