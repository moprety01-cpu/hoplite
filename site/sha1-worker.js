// Brute-forces "<text> <n>" until its SHA-1 starts with the requested number of hex zeros.
// SHA-1 is written out by hand: crypto.subtle is asynchronous per call and far too slow for millions of tiny inputs.
const W = new Int32Array(80);
function sha1Head(bytes, len) {
  // Returns the first 32 bits of SHA-1(bytes[0..len)), the only part the search needs to look at; full hex on demand.
  return sha1(bytes, len)[0];
}
function sha1(bytes, len) {
  const blocks = ((len + 8) >> 6) + 1, words = new Int32Array(blocks * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  words[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
  words[blocks * 16 - 1] = len * 8;
  let h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476, h4 = 0xc3d2e1f0 | 0;
  for (let b = 0; b < blocks; b++) {
    for (let t = 0; t < 16; t++) W[t] = words[b * 16 + t];
    for (let t = 16; t < 80; t++) { const x = W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16]; W[t] = (x << 1) | (x >>> 31); }
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (bb & c) | (~bb & d) : t < 40 ? bb ^ c ^ d : t < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc | 0 : 0xca62c1d6 | 0;
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + W[t]) | 0;
      e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = tmp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4];
}
const hex = (h) => h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');

onmessage = ({ data: { text, zeros } }) => {
  const base = new TextEncoder().encode(text + ' ');
  const buf = new Uint8Array(base.length + 20);
  buf.set(base);
  const shift = 32 - 4 * zeros, t0 = performance.now();
  for (let n = 1; ; n++) {
    const digits = String(n);
    for (let i = 0; i < digits.length; i++) buf[base.length + i] = digits.charCodeAt(i);
    const len = base.length + digits.length;
    if (sha1Head(buf, len) >>> shift === 0) {
      postMessage({ n, ms: performance.now() - t0, nonce: n, hash: hex(sha1(buf, len)) });
      return;
    }
    if (n % 250000 === 0) postMessage({ n, ms: performance.now() - t0 });
  }
};
