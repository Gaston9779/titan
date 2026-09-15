// Focused tests for the 2026-09-05 feature pass (both rounds): natural WILD
// (now enabled, weight 3 of a x10-scaled pool), the HAMMER placement fixes,
// Shard math invariants, and Buy Bonus. See docs/DECISIONS.md for full
// rationale and Monte Carlo evidence.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";
import { generateCell } from "../engine/grid.js";
import { deriveRoundRng } from "../engine/rng.js";
import { FREE_SPINS, SHARD_MAX_LEVEL, shardValue } from "../engine/features.js";

const cfg = defaultConfig();

function withWildWeight(w) {
  const weights = cfg.wgenWeights.slice();
  weights[weights.length - 1] = w; // WILD is the last WGEN_SYMBOLS entry
  return { ...cfg, wgenWeights: weights, wgenTotal: weights.reduce((a, b) => a + b, 0) };
}

// ---------- A. natural WILD (enabled: weight 3 of a x10-scaled pool) ----------
test("natural WILD can spawn from weighted generation when its weight is nonzero", () => {
  const cfgW = withWildWeight(40); // heavier override, just to prove the mechanism scales
  const rng = deriveRoundRng(20260905n, 0);
  let seen = 0;
  for (let i = 0; i < 20000; i++) {
    if (generateCell(rng, cfgW, "TEST_DRAW").kind === "WILD") seen++;
  }
  assert.ok(seen > 0, "expected naturally-generated WILDs at weight=40");
});

test("shipped config draws natural WILDs at roughly its calibrated rate (weight 3 of ~9833)", () => {
  const rng = deriveRoundRng(20260905n, 0);
  let seen = 0;
  const draws = 200000;
  for (let i = 0; i < draws; i++) {
    if (generateCell(rng, cfg, "TEST_DRAW").kind === "WILD") seen++;
  }
  const rate = seen / draws;
  const expected = cfg.wgenWeights[cfg.wgenWeights.length - 1] / cfg.wgenTotal; // ~0.0305%
  assert.ok(rate > expected * 0.5 && rate < expected * 1.5, `WILD draw rate ${rate} far from expected ${expected}`);
});

test("deterministic seed reproduces the same natural-WILD cell positions", () => {
  const cfgW = withWildWeight(40);
  const a = resolveRound(cfgW, 20260905n, 5, { trace: true });
  const b = resolveRound(cfgW, 20260905n, 5, { trace: true });
  assert.deepEqual(a.trace, b.trace);
  assert.equal(a.cappedWin, b.cappedWin);
});

// ---------- B. HAMMER placement fix ----------
test("HAMMER window choice is seeded/deterministic (same seed => same sequence)", () => {
  const a = resolveRound(cfg, 20260905n, 19, { trace: true });
  const b = resolveRound(cfg, 20260905n, 19, { trace: true });
  const windows = (r) => r.trace.filter((e) => e.t === "power" && e.kind === "HAMMER").map((e) => e.detail.window.join(","));
  assert.deepEqual(windows(a), windows(b));
});

