// Base-game feature layer per docs/02_MATH_SPEC.md §5-§10.
// Heat, Pressure, Forge Powers (Blade/Hammer/Shield), Forge Shards, deterministic Merge.
// All values are TUNABLE_V1 as specified — NOT tuned here.

import { idx, neighbors, columnGravity, generateCell, EMPTY } from "./grid.js";

// ---- structural caps / safety bounds (NOT calibration levers) ----
export const POWERS_PER_STEP_CAP = 1;
export const POWERS_PER_SEQUENCE_CAP = 4;
export const BLADE_MIN_LOW_TO_FIRE = 3;
export const HAMMER_WILDS = 2;
export const SHIELD_CELLS = 3;
export const SHIELD_TTL = 2;
export const SHIELD_MAX_ACTIVE = 4;
export const SHIELD_WILD_WEIGHT = 6;
export const SHARD_BOARD_CAP = 5;
export const SHARD_MAX_LEVEL = 6; // value 64x ; level 7 blocked (§10.2)
export const SHARD_MULT_CLUSTER_CAP = 64;
export const SHARD_MULT_STEP_CAP = 128;
export const SHARD_MULT_ROUND_CAP_MICRO = 5000 * 1_000_000;
export const MERGE_PASS_CAP = 8;
export const COLUMN_PULL_MAX_GAP = 5;

// ---- CALIBRATION LEVERS (TUNABLE_V1, activation/frequency layer only) ----
// Mutated in place by the calibration harness; the shipped defaults are what
// docs/DECISIONS.md records. Functions read CAL.* at call time.
export const CAL = {
  // §5.2 Heat generation — per-cell class weights (centi)
  CLASS_LOW: 100,
  CLASS_HIGH: 180,
  CLASS_WILD: 50,
  // §5.2 HEAT_DEPTH_FACTOR as [num,den] by cascade depth band
  DEPTH_FACTOR: { le2: [1, 1], d3: [23, 20], d4: [13, 10], ge5: [3, 2] },
  // §5.3 Forge Power trigger threshold (centi).
  // Calibration 2026-09-02: 1200 -> 650 (activation layer).
  // RTP_96 tuning pass 1 2026-09-02: 650 -> 500 (Forge Power / molten-charge health
  // at the new payout scale; see docs/DECISIONS.md).
  HEAT_THRESHOLD: 500,
  // §6.1 cascade depth at which each Pressure tier begins
  PRESSURE_DEPTH: { WARM: 2, HOT: 3, OVERHEAT: 4, CRITICAL: 5 },
  // §6.2 per-tier effects: p_shardSpawn (per mille), heatMult num/den, column-pull
  // Calibration 2026-09-02: p_shardSpawn COLD 20->40, WARM 35->55, HOT 55->70.
  // RTP_96 tuning pass 1 2026-09-02: COLD 40->46, WARM 55->62, HOT 70->82,
  // OVERHEAT 80->100, CRITICAL 110->125 (shard/merge co-occurrence -> tail identity;
  // ladder strictly increasing; CRITICAL 0.125 < §17 ceiling 0.14). See docs/DECISIONS.md.
  PRESSURE: {
    COLD: { pMille: 46, hmN: 1, hmD: 1, pull: false },
    WARM: { pMille: 62, hmN: 1, hmD: 1, pull: false },
    HOT: { pMille: 82, hmN: 21, hmD: 20, pull: false },
    OVERHEAT: { pMille: 100, hmN: 11, hmD: 10, pull: true },
    CRITICAL: { pMille: 125, hmN: 6, hmD: 5, pull: true },
  },
  // §7.1 Forge Power selection weights
  POWER_WEIGHTS: { BLADE: 40, HAMMER: 35, SHIELD: 25 },
  // §11-§12 Bonus / Awaken-the-Titan parameters.
  // RTP_96 tuning pass 1 (2026-09-02): bonus was EV-negligible + Awakened unreachable.
  // Tuned so bonus carries ~24pp RTP and 8x8 is reachable-but-uncommon. OLD V1 spec
  // values noted inline. Retrigger feedback verified bounded (hard-cap not shaping;
  // identical RTP at cap 400/800). See docs/DECISIONS.md.
  BONUS: {
    // §12.2 retrigger-only Core weight. OLD 5, then 20. 2026-09-05: x10 to match
    // config.js WGEN_SCALE=10 (the natural-WILD rescale) — same probability as
    // the old 20 relative to the now-x10 wgenWeights; Core spawn chance in
    // bonus mode is UNCHANGED. Must stay in lockstep with WGEN_SCALE.
    BONUS_W_CORE: 200,
    MOLTEN_EXPAND_THRESHOLD: 5, // §12.3. OLD 18 (unreachable at V1 charge rates).
    MOLTEN_BIGWIN_MICRO: 6 * 1_000_000, // §12.3 MOLTEN_BIGWIN_X. OLD 20x.
    AWAKENED_BONUS_SPINS: 10, // §12.3. OLD 3.
    AWAKENED_HEAT_THR_MUL: [17, 20], // §12.2 ×0.85 (DERIVED, unchanged)
    ADV_A5_MOLTEN_START: 4, // §11.2
    ADV_A5_MOLTEN_PER_EXTRA_CORE: 1, // +1 per Core beyond 5
    ADV_A5_MOLTEN_EXTRA_CAP: 3, // cap +3
    ADV_HEATCARRY_MUL: [1, 2], // §11.2 HEAT_THRESHOLD × 0.5
    RETRIGGER: { 3: 4, 4: 5, 5: 6 }, // §12.4. OLD {3:4,4:6,5:9}.
    BONUS_RETRIGGER_HARD_CAP: 400, // §12.4 compute backstop. OLD 30 (would clip live play).
    FS_PLAYED_HARD_CAP: 800, // extra compute backstop (not a game rule)
    POWERS_PER_SEQ_CAP_7x7: 5, // §12.2
    POWERS_PER_SEQ_CAP_8x8: 7,
    SHARD_BOARD_CAP_7x7: 6,
    SHARD_BOARD_CAP_8x8: 8, // OLD 7.
    SHIELD_CELLS_8x8: 4,
    SHIELD_TTL_8x8: 3,
    HAMMER_WILDS_8x8: 3,
    SHARD_SPAWN_MUL_8x8: [5, 2], // ×2.5 in Awakened. OLD [3,2] (×1.5).
    SHARD_SPAWN_CAP_MILLE_8x8: 240, // 0.24. OLD 160.
  },
};

