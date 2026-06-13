const EDITOR = 'https://turbowarp.org/editor';

/** Base64-encode a (possibly unicode) string without overflowing the stack. */
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Build a TurboWarp editor URL that auto-loads the built extension.
 *
 * Preferred: point `?extension=` at the short, CORS-enabled URL of the
 * in-container server (`previewUrl` + the built filename). A short URL avoids
 * TurboWarp's Cloudflare front-end rejecting an over-long request (HTTP 520),
 * which happens when the whole extension is inlined as a data: URL.
 *
 * Fallback (server not ready yet): inline the source as a `data:` URL — fine for
 * small extensions, the same thing TurboWarp produces when you paste text.
 *
 * @param {string} contents   the built single-file extension source
 * @param {{ previewUrl: string|null, filename: string }} opts
 */
export function turbowarpExtensionUrl(contents, { previewUrl, filename }) {
  const extUrl = previewUrl
    ? new URL(filename, previewUrl).href
    : `data:text/javascript;base64,${toBase64(contents)}`;
  return `${EDITOR}?extension=${encodeURIComponent(extUrl)}`;
}
