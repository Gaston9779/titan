import test from "node:test";
import assert from "node:assert/strict";
import { parseBoard, setShard, stubRng } from "./helpers.js";
import { Rng, deriveRoundRng } from "../engine/rng.js";
import { resolveRound } from "../engine/round.js";
import { defaultConfig } from "../engine/config.js";
import { countKind } from "../engine/grid.js";
import * as F from "../engine/features.js";

const cfg = defaultConfig();

// ---------- Heat ----------
test("heatGain: minimum LOW cluster at depth 1 COLD = CLASS_LOW centi", () => {
  const { cells } = parseBoard(["11111."]);
  const cl = [0, 1, 2, 3, 4];
  assert.equal(F.heatGainCenti(cells, cl, 1, "COLD"), F.CAL.CLASS_LOW);
});

test("heatGain: HIGH scales up, deeper cascades scale up, threshold is positive", () => {
  const { cells } = parseBoard(["dddddddddd"]);
  const cl = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // 10 HIGH
  const d1 = F.heatGainCenti(cells, cl, 1, "COLD"); // 6*CLASS_HIGH
  const d5 = F.heatGainCenti(cells, cl, 5, "CRITICAL");
  assert.equal(d1, 6 * F.CAL.CLASS_HIGH);
  assert.ok(d5 > d1);
  assert.ok(F.CAL.HEAT_THRESHOLD > 0);
});

test("heatGain: wild cells lower the blended class weight", () => {
  const plain = parseBoard(["bbbbbb"]).cells;
  const withW = parseBoard(["bbbWbb"]).cells;
  const g1 = F.heatGainCenti(plain, [0, 1, 2, 3, 4, 5], 1, "COLD");
  const g2 = F.heatGainCenti(withW, [0, 1, 2, 3, 4, 5], 1, "COLD");
  assert.ok(g2 < g1);
});

// ---------- Pressure ----------
test("pressure tier progression follows CAL.PRESSURE_DEPTH monotonically", () => {
  const d = F.CAL.PRESSURE_DEPTH;
  assert.equal(F.pressureTier(0), "COLD");
  assert.equal(F.pressureTier(1), "COLD");
  assert.equal(F.pressureTier(d.WARM), "WARM");
  assert.equal(F.pressureTier(d.HOT), "HOT");
  assert.equal(F.pressureTier(d.CRITICAL), "CRITICAL");
  assert.equal(F.pressureTier(40), "CRITICAL");
  // p_shardSpawn and column-pull are monotone non-decreasing across tiers
  const order = ["COLD", "WARM", "HOT", "OVERHEAT", "CRITICAL"];
  for (let i = 1; i < order.length; i++) {
    assert.ok(F.pressureParams(order[i]).pMille >= F.pressureParams(order[i - 1]).pMille);
  }
  assert.equal(F.pressureParams("COLD").pull, false);
  assert.equal(F.pressureParams("CRITICAL").pull, true);
});

// ---------- Blade ----------
test("Blade removes every non-locked LOW on its chosen line", () => {
  const { cells, W, H } = parseBoard([
    "111111",
    "aaaaaa",
    "aaaaaa",
    "aaaaaa",
    "aaaaaa",
    "aaaaaa",
  ]);
  const rec = F.applyBlade(cells, W, H, new Rng(3n));
  assert.equal(rec.type, "BLADE");
  assert.equal(rec.removed, 6); // the LOW row
  for (let i = 0; i < 6; i++) assert.equal(cells[i].kind, "EMPTY");
});

test("Blade never touches locked LOW or non-LOW symbols", () => {
  const { cells, W, H } = parseBoard(["1111a1", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa"], {
    2: { locked: true, lockTtl: 2 },
  });
  F.applyBlade(cells, W, H, new Rng(9n));
  assert.equal(cells[2].kind, "SYM"); // locked LOW survived
  assert.equal(cells[4].kind, "SYM"); // the H1 survived
});

// ---------- Hammer ----------
test("Hammer smashes a 3x3 window and plants HAMMER_WILDS wilds", () => {
  const rows = ["111aaa", "111aaa", "111aaa", "aaaaaa", "aaaaaa", "aaaaaa"];
  const { cells, W, H } = parseBoard(rows);
  const ctx = { shardCount: 0 };
  const rec = F.applyHammer(cells, W, H, ctx, new Rng(9n));
  assert.equal(rec.type, "HAMMER");
  assert.deepEqual(rec.window, [0, 0]);
  assert.equal(rec.wilds, F.HAMMER_WILDS);
  assert.equal(countKind(cells, "WILD"), F.HAMMER_WILDS);
});

test("Hammer destroys unlocked Shards in the window and updates the count", () => {
  const rows = ["111aaa", "1S1aaa", "111aaa", "aaaaaa", "aaaaaa", "aaaaaa"];
  const { cells, W, H } = parseBoard(rows);
  const ctx = { shardCount: 1 };
  const rec = F.applyHammer(cells, W, H, ctx, new Rng(9n));
  assert.equal(rec.destroyedShards, 1);
  assert.equal(ctx.shardCount, 0);
});

