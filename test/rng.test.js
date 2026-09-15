import test from "node:test";
import assert from "node:assert/strict";
import { Rng, deriveRoundRng } from "../engine/rng.js";

test("same seed produces identical u64 stream", () => {
  const a = new Rng(12345n);
  const b = new Rng(12345n);
  for (let i = 0; i < 1000; i++) assert.equal(a.nextU64(), b.nextU64());
});

test("different seeds diverge", () => {
  const a = new Rng(1n);
  const b = new Rng(2n);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.nextU64() === b.nextU64()) same++;
  assert.ok(same < 5);
});

test("nextInt stays in range and is roughly uniform", () => {
  const r = new Rng(77n);
  const counts = new Array(6).fill(0);
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const v = r.nextInt(6);
    assert.ok(v >= 0 && v < 6);
    counts[v]++;
  }
  for (const c of counts) assert.ok(Math.abs(c - N / 6) < N / 6 * 0.1);
});

test("drawWeighted respects weights", () => {
  const r = new Rng(5n);
  const w = [1, 9];
  let ones = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) if (r.drawWeighted(w, 10) === 1) ones++;
  assert.ok(Math.abs(ones / N - 0.9) < 0.02);
});

test("deriveRoundRng is stable per (seed, roundIndex) and distinct across rounds", () => {
  const x1 = deriveRoundRng(999n, 3).nextU64();
  const x2 = deriveRoundRng(999n, 3).nextU64();
  const y = deriveRoundRng(999n, 4).nextU64();
  assert.equal(x1, x2);
  assert.notEqual(x1, y);
});