// snapshot re-exports (import-time) for tests/tools that want the shipped value
export const HEAT_THRESHOLD = CAL.HEAT_THRESHOLD;
export const POWER_WEIGHTS = CAL.POWER_WEIGHTS;

// FROZEN free-spin counts (§11.1 / F7)
export const FREE_SPINS = { 3: 8, 4: 10, 5: 12 };

export { roundHalfEven };

// §12.2 per-mode parameter set. mode ∈ "BASE" | "BONUS_7x7" | "BONUS_8x8".
export function modeParams(mode) {
  const base = {
    mode,
    awakened: false,
    heatThreshold: CAL.HEAT_THRESHOLD,
    powersPerSeqCap: POWERS_PER_SEQUENCE_CAP, // 4
    shardBoardCap: SHARD_BOARD_CAP, // 5
    shieldCells: SHIELD_CELLS, // 3
    shieldTtl: SHIELD_TTL, // 2
    hammerWilds: HAMMER_WILDS, // 2
    bladeHitsH1: false,
    shardSpawnMul: [1, 1],
    shardSpawnCapMille: 1000,
  };
  if (mode === "BASE") return base;
  const B = CAL.BONUS;
  if (mode === "BONUS_7x7") {
    return { ...base, powersPerSeqCap: B.POWERS_PER_SEQ_CAP_7x7, shardBoardCap: B.SHARD_BOARD_CAP_7x7 };
  }
  // BONUS_8x8 (Awakened)
  return {
    ...base,
    awakened: true,
    heatThreshold: roundHalfEven(CAL.HEAT_THRESHOLD * B.AWAKENED_HEAT_THR_MUL[0], B.AWAKENED_HEAT_THR_MUL[1]),
    powersPerSeqCap: B.POWERS_PER_SEQ_CAP_8x8,
    shardBoardCap: B.SHARD_BOARD_CAP_8x8,
    shieldCells: B.SHIELD_CELLS_8x8,
    shieldTtl: B.SHIELD_TTL_8x8,
    hammerWilds: B.HAMMER_WILDS_8x8,
    bladeHitsH1: true,
    shardSpawnMul: B.SHARD_SPAWN_MUL_8x8,
    shardSpawnCapMille: B.SHARD_SPAWN_CAP_MILLE_8x8,
  };
}

