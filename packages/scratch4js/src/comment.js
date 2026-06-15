/**
 * A workspace comment: one of the yellow sticky notes shown in the Scratch
 * editor. A comment is either free-floating on the canvas or attached to a
 * block (when {@link Comment#blockId} is set). Each wraps its raw entry from a
 * target's `comments` map in project.json; the accessors below keep it in sync.
 */
export class Comment {
  /**
   * @param {string} id - The comment's id (its key in the `comments` map).
   * @param {object} json - The raw comment entry from project.json.
   */
  constructor(id, json) {
    /** @type {string} The comment's id; also its key in the target's `comments`. */
    this.id = id;
    /** @type {object} The underlying JSON; mutate via the accessors below. */
    this.json = json;
  }

  /** @returns {string} The comment's text. */
  get text() {
    return this.json.text ?? '';
  }
  set text(value) {
    this.json.text = String(value);
  }

  /**
   * The id of the block this comment is attached to, or `null` when the comment
   * floats free on the canvas.
   *
   * @returns {string | null}
   */
  get blockId() {
    return this.json.blockId ?? null;
  }
  set blockId(value) {
    this.json.blockId = value == null ? null : String(value);
  }

  /** @returns {number} X position on the canvas. */
  get x() {
    return this.json.x ?? 0;
  }
  set x(value) {
    this.json.x = Number(value);
  }

  /** @returns {number} Y position on the canvas. */
  get y() {
    return this.json.y ?? 0;
  }
  set y(value) {
    this.json.y = Number(value);
  }

  /** @returns {number} Width of the comment box, in pixels. */
  get width() {
    return this.json.width ?? 200;
  }
  set width(value) {
    this.json.width = Number(value);
  }

  /** @returns {number} Height of the comment box, in pixels. */
  get height() {
    return this.json.height ?? 200;
  }
  set height(value) {
    this.json.height = Number(value);
  }

  /** @returns {boolean} Whether the comment is collapsed to its title bar. */
  get minimized() {
    return this.json.minimized ?? false;
  }
  set minimized(value) {
    this.json.minimized = Boolean(value);
  }
}