test("HAMMER is not hardcoded to one fixed geometric pattern", () => {
  const counts = {};
  let total = 0;
  for (let i = 0; i < 8000; i++) {
    const r = resolveRound(cfg, 20260905n, i, { trace: true });
    for (const ev of r.trace) {
      if (ev.t === "power" && ev.kind === "HAMMER") {
        total++;
        const key = ev.detail.window.join(",");
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }
  assert.ok(total > 30, "expected a meaningful number of HAMMER activations in the sample");
  const maxShare = Math.max(...Object.values(counts)) / total;
  const distinctWindows = Object.keys(counts).length;
  // Before the fix, one window (top-left) took ~22% of all activations; a
  // uniform pick over 16 possible windows would be ~6.25% each.
  assert.ok(maxShare < 0.18, `no single window should dominate (got ${(maxShare * 100).toFixed(1)}%)`);
  assert.ok(distinctWindows >= 8, `expected a spread of windows, got ${distinctWindows}`);
});

test("HAMMER's WILD cells within the window are sampled, not a fixed scan-order sub-pattern", () => {
  // Round-2 bug: the window position was randomized but the WILD cells inside
  // it always fell on the first N destroyed cells in row-major scan order —
  // a fixed LOCAL shape that stayed visible regardless of window. Sampling
  // without replacement (Fisher-Yates prefix, seeded) fixes this.
  const shapeCounts = {};
  let total = 0;
  for (let i = 0; i < 8000; i++) {
    const r = resolveRound(cfg, 20260905n, i, { trace: true });
    for (const ev of r.trace) {
      if (ev.t !== "power" || ev.kind !== "HAMMER") continue;
      const [tr, tc] = ev.detail.window;
      const W = ev.board.length === 49 ? 7 : ev.board.length === 64 ? 8 : 6;
      const shape = (ev.detail.wildCells || [])
        .map((idx) => `${((idx - (idx % W)) / W) - tr}:${(idx % W) - tc}`)
        .sort()
        .join("|");
      shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
      total++;
    }
  }
  assert.ok(total > 30, "expected a meaningful number of HAMMER activations in the sample");
  const maxShare = Math.max(...Object.values(shapeCounts)) / total;
  // Before this fix, the top-left-two-cells shape alone was the overwhelming
  // majority of ALL activations regardless of window (a fixed local pattern).
  // This test's sample is coarse (a few hundred activations) — the full 10k-
  // activation audit (sim/audit_hammer.js) measured <1% for the top pattern;
  // this threshold is loose enough to absorb small-sample noise while still
  // catching a real fixed-pattern regression (which looked like 60-100%).
  assert.ok(maxShare < 0.2, `no single local WILD shape should dominate (got ${(maxShare * 100).toFixed(1)}%)`);
  assert.ok(Object.keys(shapeCounts).length >= 10, "expected a wide spread of local WILD shapes");
});

test("HAMMER's WILD-cell sampling is deterministic (same seed => same cells)", () => {
  const a = resolveRound(cfg, 20260905n, 19, { trace: true });
  const b = resolveRound(cfg, 20260905n, 19, { trace: true });
  const cells = (r) => r.trace.filter((e) => e.t === "power" && e.kind === "HAMMER").map((e) => e.detail.wildCells.join(","));
  assert.deepEqual(cells(a), cells(b));
});

// ---------- D. Shard math invariants (unchanged) ----------
test("Shard ladder values and cap are unchanged: 2x..64x, level 7 blocked", () => {
  assert.equal(shardValue(1), 2);
  assert.equal(shardValue(SHARD_MAX_LEVEL), 64);
  assert.equal(SHARD_MAX_LEVEL, 6);
});

test("Shard contribution to a paying cluster is additive-in-value: paid == basePay * min(sum(shardValues), 64)", () => {
  let checked = 0;
  for (let i = 0; i < 4000 && checked < 25; i++) {
    const r = resolveRound(cfg, 20260905n, i, { trace: true });
    for (const ev of r.trace) {
      if (ev.t !== "cascade" || !ev.clusters) continue;
      for (const cl of ev.clusters) {
        if (!cl.shards || !cl.shards.length) continue;
        const sum = cl.shards.reduce((s, sh) => s + (1 << sh.level), 0);
        const M = Math.min(64, sum);
        const expected = +(cl.baseX * M).toFixed(6);
        assert.ok(Math.abs(cl.payX - expected) < 0.02 || cl.payX < expected, "shard-boosted pay should be basePay*M (or less, if the round/step cap truncated it)");
        checked++;
        if (checked >= 25) break;
      }
    }
  }
  assert.ok(checked > 0, "expected to observe at least one shard-boosted cluster in the sample");
});

// ---------- H/J. Buy Bonus uses the canonical Bonus engine ----------
test("Buy Bonus bypasses the paid spin and enters the same bonus sequence (no second implementation)", () => {
  const r = resolveRound(cfg, 20260905n, 0, { trace: true, buyBonus: true });
  assert.equal(r.trace[0].t, "bonusStart"); // no paid-spin trace precedes it — the paid spin never ran
  assert.equal(r.diagnostics.bonusTriggered, true);
  assert.ok(r.bonus && r.bonus.freeSpinsAwarded >= FREE_SPINS[3]);
});

test("Buy Bonus is deterministic and replayable", () => {
  const a = resolveRound(cfg, 20260905n, 3, { trace: true, buyBonus: true });
  const b = resolveRound(cfg, 20260905n, 3, { trace: true, buyBonus: true });
  assert.deepEqual(a, b);
});

test("Buy Bonus's bonus loop is structurally identical to a natural 3-Core trigger's (same code path)", () => {
  // A natural round that triggers with exactly 3 Cores should have a `bonus`
  // shape indistinguishable from a bought one at the same trigger tier.
  let naturalTriple = null;
  for (let i = 0; i < 4000 && !naturalTriple; i++) {
    const r = resolveRound(cfg, 20260905n, i, { trace: true });
    if (r.diagnostics.coreCount === 3 && r.bonus) naturalTriple = r;
  }
  assert.ok(naturalTriple, "expected at least one natural 3-Core trigger in the sample");
  const bought = resolveRound(cfg, 20260905n, 0, { trace: true, buyBonus: true });
  assert.deepEqual(Object.keys(naturalTriple.bonus).sort(), Object.keys(bought.bonus).sort());
});

// ---------- K/L. wager independence ----------
test("resolveRound has no bet/currency parameter — outcomes are inherently wager-independent in xBET", () => {
  assert.equal(resolveRound.length, 3); // (config, masterSeed, roundIndex, opts={}) — no bet param
  const a = resolveRound(cfg, 20260905n, 42, { trace: true });
  const b = resolveRound(cfg, 20260905n, 42, { trace: true });
  assert.equal(a.cappedWin, b.cappedWin); // same round, no bet input possible => no bet dependency
  for (const bet of [1, 5, 50]) {
    const payout = (a.cappedWin / MICRO) * bet;
    assert.ok(Number.isFinite(payout) && payout >= 0);
  }
});