export const isLow = (s) => s === "L1" || s === "L2" || s === "L3" || s === "L4";
export const isHigh = (s) => s === "H1" || s === "H2" || s === "H3" || s === "H4";
export const shardValue = (level) => 1 << level; // 2^level

// ---- Pressure (§6) ----
// Awakened (§12.2): no OVERHEAT band — CRITICAL begins at the OVERHEAT depth (d>=4).
export function pressureTier(depth, awakened = false) {
  const d = CAL.PRESSURE_DEPTH;
  if (awakened) {
    if (depth >= d.OVERHEAT) return "CRITICAL";
    if (depth >= d.HOT) return "HOT";
    if (depth >= d.WARM) return "WARM";
    return "COLD";
  }
  if (depth >= d.CRITICAL) return "CRITICAL";
  if (depth >= d.OVERHEAT) return "OVERHEAT";
  if (depth >= d.HOT) return "HOT";
  if (depth >= d.WARM) return "WARM";
  return "COLD";
}
export const pressureParams = (tier) => CAL.PRESSURE[tier];

// ---- Heat (§5.2) ----
function depthFactor(d) {
  const f = CAL.DEPTH_FACTOR;
  if (d <= 2) return f.le2;
  if (d === 3) return f.d3;
  if (d === 4) return f.d4;
  return f.ge5;
}
function roundHalfEven(a, b) {
  const q = Math.floor(a / b);
  const r = a - q * b;
  const twice = 2 * r;
  if (twice < b) return q;
  if (twice > b) return q + 1;
  return q % 2 === 0 ? q : q + 1;
}
export function heatGainCenti(cells, clusterCells, d, tier) {
  let sumW = 0;
  for (const i of clusterCells) {
    const c = cells[i];
    if (c.kind === "WILD") sumW += CAL.CLASS_WILD;
    else if (isHigh(c.sym)) sumW += CAL.CLASS_HIGH;
    else sumW += CAL.CLASS_LOW;
  }
  const n = clusterCells.length;
  const [dfN, dfD] = depthFactor(d);
  const p = CAL.PRESSURE[tier];
  const num = (n - 4) * sumW * dfN * p.hmN;
  const den = n * dfD * p.hmD;
  return roundHalfEven(num, den);
}

// ---- Forge Power legal targets (§7.1) ----
export function legalTargets(cells, W, H) {
  const L = new Set();
  let lockedCount = 0;
  for (const c of cells) if (c.locked) lockedCount++;

  // BLADE: some row or column with >= BLADE_MIN_LOW_TO_FIRE non-locked LOW
  let blade = false;
  for (let r = 0; r < H && !blade; r++) {
    let cnt = 0;
    for (let cc = 0; cc < W; cc++) {
      const c = cells[r * W + cc];
      if (c.kind === "SYM" && isLow(c.sym) && !c.locked) cnt++;
    }
    if (cnt >= BLADE_MIN_LOW_TO_FIRE) blade = true;
  }
  for (let cc = 0; cc < W && !blade; cc++) {
    let cnt = 0;
    for (let r = 0; r < H; r++) {
      const c = cells[r * W + cc];
      if (c.kind === "SYM" && isLow(c.sym) && !c.locked) cnt++;
    }
    if (cnt >= BLADE_MIN_LOW_TO_FIRE) blade = true;
  }
  if (blade) L.add("BLADE");

  // HAMMER: any non-locked destructible cell exists (=> some 3x3 window is legal)
  for (const c of cells) {
    if (!c.locked && (c.kind === "SYM" || c.kind === "WILD" || c.kind === "SHARD")) {
      L.add("HAMMER");
      break;
    }
  }

  // SHIELD: a valuable non-locked cell + free lock slot
  if (lockedCount < SHIELD_MAX_ACTIVE) {
    for (const c of cells) {
      if (!c.locked && (c.kind === "SHARD" || c.kind === "WILD")) {
        L.add("SHIELD");
        break;
      }
    }
  }
  return L;
}

