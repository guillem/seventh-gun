// Deterministic seeded RNG (sfc32). The sim draws randomness only from here.

export interface Rng {
  float(): number;
  range(min: number, max: number): number;
  int(n: number): number;
  rangeInt(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  state(): number[];
  setState(s: number[]): void;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeRng(seedStr: string): Rng {
  const h1 = fnv1a(seedStr);
  const h2 = fnv1a(seedStr + '::a');
  const h3 = fnv1a(seedStr + '::b');
  const h4 = fnv1a(seedStr + '::c');
  let a = h1 >>> 0, b = h2 >>> 0, c = h3 >>> 0, d = h4 >>> 0;
  function next(): number {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  }
  // warm up
  for (let i = 0; i < 12; i++) next();
  return {
    float: next,
    range(min, max) { return min + next() * (max - min); },
    int(n) { return Math.floor(next() * n); },
    rangeInt(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    chance(p) { return next() < p; },
    pick<T>(arr: readonly T[]): T { return arr[Math.floor(next() * arr.length)]; },
    state() { return [a, b, c, d]; },
    setState(s: number[]) { a = s[0] >>> 0; b = s[1] >>> 0; c = s[2] >>> 0; d = s[3] >>> 0; },
  };
}

export function hashString(str: string): number {
  return fnv1a(str);
}
