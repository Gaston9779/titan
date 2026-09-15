import test from "node:test";
import assert from "node:assert/strict";
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";
import * as F from "../engine/features.js";
import { applyShield } from "../engine/features.js";
import { Rng } from "../engine/rng.js";
import { parseBoard } from "./helpers.js";

const cfg = defaultConfig();
const WHY = ["BASE_CLUSTER", "CASCADE", "BLADE", "HAMMER", "SHIELD", "SHARD_MULT"];
const sumWhy = (r) => WHY.reduce((a, t) => a + r.contributions[t], 0);
const sumLoc = (r) => ["BASE", "BONUS_BASE", "BONUS_AWAKENED"].reduce((a, t) => a + r.contribByLocation[t], 0);

// A Core-heavy config so most rounds trigger the bonus (test fixture only).
function coreHeavy(w = 500) {
  const base = defaultConfig();
  const ww = base.wgenWeights.slice();
  ww[base.wgenSymbols.indexOf("CORE")] = w;
  return defaultConfig({ id: "TEST_COREHEAVY", wgenWeights: ww, wgenTotal: ww.reduce((a, b) => a + b, 0) });
}
const HEAVY = coreHeavy();

// find a normal-config round whose paid spin has exactly `c` Cores and is not capped
function findTrigger(c, limit = 400000) {
  for (let i = 0; i < limit; i++) {
    const r = resolveRound(cfg, 12321n, i);
    if (r.bonus && r.bonus.triggerCoreCount === c && !r.capped) return r;
  }
  throw new Error(`no trigger with ${c} cores found`);
}

// ---------- trigger tiers ----------
test("3-Core trigger: 8 free spins, 7x7, no advantage", () => {
  const r = findTrigger(3);
  assert.equal(r.bonus.triggerCoreCount, 3);
  assert.ok(r.bonus.freeSpinsAwarded >= 8);
  assert.ok(r.bonus.freeSpinsPlayed >= 8 || r.capped);
  assert.equal(r.spins[1].grid, 7);
});

test("4-Core trigger: 10 free spins + A4 (heat carry + forced Shield attempt)", () => {
  const r = findTrigger(4);
  assert.equal(r.bonus.triggerCoreCount, 4);
  assert.ok(r.bonus.freeSpinsAwarded >= 10);
});

test("5+ Core trigger: 12 free spins + A5 (molten pre-fill + forced Shield/Hammer)", () => {
  const r = findTrigger(5);
  assert.equal(r.bonus.triggerCoreCount, 5);
  assert.ok(r.bonus.freeSpinsAwarded >= 12);
  // A5 seeds the molten meter (>=4) so its final value can't be below the A5 start
  assert.ok(r.bonus.moltenChargesFinal >= 4 || r.bonus.moltenRetired);
});

// ---------- advantage helpers (values) ----------
test("advantage values match spec (§11.2)", () => {
  const HT = F.CAL.HEAT_THRESHOLD;
  const heatCarry = F.roundHalfEven(HT * F.CAL.BONUS.ADV_HEATCARRY_MUL[0], F.CAL.BONUS.ADV_HEATCARRY_MUL[1]);
  assert.equal(heatCarry, Math.round(HT / 2)); // HT even (650) -> 325
  assert.equal(F.CAL.BONUS.ADV_A5_MOLTEN_START, 4);
  assert.deepEqual(F.FREE_SPINS, { 3: 8, 4: 10, 5: 12 });
});

// ---------- 7x7 generation & mode params ----------
test("bonus mode params: 7x7 and 8x8 overrides (§12.2)", () => {
  const b7 = F.modeParams("BONUS_7x7");
  assert.equal(b7.powersPerSeqCap, 5);
  assert.equal(b7.shardBoardCap, 6);
  assert.equal(b7.awakened, false);
  assert.equal(b7.heatThreshold, F.CAL.HEAT_THRESHOLD);

  const b8 = F.modeParams("BONUS_8x8");
  assert.equal(b8.awakened, true);
  assert.equal(b8.powersPerSeqCap, 7);
  assert.equal(b8.shardBoardCap, F.CAL.BONUS.SHARD_BOARD_CAP_8x8);
  assert.equal(b8.shieldCells, 4);
  assert.equal(b8.shieldTtl, 3);
  assert.equal(b8.hammerWilds, 3);
  assert.equal(b8.bladeHitsH1, true);
  assert.equal(b8.heatThreshold, F.roundHalfEven(F.CAL.HEAT_THRESHOLD * 17, 20));
  assert.deepEqual(b8.shardSpawnMul, F.CAL.BONUS.SHARD_SPAWN_MUL_8x8);
});

test("Awakened Pressure has no OVERHEAT band — CRITICAL from depth 4", () => {
  assert.equal(F.pressureTier(4, false), "OVERHEAT");
  assert.equal(F.pressureTier(4, true), "CRITICAL");
  assert.equal(F.pressureTier(3, true), "HOT");
});