// ---------- Shield ----------
test("Shield locks highest-weight valuable cells up to SHIELD_CELLS", () => {
  const rows = ["S...W.", "....S.", "......", "......", "......", "......"];
  const { cells, W, H } = parseBoard(rows);
  setShard(cells, 0, 5); // 32x
  const rec = F.applyShield(cells, W, H);
  assert.equal(rec.type, "SHIELD");
  assert.equal(rec.locked, 3); // shard32, wild, shard2
  let locked = 0;
  for (const c of cells) if (c.locked) locked++;
  assert.equal(locked, 3);
});

test("Shield lock persistence: expires after SHIELD_TTL cascade steps", () => {
  const { cells } = parseBoard(["W....."]);
  cells[0].locked = true;
  cells[0].lockTtl = F.SHIELD_TTL;
  F.decrementLocks(cells);
  assert.equal(cells[0].locked, true);
  F.decrementLocks(cells);
  assert.equal(cells[0].locked, false);
});

test("Shield never exceeds SHIELD_MAX_ACTIVE", () => {
  const rows = ["WWWWWW", "SSSSSS", "......", "......", "......", "......"];
  const { cells, W, H } = parseBoard(rows);
  F.applyShield(cells, W, H);
  F.applyShield(cells, W, H);
  let locked = 0;
  for (const c of cells) if (c.locked) locked++;
  assert.ok(locked <= F.SHIELD_MAX_ACTIVE);
});

// ---------- Shard spawn ----------
test("Shard spawn frequency tracks the pressure tier probability", () => {
  const rng = deriveRoundRng(12345n, 0);
  const depth = F.CAL.PRESSURE_DEPTH.CRITICAL;
  const expected = F.CAL.PRESSURE[F.pressureTier(depth)].pMille / 1000;
  let spawns = 0;
  const N = 8000;
  for (let i = 0; i < N; i++) {
    const cells = [{ kind: "EMPTY", locked: false }];
    const ctx = { depth, shardCount: 0, shardsSpawned: 0 };
    F.refillCellMaybeShard(cells, 0, rng, cfg, ctx, "REFILL", "SHARD_ROLL");
    if (cells[0].kind === "SHARD") spawns++;
  }
  assert.ok(Math.abs(spawns / N - expected) < 0.02, `spawn rate ${spawns / N} vs ${expected}`);
});

test("Shard spawn is skipped when board is at SHARD_BOARD_CAP", () => {
  const rng = deriveRoundRng(1n, 1);
  const cells = [{ kind: "EMPTY", locked: false }];
  const ctx = { depth: 5, shardCount: F.SHARD_BOARD_CAP, shardsSpawned: 0 };
  const before = rng.draws;
  F.refillCellMaybeShard(cells, 0, rng, cfg, ctx, "REFILL", "SHARD_ROLL");
  assert.notEqual(cells[0].kind, "SHARD");
  assert.equal(rng.draws, before + 1); // only the symbol draw, no roll draw
});

