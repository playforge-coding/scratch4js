/**
 * The character ⇄ number table that Scratch cloud requests are encoded with.
 *
 * Cloud variables can only hold (mostly) numeric values, so to move text over
 * the cloud each character is replaced by its two-digit index in this table and
 * the digits are concatenated. The table is deliberately byte-for-byte
 * compatible with
 * {@link https://github.com/TimMcCool/scratchattach scratchattach} and the
 * matching Scratch decoder sprite, so a project built for one works with the
 * other.
 *
 * Indices 0–9 are unused (a value must be ≥ 10 so every character is exactly two
 * digits); index `20` is a space and doubles as the "unknown character"
 * fallback; index `89` is a newline and is reused as the separator between the
 * items of a list response.
 *
 * @type {(string | null)[]}
 */
export const letters = [
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
  ' ',
  'a',
  'A',
  'b',
  'B',
  'c',
  'C',
  'd',
  'D',
  'e',
  'E',
  'f',
  'F',
  'g',
  'G',
  'h',
  'H',
  'i',
  'I',
  'j',
  'J',
  'k',
  'K',
  'l',
  'L',
  'm',
  'M',
  'n',
  'N',
  'o',
  'O',
  'p',
  'P',
  'q',
  'Q',
  'r',
  'R',
  's',
  'S',
  't',
  'T',
  'u',
  'U',
  'v',
  'V',
  'w',
  'W',
  'x',
  'X',
  'y',
  'Y',
  'z',
  'Z',
  '*',
  '/',
  '.',
  ',',
  '!',
  '"',
  '§',
  '$',
  '%',
  '_',
  '-',
  '(',
  '´',
  ')',
  '`',
  '?',
  '\n',
  '@',
  '#',
  '~',
  ';',
  ':',
  '+',
  '&',
  '|',
  '^',
  "'",
];

/** Index a character resolves to when it isn't in {@link letters} (a space). */
const FALLBACK_INDEX = letters.indexOf(' ');

/** Reverse lookup (`char → index`) built once from {@link letters}. */
const indexOf = new Map();
for (let i = 0; i < letters.length; i++) {
  if (letters[i] !== null && !indexOf.has(letters[i]))
    indexOf.set(letters[i], i);
}

/**
 * Encode a string to its cloud-safe digit form. Each character becomes its
 * two-digit index in {@link letters}; characters not in the table are encoded
 * as a space.
 *
 * @param {string | number} input
 * @returns {string} A string of digits (empty input → `''`).
 */
export function encode(input) {
  const text = String(input);
  let out = '';
  for (const char of text) {
    out += String(indexOf.has(char) ? indexOf.get(char) : FALLBACK_INDEX);
  }
  return out;
}

/**
 * Decode a digit string produced by {@link encode} back to text. The input is
 * read two digits at a time; each pair indexes {@link letters}.
 *
 * @param {string | number} input
 * @returns {string}
 */
export function decode(input) {
  const text = String(input);
  let out = '';
  for (let i = 0; i + 1 < text.length; i += 2) {
    const char = letters[Number(text.slice(i, i + 2))];
    if (char != null) out += char;
  }
  return out;
}

/** Encode/decode helpers as a namespace, mirroring scratchattach's `Encoding`. */
export const Encoding = { encode, decode, letters };