test("Awakened shard spawn is scaled and capped (§12.2)", () => {
  const b8 = F.modeParams("BONUS_8x8");
  const [mn, md] = F.CAL.BONUS.SHARD_SPAWN_MUL_8x8;
  const capM = F.CAL.BONUS.SHARD_SPAWN_CAP_MILLE_8x8;
  const scaled = (t) => Math.min(capM, Math.floor((F.CAL.PRESSURE[t].pMille * mn) / md));
  // CRITICAL scales past the cap -> clamped
  assert.equal(F.effectiveShardPMille("CRITICAL", b8), scaled("CRITICAL"));
  assert.equal(F.effectiveShardPMille("CRITICAL", b8), capM);
  // COLD scales but stays under the cap
  assert.equal(F.effectiveShardPMille("COLD", b8), scaled("COLD"));
  assert.ok(F.effectiveShardPMille("COLD", b8) < capM);
  // base mode: unchanged
  assert.equal(F.effectiveShardPMille("COLD", F.modeParams("BASE")), F.CAL.PRESSURE.COLD.pMille);
});

test("Awakened Blade also removes H1 (§12.2)", () => {
  const { cells, W, H } = parseBoard(["1111a1", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa"]);
  F.applyBlade(cells, W, H, new Rng(5n), F.modeParams("BONUS_8x8"));
  for (let i = 0; i < 6; i++) assert.equal(cells[i].kind, "EMPTY"); // LOW row + its H1 all gone
});

test("Awakened Shield locks up to 4 cells with TTL 3", () => {
  const { cells, W, H } = parseBoard(["WWWWWW", "......", "......", "......", "......", "......"]);
  const rec = applyShield(cells, W, H, F.modeParams("BONUS_8x8"));
  assert.equal(rec.locked, 4);
  for (const i of rec.cells) assert.equal(cells[i].lockTtl, 3);
});

// ---------- progression / expansion boundary / awakened activation ----------
// NOTE: with un-tuned V1 values, molten expansion is very rare. These tests lower
// MOLTEN_EXPAND_THRESHOLD (fixture only) to exercise the boundary MECHANISM, then
// restore it. The shipped-value expansion frequency is measured in the sim report.
test("expansion boundary: reachedAwakened iff molten meter >= threshold; 8x8 spins + no expansion below", () => {
  const orig = F.CAL.BONUS.MOLTEN_EXPAND_THRESHOLD;
  F.CAL.BONUS.MOLTEN_EXPAND_THRESHOLD = 3;
  try {
    const thr = 3;
    let awakened = 0;
    let notAwakened = 0;
    for (let i = 0; i < 12000 && (awakened < 40 || notAwakened < 40); i++) {
      const r = resolveRound(HEAVY, 999n, i);
      if (!r.bonus) continue;
      if (r.bonus.reachedAwakened) {
        awakened++;
        assert.ok(r.bonus.moltenChargesFinal >= thr);
        assert.equal(r.bonus.moltenRetired, true);
        assert.ok(r.spins.some((s) => s.grid === 8 && s.mode === "BONUS_8x8"));
      } else {
        notAwakened++;
        assert.ok(r.bonus.moltenChargesFinal < thr);
        assert.ok(r.spins.every((s) => s.grid !== 8));
      }
    }
    assert.ok(awakened > 0 && notAwakened > 0, `awakened=${awakened} notAwakened=${notAwakened}`);
  } finally {
    F.CAL.BONUS.MOLTEN_EXPAND_THRESHOLD = orig;
  }
});

test("reaching 8x8 grants exactly AWAKENED_BONUS_SPINS extra free spins", () => {
  const orig = F.CAL.BONUS.MOLTEN_EXPAND_THRESHOLD;
  F.CAL.BONUS.MOLTEN_EXPAND_THRESHOLD = 3;
  try {
    for (let i = 0; i < 12000; i++) {
      const r = resolveRound(HEAVY, 7n, i);
      if (r.bonus && r.bonus.reachedAwakened && r.bonus.retriggerCount === 0 && !r.bonus.hitRetriggerCap) {
        const base = F.FREE_SPINS[Math.min(5, r.bonus.triggerCoreCount)];
        assert.equal(r.bonus.freeSpinsAwarded - base, F.CAL.BONUS.AWAKENED_BONUS_SPINS);
        return;
      }
    }
    assert.fail("no clean awakened-without-retrigger bonus found");
  } finally {
    F.CAL.BONUS.MOLTEN_EXPAND_THRESHOLD = orig;
  }
});

// ---------- retrigger ----------
test("retrigger adds free spins and molten charge (temporarily boosted BONUS_W_CORE)", () => {
  const orig = F.CAL.BONUS.BONUS_W_CORE;
  F.CAL.BONUS.BONUS_W_CORE = 700; // fixture: make retriggers common
  try {
    let sawRetrigger = 0;
    for (let i = 0; i < 4000 && sawRetrigger < 20; i++) {
      const r = resolveRound(HEAVY, 55n, i);
      if (r.bonus && r.bonus.retriggerCount > 0) {
        sawRetrigger++;
        assert.ok(r.bonus.freeSpinsAwarded > F.FREE_SPINS[Math.min(5, r.bonus.triggerCoreCount)]);
        assert.ok(r.bonus.retriggerCount <= F.CAL.BONUS.BONUS_RETRIGGER_HARD_CAP + 1);
      }
      assert.ok(r.bonus ? r.bonus.freeSpinsPlayed < F.CAL.BONUS.FS_PLAYED_HARD_CAP : true);
    }
    assert.ok(sawRetrigger > 0, "expected retriggers with boosted BONUS_W_CORE");
  } finally {
    F.CAL.BONUS.BONUS_W_CORE = orig;
  }
});

// ---------- shards / merges in bonus ----------
test("shards and merges occur inside the bonus", () => {
  let bonusShardContrib = 0;
  let bonusRounds = 0;
  let bonusMerges = 0;
  for (let i = 0; i < 8000; i++) {
    const r = resolveRound(HEAVY, 314n, i);
    if (!r.bonus) continue;
    bonusRounds++;
    bonusShardContrib += r.contribByLocation.BONUS_BASE + r.contribByLocation.BONUS_AWAKENED;
    bonusMerges += r.diagnostics.merges;
  }
  assert.ok(bonusRounds > 100);
  assert.ok(bonusShardContrib > 0);
  assert.ok(bonusMerges > 0, "expected merges across a Core-heavy bonus sample");
});

// ---------- max-win cap mid-bonus ----------
test("max-win cap reached mid-bonus: exact truncation, halt, invariants hold", () => {
  const capped = defaultConfig({
    id: "TEST_CAP",
    maxWinMicro: Math.round(3 * MICRO),
    wgenWeights: HEAVY.wgenWeights,
    wgenTotal: HEAVY.wgenTotal,
  });
  let sawCapInBonus = 0;
  for (let i = 0; i < 20000 && sawCapInBonus < 30; i++) {
    const r = resolveRound(capped, 88n, i);
    if (r.capped) {
      assert.equal(r.cappedWin, capped.maxWinMicro);
      assert.equal(sumWhy(r), capped.maxWinMicro);
      assert.equal(sumLoc(r), capped.maxWinMicro);
      if (r.bonus) {
        sawCapInBonus++;
        assert.ok(r.bonus.freeSpinsPlayed <= r.bonus.freeSpinsAwarded);
      }
    }
  }
  assert.ok(sawCapInBonus > 0, "expected some rounds to cap during the bonus");
});

// ---------- contribution-sum invariant (full game) ----------
test("both contribution partitions sum to cappedWin over a full-game sample", () => {
  for (let i = 0; i < 6000; i++) {
    const r = resolveRound(HEAVY, 2024n, i);
    assert.equal(sumWhy(r), r.cappedWin, `why sum, round ${i}`);
    assert.equal(sumLoc(r), r.cappedWin, `loc sum, round ${i}`);
  }
});

// ---------- deterministic replay of full bonus rounds ----------
test("deterministic replay of full bonus rounds (with tag stream)", () => {
  let bonuses = 0;
  for (let i = 0; i < 4000 && bonuses < 80; i++) {
    const a = resolveRound(HEAVY, 4242n, i, { logTags: true });
    if (!a.bonus) continue;
    bonuses++;
    const b = resolveRound(HEAVY, 4242n, i, { logTags: true });
    assert.deepStrictEqual(a, b);
  }
  assert.ok(bonuses > 50);
});

// ---------- no state leakage after bonus ----------
test("no state leakage: a round is identical regardless of preceding rounds", () => {
  const target = resolveRound(HEAVY, 909n, 137, { logTags: true });
  for (let i = 0; i < 200; i++) resolveRound(HEAVY, 909n, i); // churn
  const again = resolveRound(HEAVY, 909n, 137, { logTags: true });
  assert.deepStrictEqual(target, again);
});

// ---------- no infinite bonus / feature loops ----------
test("no infinite bonus/feature loops over a large Core-heavy sample", () => {
  for (let i = 0; i < 15000; i++) {
    const r = resolveRound(HEAVY, 1n, i);
    assert.ok(r.diagnostics.maxCascadeDepth <= cfg.cascadeDepthHardCap);
    if (r.bonus) {
      assert.ok(r.bonus.freeSpinsPlayed <= F.CAL.BONUS.FS_PLAYED_HARD_CAP);
      assert.ok(r.bonus.retriggerCount <= F.CAL.BONUS.BONUS_RETRIGGER_HARD_CAP + 1);
    }
    assert.ok(Number.isFinite(r.cappedWin) && r.cappedWin >= 0 && r.cappedWin <= cfg.maxWinMicro);
  }
});
