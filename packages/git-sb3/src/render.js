/**
 * Headless rendering of scratchblocks code into SVG strings, for use in the
 * visual diff report. Wraps the Node port of `scratchblocks` (a factory that
 * binds the library to a DOM `window`) with a jsdom window whose canvas text
 * measurement is shimmed by {@link module:measure}.
 *
 * @module render
 */
import { JSDOM } from 'jsdom';
import makeScratchblocks from 'scratchblocks/index.js';
import { patchCanvasMeasurement } from './measure.js';

/**
 * A reusable scratchblocks renderer bound to a single hidden jsdom window.
 * Create one with {@link createRenderer} and call {@link Renderer#render} per
 * script; the window and its block-style `<defs>` are shared across calls.
 */
export class Renderer {
  /**
   * @param {object} [options]
   * @param {string} [options.style='scratch3'] - scratchblocks style.
   * @param {string[]} [options.languages=['en']] - Block languages.
   * @param {number} [options.scale=1] - SVG scale factor.
   */
  constructor({ style = 'scratch3', languages = ['en'], scale = 1 } = {}) {
    this.style = style;
    this.languages = languages;
    this.scale = scale;

    this.dom = new JSDOM(
      '<!DOCTYPE html><html><head></head><body></body></html>',
    );
    this.window = this.dom.window;
    patchCanvasMeasurement(this.window);
    this.sb = makeScratchblocks(this.window);
    this.sb.appendStyles();
    this.serializer = new this.window.XMLSerializer();
  }

  /**
   * Render one or more scripts of scratchblocks code into a standalone SVG.
   *
   * @param {string} code - scratchblocks source text.
   * @returns {{ svg: string, width: number, height: number, isEmpty: boolean }}
   */
  render(code) {
    const doc = this.sb.parse(code, {
      style: this.style,
      languages: this.languages,
    });
    const svg = this.sb.render(doc, { style: this.style, scale: this.scale });
    const width = parseFloat(svg.getAttribute('width')) || 0;
    const height = parseFloat(svg.getAttribute('height')) || 0;
    const isEmpty = !doc.scripts.some((s) => !s.isEmpty);
    return {
      svg: this.serializer.serializeToString(svg),
      width,
      height,
      isEmpty,
    };
  }

  /**
   * The CSS that styles scratchblocks SVGs. Inline this once per HTML document
   * so the serialized SVGs render with correct block colours and fonts.
   *
   * @returns {string}
   */
  styleSheet() {
    // scratch2 + scratch3 both register a <style> via the factory's
    // appendStyles(); read them back out of the shared document head.
    return [...this.window.document.querySelectorAll('style')]
      .map((el) => el.textContent)
      .join('\n');
  }
}

/**
 * Convenience factory for a {@link Renderer}.
 *
 * @param {object} [options] - See {@link Renderer}.
 * @returns {Renderer}
 */
export function createRenderer(options) {
  return new Renderer(options);
}
