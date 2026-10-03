// Pass 5A: deterministic randomness. Every random choice the generator makes comes from a named stream derived
// from the world seed, never from Math.random or the clock. Streams are keyed (seed, 'terrain'), (seed, 'building',
// id), ... so adding a capability or a district draws from its own stream and cannot shift any earlier decision.

// xmur3-style string hash to 32 bits.
export function hash32(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// sfc32, seeded from the hashed key. Returns a small helper object over one stream.
export function rng(seed, ...keys) {
  const k = [String(seed), ...keys.map(String)].join('␟');
  let a = hash32(`${k}|a`), b = hash32(`${k}|b`), c = hash32(`${k}|c`), d = hash32(`${k}|d`);
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0;
    t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();
  const r = {
    next,
    float: (lo = 0, hi = 1) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: p => next() < p,
    pick: list => list[Math.floor(next() * list.length)],
    shuffle: list => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; },
  };
  return r;
}

// Stable JSON (sorted keys) and a content fingerprint, so "the same world" is a checkable statement.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
export function fingerprint(value) {
  const s = stableStringify(value);
  // Four independent 32-bit hashes: a 128-bit identity, dependency free (the browser can compute it too).
  return [0, 1, 2, 3].map(i => hash32(`${i}:${s}`).toString(16).padStart(8, '0')).join('');
}
