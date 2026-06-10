// Scratch generates the keys used for blocks, variables, lists and broadcasts
// from a fixed "soup" of characters. We mirror that here so generated IDs look
// native and stay clear of JSON-unsafe characters.
const SOUP =
  '!#%()*+,-./:;=?@[]^_`{|}~' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789';

/**
 * Generate a fresh 20-character Scratch-style unique id.
 *
 * @returns {string} A new id.
 */
export function uid() {
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += SOUP[Math.floor(Math.random() * SOUP.length)];
  }
  return id;
}
