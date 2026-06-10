import { md5 } from './md5.js';

/**
 * Base class for the two kinds of media a target can own: costumes and sounds.
 * Each asset wraps its raw entry in `project.json` plus the bytes stored in the
 * surrounding zip, keyed by `md5ext` (e.g. `b7f1cf69….wav`).
 *
 * @abstract
 */
class Asset {
  /**
   * @param {object} json - The raw costume/sound entry from project.json.
   * @param {import('./project.js').Project} project - Owning project (holds the bytes).
   */
  constructor(json, project) {
    /** @type {object} The underlying JSON; mutate via the accessors below. */
    this.json = json;
    /** @type {import('./project.js').Project} */
    this.project = project;
  }

  /** @returns {string} Display name shown in the editor. */
  get name() {
    return this.json.name;
  }
  set name(value) {
    this.json.name = String(value);
  }

  /** @returns {string} File extension/type, e.g. `png`, `svg`, `wav`, `mp3`. */
  get dataFormat() {
    return this.json.dataFormat;
  }

  /** @returns {string} The `<md5>.<ext>` filename of this asset inside the zip. */
  get md5ext() {
    return this.json.md5ext;
  }

  /**
   * The raw bytes of this asset, read from / written to the project's zip.
   *
   * Assigning new bytes recomputes the MD5 and rewrites `assetId`/`md5ext`, so
   * the file is always addressed by the hash of its current contents.
   *
   * @returns {Uint8Array | undefined}
   */
  get data() {
    return this.project.assets.get(this.json.md5ext);
  }
  set data(bytes) {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const old = this.json.md5ext;
    const hash = md5(buf);
    this.json.assetId = hash;
    this.json.md5ext = `${hash}.${this.json.dataFormat}`;
    this.project.assets.set(this.json.md5ext, buf);
    if (old && old !== this.json.md5ext) this.project._maybeDropAsset(old);
  }
}

/**
 * A costume: an image (bitmap or SVG) a target can display.
 */
export class Costume extends Asset {
  /** @returns {number} Pixels per unit for bitmaps (1 for SVG, 2 for HD bitmaps). */
  get bitmapResolution() {
    return this.json.bitmapResolution ?? 1;
  }
  set bitmapResolution(value) {
    this.json.bitmapResolution = Number(value);
  }

  /** @returns {number} X of the rotation/anchor center, in costume pixels. */
  get rotationCenterX() {
    return this.json.rotationCenterX ?? 0;
  }
  set rotationCenterX(value) {
    this.json.rotationCenterX = Number(value);
  }

  /** @returns {number} Y of the rotation/anchor center, in costume pixels. */
  get rotationCenterY() {
    return this.json.rotationCenterY ?? 0;
  }
  set rotationCenterY(value) {
    this.json.rotationCenterY = Number(value);
  }
}

/**
 * A sound a target can play.
 */
export class Sound extends Asset {
  /** @returns {number} Sample rate in Hz. */
  get rate() {
    return this.json.rate;
  }
  set rate(value) {
    this.json.rate = Number(value);
  }

  /** @returns {number} Number of samples in the clip. */
  get sampleCount() {
    return this.json.sampleCount;
  }
  set sampleCount(value) {
    this.json.sampleCount = Number(value);
  }
}
