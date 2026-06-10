// Best-effort detection of an asset's type from its leading bytes, so callers
// can drop in a buffer without spelling out `dataFormat` every time.

const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

/**
 * Guess a Scratch `dataFormat` (file extension) from raw asset bytes.
 *
 * @param {Uint8Array} bytes - The asset contents.
 * @returns {string | undefined} The detected format, or undefined if unknown.
 */
export function sniffFormat(bytes) {
  if (!bytes || bytes.length < 4) return undefined;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(bytes, ascii('GIF'))) return 'gif';
  if (startsWith(bytes, ascii('RIFF'))) return 'wav';
  if (
    startsWith(bytes, ascii('ID3')) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
    return 'mp3';
  // Text-based: SVG documents start with an XML prolog or the root tag.
  const head = String.fromCharCode(...bytes.slice(0, 256)).trimStart();
  if (
    head.startsWith('<?xml') ||
    head.startsWith('<svg') ||
    head.includes('<svg')
  )
    return 'svg';
  return undefined;
}