// ---- BLADE (§7.2) ----  bp.bladeHitsH1 (§12.2 Awakened: also removes H1)
export function applyBlade(cells, W, H, rng, bp = {}) {
  rng.tag("POWER_BLADE_ORIENT");
  let rows = rng.nextInt(2) === 0; // U()<0.5 -> rows
  const bestLine = (byRow) => {
    const outer = byRow ? H : W;
    const inner = byRow ? W : H;
    let bi = 0;
    let bc = -1;
    for (let a = 0; a < outer; a++) {
      let cnt = 0;
      for (let b = 0; b < inner; b++) {
        const i = byRow ? a * W + b : b * W + a;
        const c = cells[i];
        if (c.kind === "SYM" && isLow(c.sym) && !c.locked) cnt++;
      }
      if (cnt > bc) {
        bc = cnt;
        bi = a;
      }
    }
    return { bi, bc };
  };
  let { bi, bc } = bestLine(rows);
  if (bc < BLADE_MIN_LOW_TO_FIRE) {
    rows = !rows;
    ({ bi, bc } = bestLine(rows));
  }
  const inner = rows ? W : H;
  let removed = 0;
  for (let b = 0; b < inner; b++) {
    const i = rows ? bi * W + b : b * W + bi;
    const c = cells[i];
    if (c.kind !== "SYM" || c.locked) continue;
    if (isLow(c.sym) || (bp.bladeHitsH1 && c.sym === "H1")) {
      cells[i] = EMPTY();
      removed++;
    }
  }
  return { type: "BLADE", orientation: rows ? "row" : "col", line: bi, removed };
}

