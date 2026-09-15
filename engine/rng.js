// Deterministic RNG per docs/02_MATH_SPEC.md §15.4.
// Primitive: nextU64(). Simulation generator: xoshiro256** seeded via splitmix64.
// Per-round substream: derive(masterSeed, roundIndex) -> independent stream.
// Selection is integer-only (nextInt), never float, for cross-platform determinism.

const MASK = (1n << 64n) - 1n;

function rotl(x, k) {
  return ((x << k) | (x >> (64n - k))) & MASK;
}

function splitmix64(state) {
  let z = (state + 0x9e3779b97f4a7c15n) & MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return z ^ (z >> 31n);
}

export class Rng {
  constructor(seed64, logTags = false) {
    // seed the 256-bit state from a single 64-bit seed
    let s = seed64 & MASK;
    this.s = new Array(4);
    for (let i = 0; i < 4; i++) {
      s = (s + 0x9e3779b97f4a7c15n) & MASK;
      this.s[i] = splitmix64(s);
    }
    this.tags = logTags ? [] : null;
    this.draws = 0;
  }

  nextU64() {
    const [s0, s1, s2, s3] = this.s;
    const result = (rotl((s1 * 5n) & MASK, 7n) * 9n) & MASK;
    const t = (s1 << 17n) & MASK;
    let n2 = s2 ^ s0;
    let n3 = s3 ^ s1;
    const n1 = s1 ^ n2;
    const n0 = s0 ^ n3;
    n2 ^= t;
    n3 = rotl(n3, 45n);
    this.s = [n0, n1, n2, n3];
    this.draws++;
    return result;
  }

  // uniform [0,1) with 53-bit mantissa (used only for reporting-grade needs, not selection)
  nextFloat() {
    return Number(this.nextU64() >> 11n) * (1 / 9007199254740992);
  }

  // unbiased integer in [0, n) via Lemire's method (n: positive JS integer < 2^53)
  nextInt(n) {
    if (n <= 0) throw new Error("nextInt: n must be > 0");
    const bn = BigInt(n);
    let x = this.nextU64();
    let m = x * bn;
    let l = m & MASK;
    if (l < bn) {
      const threshold = ((MASK + 1n - bn) % bn);
      while (l < threshold) {
        x = this.nextU64();
        m = x * bn;
        l = m & MASK;
      }
    }
    return Number(m >> 64n);
  }

  // weighted categorical draw over an array of positive integer weights
  drawWeighted(weights, total) {
    const r = this.nextInt(total);
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r < acc) return i;
    }
    return weights.length - 1; // unreachable if total == Σweights
  }

  tag(purpose) {
    if (this.tags) this.tags.push(purpose);
  }
}

// Independent, count-order-stable substream for a given round.
export function deriveRoundRng(masterSeed, roundIndex, logTags = false) {
  const m = BigInt(masterSeed) & MASK;
  const idx = BigInt(roundIndex) & MASK;
  const seed = splitmix64((m ^ splitmix64(idx * 0x9e3779b97f4a7c15n)) & MASK);
  return new Rng(seed, logTags);
}