// ---------- Merge ----------
test("simultaneous mergeable pairs resolve one-per-pass, deterministically", () => {
  const build = () => {
    const { cells, W, H } = parseBoard(["SSS...", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa"]);
    return { cells, W, H };
  };
  const run = () => {
    const { cells, W, H } = build();
    const ctx = { depth: 0, shardCount: 3, shardsSpawned: 0, merges: 0, mergesByLevel: {}, maxShardLevel: 1 };
    F.settleMerges(cells, W, H, stubRng(), cfg, ctx);
    return { cells, ctx };
  };
  const a = run();
  const b = run();
  assert.equal(a.ctx.merges, 1);
  const shards = a.cells.filter((c) => c.kind === "SHARD");
  assert.equal(shards.length, 2);
  assert.deepEqual(shards.map((s) => s.shardLevel).sort(), [1, 2]);
  assert.deepEqual(
    a.cells.map((c) => (c.kind === "SHARD" ? c.shardLevel : c.kind)),
    b.cells.map((c) => (c.kind === "SHARD" ? c.shardLevel : c.kind)),
  );
});

test("chain merges: a vertical stack of 4 level-1 shards resolves to one level-3", () => {
  const { cells, W, H } = parseBoard([
    "a.....",
    "a.....",
    "S.....",
    "S.....",
    "S.....",
    "S.....",
  ]);
  const ctx = { depth: 0, shardCount: 4, shardsSpawned: 0, merges: 0, mergesByLevel: {}, maxShardLevel: 1 };
  F.settleMerges(cells, W, H, stubRng(), cfg, ctx);
  const shards = cells.filter((c) => c.kind === "SHARD");
  assert.equal(ctx.merges, 3);
  assert.equal(shards.length, 1);
  assert.equal(shards[0].shardLevel, 3);
  assert.equal(ctx.maxShardLevel, 3);
});

test("max shard level: two level-6 shards do not merge", () => {
  const { cells, W, H } = parseBoard(["SS....", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa"]);
  setShard(cells, 0, 6);
  setShard(cells, 1, 6);
  const ctx = { depth: 0, shardCount: 2, shardsSpawned: 0, merges: 0, mergesByLevel: {}, maxShardLevel: 6 };
  F.settleMerges(cells, W, H, stubRng(), cfg, ctx);
  assert.equal(ctx.merges, 0);
  assert.equal(cells.filter((c) => c.kind === "SHARD").length, 2);
});

test("locked shards do not merge (Shield x Merge)", () => {
  const { cells, W, H } = parseBoard(["SS....", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa", "aaaaaa"]);
  cells[0].locked = true;
  cells[0].lockTtl = 2;
  const ctx = { depth: 0, shardCount: 2, shardsSpawned: 0, merges: 0, mergesByLevel: {}, maxShardLevel: 1 };
  F.settleMerges(cells, W, H, stubRng(), cfg, ctx);
  assert.equal(ctx.merges, 0);
});

test("Pressure x Shard: column-pull merge only at OVERHEAT/CRITICAL", () => {
  // two level-1 shards in a column, one SYM cell between them
  const rows = ["S.....", "a.....", "S.....", "aaaaaa", "aaaaaa", "aaaaaa"];
  const mk = () => parseBoard(rows);
  const noPullD = F.CAL.PRESSURE_DEPTH.WARM; // WARM: pull off
  const pullD = F.CAL.PRESSURE_DEPTH.CRITICAL; // CRITICAL: pull on
  const hot = mk();
  const ctxHot = { depth: noPullD, shardCount: 2, shardsSpawned: 0, merges: 0, mergesByLevel: {}, maxShardLevel: 1 };
  F.settleMerges(hot.cells, hot.W, hot.H, stubRng(), cfg, ctxHot);
  assert.equal(ctxHot.merges, 0);

  const crit = mk();
  const ctxCrit = { depth: pullD, shardCount: 2, shardsSpawned: 0, merges: 0, mergesByLevel: {}, maxShardLevel: 1 };
  F.settleMerges(crit.cells, crit.W, crit.H, stubRng(), cfg, ctxCrit);
  assert.equal(ctxCrit.merges, 1);
});

// ---------- Power x cascade, loops, replay ----------
test("Power selection + Power->cascade attribution machinery is exercised", () => {
  // NOTE: with the un-tuned V1 spec, Forge Powers are very rare (~1e-3/round);
  // this asserts the code paths work, not any target frequency.
  const pw = { BLADE: 0, HAMMER: 0, SHIELD: 0, NO_TARGET: 0 };
  const contrib = { BLADE: 0, HAMMER: 0, SHIELD: 0, SHARD_MULT: 0 };
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const r = resolveRound(cfg, 700n, i);
    for (const k of Object.keys(pw)) pw[k] += r.diagnostics.powersByType[k];
    for (const k of Object.keys(contrib)) if (r.contributions[k] > 0) contrib[k]++;
  }
  assert.ok(pw.BLADE > 0 && pw.HAMMER > 0 && pw.SHIELD > 0, `power mix seen: ${JSON.stringify(pw)}`);
  assert.ok(contrib.SHARD_MULT > 0, "SHARD_MULT attribution should appear");
  assert.ok(
    contrib.BLADE + contrib.HAMMER > 0,
    `expected at least one power-attributed win: ${JSON.stringify(contrib)}`,
  );
});

test("no infinite cascade / power loops; caps respected over a large sample", () => {
  for (let i = 0; i < 8000; i++) {
    const r = resolveRound(cfg, 4242n, i);
    assert.ok(r.diagnostics.maxCascadeDepth <= cfg.cascadeDepthHardCap);
    // powersByType is a round-level aggregate; the per-sequence cap (<= 7 in 8x8) is
    // enforced per spin. Round bound = max per-sequence cap x number of sequences.
    const seqs = 1 + (r.bonus ? r.bonus.freeSpinsPlayed : 0);
    assert.ok(r.diagnostics.powersByType.BLADE + r.diagnostics.powersByType.HAMMER +
      r.diagnostics.powersByType.SHIELD + r.diagnostics.powersByType.NO_TARGET <=
      F.CAL.BONUS.POWERS_PER_SEQ_CAP_8x8 * seqs);
    assert.ok(r.diagnostics.maxShardLevel <= F.SHARD_MAX_LEVEL);
    assert.ok(Number.isFinite(r.cappedWin) && r.cappedWin >= 0);
  }
});

test("deterministic replay with all features active", () => {
  for (const seed of [1n, 700n, 4242n, 99999n]) {
    for (let i = 0; i < 400; i++) {
      const a = resolveRound(cfg, seed, i, { logTags: true });
      const b = resolveRound(cfg, seed, i, { logTags: true });
      assert.deepStrictEqual(a, b);
    }
  }
});
