/**
 * Text measurement shim for headless (Node) scratchblocks rendering.
 *
 * scratchblocks sizes every block by measuring its label text with a real
 * `<canvas>` 2D context (`context.measureText(text).width`). jsdom has no
 * canvas unless you pull in the heavyweight native `canvas` package, so
 * instead we patch `HTMLCanvasElement.prototype.getContext` to return a tiny
 * measurer backed by the Helvetica advance-width tables below. The numbers are
 * the standard Adobe Helvetica AFM widths (units per 1000 em); summed and
 * scaled by the font size they reproduce browser text widths closely enough
 * that block layout is visually indistinguishable.
 *
 * @module measure
 */

// Helvetica (regular) advance widths, per 1000 em, indexed by char code 32..126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

// Helvetica-Bold advance widths, per 1000 em, indexed by char code 32..126.
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];

const FALLBACK_WIDTH = 600; // em/1000 for any char outside the ASCII tables.

/**
 * Parse the pixel size and boldness out of a CSS `font` shorthand such as
 * `"500 12pt Helvetica Neue, Helvetica, sans-serif"`.
 *
 * @param {string} font
 * @returns {{ sizePx: number, bold: boolean }}
 */
function parseFont(font) {
  let sizePx = 16;
  const sizeMatch = /(\d+(?:\.\d+)?)(px|pt)/.exec(font);
  if (sizeMatch) {
    const value = parseFloat(sizeMatch[1]);
    sizePx = sizeMatch[2] === 'pt' ? value * (96 / 72) : value;
  }
  const weightMatch = /(?:^|\s)(\d{3})(?:\s|$)/.exec(font);
  const weight = weightMatch ? parseInt(weightMatch[1], 10) : 400;
  const bold = weight >= 600 || /\bbold\b/i.test(font);
  return { sizePx, bold };
}

/**
 * Measure a string's rendered width in pixels for a given CSS font.
 *
 * @param {string} text
 * @param {string} font - CSS `font` shorthand.
 * @returns {number}
 */
export function measureText(text, font) {
  const { sizePx, bold } = parseFont(font);
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32] : FALLBACK_WIDTH;
  }
  return (units / 1000) * sizePx;
}

/**
 * Patch a jsdom window so `<canvas>.getContext('2d')` returns a measurer that
 * implements just enough of the 2D context API for scratchblocks to lay out
 * blocks: a writable `font` and `measureText()`. Idempotent per window.
 *
 * @param {object} window - A jsdom `window`.
 */
export function patchCanvasMeasurement(window) {
  const proto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
  if (!proto || proto.__gitSb3Patched) return;
  proto.__gitSb3Patched = true;
  proto.getContext = function getContext(type) {
    if (type !== '2d') return null;
    return {
      font: '500 12pt Helvetica',
      measureText(text) {
        return { width: measureText(text, this.font) };
      },
    };
  };
}
