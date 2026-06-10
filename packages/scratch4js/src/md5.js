// Pure-JS MD5 (RFC 1321). Scratch names asset files by the MD5 hash of their
// bytes, so we need a hash that runs in both Node and the browser without
// pulling in a dependency.

// prettier-ignore
const K = new Int32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
  0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
  0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
  0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

// prettier-ignore
const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const rotl = (x, c) => (x << c) | (x >>> (32 - c));

const HEX = [];
for (let i = 0; i < 256; i++) HEX[i] = (i < 16 ? '0' : '') + i.toString(16);
const hexLE = (x) =>
  HEX[x & 0xff] +
  HEX[(x >>> 8) & 0xff] +
  HEX[(x >>> 16) & 0xff] +
  HEX[(x >>> 24) & 0xff];

/**
 * Compute the lowercase hex MD5 digest of some bytes.
 *
 * @param {Uint8Array | ArrayBuffer} input - Bytes to hash.
 * @returns {string} 32-character lowercase hex digest.
 */
export function md5(input) {
  const msg = input instanceof Uint8Array ? input : new Uint8Array(input);
  const n = msg.length;

  // Pad: 0x80, zeros, then the original bit length as a 64-bit little-endian int.
  const withOne = n + 1;
  const padZeros =
    withOne % 64 <= 56 ? 56 - (withOne % 64) : 120 - (withOne % 64);
  const total = withOne + padZeros + 8;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[n] = 0x80;
  const bitsLo = (n << 3) >>> 0;
  const bitsHi = (n >>> 29) >>> 0;
  buf[total - 8] = bitsLo & 0xff;
  buf[total - 7] = (bitsLo >>> 8) & 0xff;
  buf[total - 6] = (bitsLo >>> 16) & 0xff;
  buf[total - 5] = (bitsLo >>> 24) & 0xff;
  buf[total - 4] = bitsHi & 0xff;
  buf[total - 3] = (bitsHi >>> 8) & 0xff;
  buf[total - 2] = (bitsHi >>> 16) & 0xff;
  buf[total - 1] = (bitsHi >>> 24) & 0xff;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Int32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      M[i] =
        buf[j] | (buf[j + 1] << 8) | (buf[j + 2] << 16) | (buf[j + 3] << 24);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i])) | 0;
    }

    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  return hexLE(a0) + hexLE(b0) + hexLE(c0) + hexLE(d0);
}
