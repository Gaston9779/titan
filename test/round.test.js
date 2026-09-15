import test from "node:test";
import assert from "node:assert/strict";
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";

const cfg = defaultConfig();

test("round is deterministic (same seed+index => identical RoundResult)", () => {
  const a = resolveRound(cfg, 7n, 3);
  const b = resolveRound(cfg, 7n, 3);
  assert.deepStrictEqual(a, b);
});

test("round is deterministic with tag stream logging", () => {
  const a = resolveRound(cfg, 7n, 3, { logTags: true });
  const b = resolveRound(cfg, 7n, 3, { logTags: true });
  assert.deepStrictEqual(a, b);
  assert.ok(a.rngTags.length > 0);
});

test("different round indices give different results", () => {
  const a = resolveRound(cfg, 7n, 3);
  const b = resolveRound(cfg, 7n, 4);
  assert.notDeepStrictEqual(a, b);
});

const CONTRIB = ["BASE_CLUSTER", "CASCADE", "BLADE", "HAMMER", "SHIELD", "SHARD_MULT"];
const sumContrib = (r) => CONTRIB.reduce((a, t) => a + r.contributions[t], 0);

test("contributions always sum exactly to cappedWin (all feature tags)", () => {
  for (let i = 0; i < 4000; i++) {
    const r = resolveRound(cfg, 55n, i);
    assert.equal(sumContrib(r), r.cappedWin, `round ${i}`);
  }
});

test("max-win cap truncates exactly and halts the round", () => {
  const capped = defaultConfig({ maxWinMicro: Math.round(0.1 * MICRO) });
  let sawCap = 0;
  for (let i = 0; i < 800; i++) {
    const r = resolveRound(capped, 3n, i);
    if (r.capped) {
      sawCap++;
      assert.equal(r.cappedWin, capped.maxWinMicro);
      assert.equal(r.diagnostics.capReached, true);
      assert.equal(sumContrib(r), capped.maxWinMicro);
    }
  }
  assert.ok(sawCap > 0, "expected some rounds to hit the low test cap");
});

test("cascade depth respects the hard cap", () => {
  for (let i = 0; i < 3000; i++) {
    const r = resolveRound(cfg, 88n, i);
    assert.ok(r.diagnostics.maxCascadeDepth <= cfg.cascadeDepthHardCap);
  }
});

test("bonus flag iff paid-spin core count >= threshold (unless capped in the paid spin)", () => {
  for (let i = 0; i < 3000; i++) {
    const r = resolveRound(cfg, 21n, i);
    const expect = r.diagnostics.coreCount >= 3 && !(r.capped && r.bonus === null);
    assert.equal(r.diagnostics.bonusTriggered, expect);
    if (r.bonus) assert.ok(r.bonus.freeSpinsPlayed >= 1);
  }
});

test("no negative or NaN payouts over a sample", () => {
  for (let i = 0; i < 5000; i++) {
    const r = resolveRound(cfg, 101n, i);
    assert.ok(Number.isFinite(r.cappedWin) && r.cappedWin >= 0);
    assert.ok(r.cappedWin <= cfg.maxWinMicro);
  }
});