// ---- HAMMER (§8.1) ----  ctx.bp.hammerWilds (§12.2 Awakened: 3)
// Bug fix 2026-09-05: the window scan used a strict `cnt > best`, so any tie among
// equally-good windows always fell back to the first one scanned (top-left-most),
// producing a visibly repeated fixed pattern in play (see docs/DECISIONS.md).
// Now every window tied for the best LOW-count is collected and one is chosen by
// the seeded engine RNG — quality of the pick (max LOW count) is unchanged, only
// the tie-break is randomized and deterministic-per-seed.
export function applyHammer(cells, W, H, ctx, rng) {
  const hammerWilds = (ctx.bp && ctx.bp.hammerWilds) || HAMMER_WILDS;
  let best = -1;
  const tied = [];
  for (let tr = 0; tr <= H - 3; tr++) {
    for (let tc = 0; tc <= W - 3; tc++) {
      let cnt = 0;
      for (let r = tr; r < tr + 3; r++) {
        for (let cc = tc; cc < tc + 3; cc++) {
          const c = cells[r * W + cc];
          if (c.kind === "SYM" && isLow(c.sym)) cnt++;
        }
      }
      if (cnt > best) {
        best = cnt;
        tied.length = 0;
        tied.push([tr, tc]);
      } else if (cnt === best) {
        tied.push([tr, tc]);
      }
    }
  }
  let bTr, bTc;
  if (tied.length === 1) {
    [bTr, bTc] = tied[0];
  } else {
    rng.tag("POWER_HAMMER_WINDOW");
    [bTr, bTc] = tied[rng.nextInt(tied.length)];
  }
  const emptied = [];
  let destroyedShards = 0;
  for (let r = bTr; r < bTr + 3; r++) {
    for (let cc = bTc; cc < bTc + 3; cc++) {
      const i = r * W + cc;
      const c = cells[i];
      if (c.locked || c.kind === "CORE") continue;
      if (c.kind === "SYM" || c.kind === "WILD" || c.kind === "SHARD") {
        if (c.kind === "SHARD") destroyedShards++;
        cells[i] = EMPTY();
        emptied.push(i);
      }
    }
  }
  ctx.shardCount -= destroyedShards;
  // Bug fix 2026-09-05 (round 2): WILDs always landed on the first `hammerWilds`
  // cells in row-major scan order within the window — a fixed sub-pattern that
  // stayed visible even after the window itself was randomized (a player sees
  // the WILDs, not the invisible window). Now sampled WITHOUT replacement from
  // the destroyed cells via the seeded engine RNG (Fisher-Yates prefix), so the
  // relative WILD layout inside any window is no longer fixed.
  let wildCells;
  if (emptied.length <= hammerWilds) {
    wildCells = emptied;
  } else {
    rng.tag("POWER_HAMMER_WILD_CELLS");
    const pool = emptied.slice();
    const n = pool.length;
    for (let k = 0; k < hammerWilds; k++) {
      const j = k + rng.nextInt(n - k);
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
    wildCells = pool.slice(0, hammerWilds);
  }
  for (const i of wildCells) cells[i] = { kind: "WILD", locked: false };
  return {
    type: "HAMMER",
    window: [bTr, bTc],
    destroyed: emptied.length,
    destroyedShards,
    wilds: wildCells.length,
    wildCells: wildCells.slice(), // instrumentation only — presentation/analysis, no outcome effect
  };
}

// ---- SHIELD (§8.2) ----  bp.shieldCells / bp.shieldTtl (§12.2 Awakened: 4 / 3)
export function applyShield(cells, W, H, bp = {}) {
  const shieldCells = bp.shieldCells || SHIELD_CELLS;
  const shieldTtl = bp.shieldTtl || SHIELD_TTL;
  let lockedCount = 0;
  for (const c of cells) if (c.locked) lockedCount++;
  const slots = Math.min(shieldCells, SHIELD_MAX_ACTIVE - lockedCount);
  const cands = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.locked) continue;
    if (c.kind === "SHARD") cands.push({ i, w: shardValue(c.shardLevel) });
    else if (c.kind === "WILD") cands.push({ i, w: SHIELD_WILD_WEIGHT });
  }
  cands.sort((a, b) => b.w - a.w || a.i - b.i);
  const chosen = cands.slice(0, Math.max(0, slots));
  for (const { i } of chosen) {
    cells[i].locked = true;
    cells[i].lockTtl = shieldTtl;
  }
  return { type: "SHIELD", locked: chosen.length, cells: chosen.map((c) => c.i) };
}

export function decrementLocks(cells) {
  for (const c of cells) {
    if (c.locked && c.lockTtl != null) {
      c.lockTtl--;
      if (c.lockTtl <= 0) {
        c.locked = false;
        delete c.lockTtl;
      }
    }
  }
}

// ---- Shard spawn on refill (§9.2 / §12.2 bonus overrides via ctx.bp) ----
export function effectiveShardPMille(tier, bp) {
  const base = CAL.PRESSURE[tier].pMille;
  if (!bp || (bp.shardSpawnMul[0] === 1 && bp.shardSpawnMul[1] === 1)) return base;
  const scaled = Math.floor((base * bp.shardSpawnMul[0]) / bp.shardSpawnMul[1]);
  return Math.min(bp.shardSpawnCapMille, scaled);
}
export function refillCellMaybeShard(cells, i, rng, config, ctx, symTag, rollTag) {
  const bp = ctx.bp;
  const cap = (bp && bp.shardBoardCap) || SHARD_BOARD_CAP;
  const cell = generateCell(rng, config, symTag); // draws symbol (may be discarded)
  if (ctx.shardCount < cap) {
    rng.tag(rollTag);
    const tier = pressureTier(ctx.depth, bp && bp.awakened);
    if (rng.nextInt(1000) < effectiveShardPMille(tier, bp)) {
      cells[i] = { kind: "SHARD", shardLevel: 1, locked: false };
      ctx.shardCount++;
      ctx.shardsSpawned++;
      if (ctx.shardsSpawnedByTier) ctx.shardsSpawnedByTier[tier]++;
      return;
    }
  }
  cells[i] = cell;
}

export function refillBoard(cells, W, H, rng, config, ctx, symTag, rollTag) {
  for (let col = 0; col < W; col++) {
    for (let row = H - 1; row >= 0; row--) {
      const i = idx(col, row, W);
      if (cells[i].kind === "EMPTY" && !cells[i].locked) {
        refillCellMaybeShard(cells, i, rng, config, ctx, symTag, rollTag);
      }
    }
  }
}

// ---- Merge resolution (§10) ----
function mergeablePairs(cells, W, H, tier) {
  const N = W * H;
  const ok = (i) =>
    cells[i].kind === "SHARD" && !cells[i].locked && cells[i].shardLevel < SHARD_MAX_LEVEL;
  const pairs = [];
  const push = (i, j) => {
    const ri = (i - (i % W)) / W;
    const rj = (j - (j % W)) / W;
    let lower;
    let other;
    if (ri > rj || (ri === rj && i % W < j % W)) {
      lower = i;
      other = j;
    } else {
      lower = j;
      other = i;
    }
    pairs.push({
      lower,
      other,
      lo: Math.min(i, j),
      hi: Math.max(i, j),
      level: cells[i].shardLevel,
    });
  };

  // orthogonal (scan right + down to avoid duplicates)
  for (let i = 0; i < N; i++) {
    if (!ok(i)) continue;
    const col = i % W;
    const row = (i - col) / W;
    if (col + 1 < W && ok(i + 1) && cells[i].shardLevel === cells[i + 1].shardLevel) push(i, i + 1);
    if (row + 1 < H && ok(i + W) && cells[i].shardLevel === cells[i + W].shardLevel) push(i, i + W);
  }

  // Pressure column-pull (OVERHEAT/CRITICAL only, §10.4)
  if (CAL.PRESSURE[tier].pull) {
    for (let col = 0; col < W; col++) {
      const rows = [];
      for (let row = 0; row < H; row++) if (cells[row * W + col].kind === "SHARD") rows.push(row);
      for (let a = 0; a < rows.length - 1; a++) {
        const r1 = rows[a];
        const r2 = rows[a + 1];
        if (r2 - r1 - 1 > COLUMN_PULL_MAX_GAP) continue;
        const i = r1 * W + col;
        const j = r2 * W + col;
        if (!ok(i) || !ok(j) || cells[i].shardLevel !== cells[j].shardLevel) continue;
        let clean = true;
        for (let r = r1 + 1; r < r2; r++) {
          const c = cells[r * W + col];
          if (c.locked || !(c.kind === "SYM" || c.kind === "EMPTY")) {
            clean = false;
            break;
          }
        }
        if (clean) push(i, j);
      }
    }
  }

  // de-dupe (a vertically-adjacent pair can appear in both scans)
  const seen = new Set();
  const out = [];
  for (const p of pairs) {
    const k = `${p.lo}_${p.hi}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

export function settleMerges(cells, W, H, rng, config, ctx) {
  for (let pass = 0; pass < MERGE_PASS_CAP; pass++) {
    const tier = pressureTier(ctx.depth, ctx.bp && ctx.bp.awakened);
    const pairs = mergeablePairs(cells, W, H, tier);
    if (pairs.length === 0) break;
    pairs.sort((a, b) => b.level - a.level || a.lower - b.lower || a.other - b.other);
    const p = pairs[0];
    const newLevel = cells[p.lower].shardLevel + 1;
    cells[p.lower] = { kind: "SHARD", shardLevel: newLevel, locked: false };
    cells[p.other] = EMPTY();
    ctx.shardCount--;
    ctx.merges++;
    ctx.mergesByLevel[newLevel] = (ctx.mergesByLevel[newLevel] || 0) + 1;
    if (newLevel > ctx.maxShardLevel) ctx.maxShardLevel = newLevel;

    const col = p.other % W;
    columnGravity(cells, W, H, col);
    for (let row = H - 1; row >= 0; row--) {
      const i = idx(col, row, W);
      if (cells[i].kind === "EMPTY" && !cells[i].locked) {
        refillCellMaybeShard(cells, i, rng, config, ctx, "MERGE_REFILL", "MERGE_SHARD_ROLL");
      }
    }
    // optional presentation hook (instrumentation only; see engine/round.js)
    if (ctx.onMerge) ctx.onMerge({ from: p.other, to: p.lower, level: newLevel });
  }
}
