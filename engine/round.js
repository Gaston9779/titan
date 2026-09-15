// Round resolution per docs/02_MATH_SPEC.md §4.2 / §5-§14 / §15.
// Full game: base spin + Awaken-the-Titan bonus (7x7 -> molten -> 8x8 Awakened).

import { deriveRoundRng } from "./rng.js";
import { configHash, MICRO } from "./config.js";
import { fillBoard, gravity, countKind, EMPTY, neighbors } from "./grid.js";
import { detectClusters } from "./clusters.js";
import {
  CAL,
  FREE_SPINS,
  modeParams,
  roundHalfEven,
  POWERS_PER_STEP_CAP,
  SHARD_MULT_CLUSTER_CAP,
  SHARD_MULT_STEP_CAP,
  SHARD_MULT_ROUND_CAP_MICRO,
  pressureTier,
  heatGainCenti,
  legalTargets,
  applyBlade,
  applyHammer,
  applyShield,
  decrementLocks,
  refillBoard,
  settleMerges,
  shardValue,
} from "./features.js";

const WHY = ["BASE_CLUSTER", "CASCADE", "BLADE", "HAMMER", "SHIELD", "SHARD_MULT"];
const LOC = ["BASE", "BONUS_BASE", "BONUS_AWAKENED"];
const TIERS = ["COLD", "WARM", "HOT", "OVERHEAT", "CRITICAL"];

// §11.2 advantage helpers (C = paid-spin Core count)
const advMoltenStart = (C) =>
  C >= 5
    ? CAL.BONUS.ADV_A5_MOLTEN_START +
      Math.min(CAL.BONUS.ADV_A5_MOLTEN_EXTRA_CAP, (C - 5) * CAL.BONUS.ADV_A5_MOLTEN_PER_EXTRA_CORE)
    : 0;
const advHeatCarry = (C) =>
  C >= 4 ? roundHalfEven(CAL.HEAT_THRESHOLD * CAL.BONUS.ADV_HEATCARRY_MUL[0], CAL.BONUS.ADV_HEATCARRY_MUL[1]) : 0;
const advForced = (C) => (C >= 5 ? ["SHIELD", "HAMMER"] : C === 4 ? ["SHIELD"] : []);
const retriggerFS = (Cr) => (Cr >= 5 ? CAL.BONUS.RETRIGGER[5] : Cr === 4 ? CAL.BONUS.RETRIGGER[4] : Cr >= 3 ? CAL.BONUS.RETRIGGER[3] : 0);

export function resolveRound(config, masterSeed, roundIndex, opts = {}) {
  const rng = deriveRoundRng(masterSeed, roundIndex, !!opts.logTags);

  // ---- optional presentation trace (§ engineering-principle 1/2: instrumentation
  // ONLY — records what the math computed, consumes no RNG, never changes an outcome.
  // Off unless opts.trace. Consumed by client/ to animate a RoundResult). ----
  const trace = opts.trace ? [] : null;
  const TR = trace ? (ev) => trace.push(ev) : () => {};
  const snap = (cells) =>
    cells.map((c) => {
      const o = { k: c.kind };
      if (c.kind === "SYM") o.s = c.sym;
      if (c.kind === "SHARD") o.lv = c.shardLevel;
      if (c.locked) {
        o.lk = 1;
        if (c.lockTtl != null) o.ttl = c.lockTtl;
      }
      return o;
    });
  const xOf = (micro) => micro / MICRO;

  // ---- round-scoped state (§4.1 / §13) ----
  let roundWin = 0;
  let shardContribRound = 0;
  let capped = false;
  let capReached = false;
  let shardRoundCapHit = 0;

  const contribWhy = Object.fromEntries(WHY.map((t) => [t, 0]));
  const contribLoc = Object.fromEntries(LOC.map((t) => [t, 0]));

  const rd = {
    powersByType: { BLADE: 0, HAMMER: 0, SHIELD: 0, NO_TARGET: 0 },
    shardsSpawned: 0,
    shardsSpawnedByTier: { COLD: 0, WARM: 0, HOT: 0, OVERHEAT: 0, CRITICAL: 0 },
    merges: 0,
    mergesByLevel: {},
    maxShardLevel: 0,
    maxCascadeDepth: 0,
    totalCascades: 0,
    heatGenCenti: 0,
    maxPressureTierIdx: 0,
    cascadeCapHit: 0,
  };
  const spins = [];

  // §12.2: Core weight in bonus is BONUS_W_CORE (retrigger only).
  const bonusCfg = (() => {
    const w = config.wgenWeights.slice();
    const ci = config.wgenSymbols.indexOf("CORE");
    if (ci >= 0) w[ci] = CAL.BONUS.BONUS_W_CORE;
    return { ...config, wgenWeights: w, wgenTotal: w.reduce((a, b) => a + b, 0) };
  })();

  // ================= one spin (fill + full cascade sequence) =================
  function runSpin({ grid, mode, forced, heatCarry, tmeta }) {
    const bp = modeParams(mode);
    const scfg = mode === "BASE" ? config : bonusCfg;
    const W = grid;
    const H = grid;
    const loc = mode === "BASE" ? "BASE" : mode === "BONUS_7x7" ? "BONUS_BASE" : "BONUS_AWAKENED";
    const cells = new Array(W * H);
    fillBoard(cells, W, H, rng, scfg);

    TR({
      t: "fill",
      grid: W,
      mode,
      loc,
      board: snap(cells),
      heatCenti: heatCarry || 0,
      thresholdCenti: bp.heatThreshold,
      forced: forced && forced.length ? forced.slice() : null,
      ...(tmeta || {}),
    });

    let heat = heatCarry || 0;
    let depth = 0;
    let powersThisSequence = 0;
    let responsibleEdit = "none";
    let spinWin = 0;
    let reachedCritical = false;
    let forgePowersThisSpin = 0;

    const ctx = {
      depth: 0,
      shardCount: 0,
      shardsSpawned: 0,
      shardsSpawnedByTier: rd.shardsSpawnedByTier,
      merges: 0,
      mergesByLevel: rd.mergesByLevel,
      maxShardLevel: rd.maxShardLevel,
      bp,
    };

    ctx.depth = 0;
    settleMerges(cells, W, H, rng, scfg, ctx); // initial no-op

    while (true) {
      const clusters = detectClusters(cells, W, H, scfg);
      if (clusters.length === 0) break;

      depth++;
      ctx.depth = depth;
      const tier = pressureTier(depth, bp.awakened);
      const tIdx = TIERS.indexOf(tier);
      if (tIdx > rd.maxPressureTierIdx) rd.maxPressureTierIdx = tIdx;
      if (tier === "CRITICAL") reachedCritical = true;

      // ---- step 4: pay clusters ----
      clusters.sort((a, b) => b.basePay - a.basePay || a.anchor - b.anchor);
      const claimed = new Set();
      const consumeShards = new Set();
      let stepMultUsed = 0;
      const clTrace = trace ? [] : null;

      for (const cl of clusters) {
        const S = [];
        const seen = new Set();
        for (const ci of cl.cells) {
          for (const nb of neighbors(ci, W, H)) {
            if (cells[nb].kind === "SHARD" && !claimed.has(nb) && !seen.has(nb)) {
              seen.add(nb);
              S.push(nb);
            }
          }
        }
        let sumSV = 0;
        for (const si of S) sumSV += shardValue(cells[si].shardLevel);
        let M = S.length ? sumSV : 1;
        if (M > SHARD_MULT_CLUSTER_CAP) M = SHARD_MULT_CLUSTER_CAP;

        const k = M - 1;
        const allowedK = Math.max(0, Math.min(k, SHARD_MULT_STEP_CAP - stepMultUsed));
        stepMultUsed += allowedK;
        let incMicro = cl.basePay * allowedK;
        if (shardContribRound + incMicro > SHARD_MULT_ROUND_CAP_MICRO) {
          incMicro = Math.max(0, SHARD_MULT_ROUND_CAP_MICRO - shardContribRound);
          shardRoundCapHit++;
        }
        shardContribRound += incMicro;

        const clusterPay = cl.basePay + incMicro;
        const baseTag =
          responsibleEdit === "BLADE"
            ? "BLADE"
            : responsibleEdit === "HAMMER"
              ? "HAMMER"
              : depth === 1
                ? "BASE_CLUSTER"
                : "CASCADE";

        let paid = clusterPay;
        let basePaid;
        let incPaid;
        if (roundWin + paid >= config.maxWinMicro) {
          paid = config.maxWinMicro - roundWin;
          basePaid = clusterPay > 0 ? Math.floor((cl.basePay * paid) / clusterPay) : paid;
          incPaid = Math.max(0, paid - basePaid);
          roundWin = config.maxWinMicro;
          capped = true;
          capReached = true;
        } else {
          basePaid = cl.basePay;
          incPaid = incMicro;
          roundWin += paid;
        }
        spinWin += paid;

        contribWhy[baseTag] += basePaid;
        contribLoc[loc] += basePaid;
        if (incPaid > 0 && S.length) {
          let assigned = 0;
          for (let j = 0; j < S.length; j++) {
            const si = S[j];
            const sv = shardValue(cells[si].shardLevel);
            const portion = j === S.length - 1 ? incPaid - assigned : Math.floor((incPaid * sv) / sumSV);
            if (j !== S.length - 1) assigned += portion;
            contribWhy[cells[si].locked ? "SHIELD" : "SHARD_MULT"] += portion;
            contribLoc[loc] += portion;
          }
        }

        for (const si of S) {
          claimed.add(si);
          if (!cells[si].locked) consumeShards.add(si);
        }

        if (clTrace) {
          clTrace.push({
            cells: cl.cells.slice(),
            sym: cl.sym,
            size: cl.size,
            anchor: cl.anchor,
            baseX: xOf(cl.basePay),
            shards: S.map((si) => ({ cell: si, level: cells[si].shardLevel, locked: !!cells[si].locked })),
            mult: M,
            payX: xOf(paid),
            why: baseTag,
          });
        }

        if (capped) {
          rd.totalCascades++;
          if (depth > rd.maxCascadeDepth) rd.maxCascadeDepth = depth;
          if (ctx.maxShardLevel > rd.maxShardLevel) rd.maxShardLevel = ctx.maxShardLevel;
          TR({
            t: "cascade",
            depth,
            tier,
            clusters: clTrace,
            spinWinX: xOf(spinWin),
            roundWinX: xOf(roundWin),
            capped: true,
          });
          TR({ t: "maxWin", roundWinX: xOf(roundWin) });
          spins.push({ grid: W, mode, loc, spinWin, cascades: depth });
          TR({ t: "spinEnd", spinWinX: xOf(spinWin), coreCount: countKind(cells, "CORE"), board: snap(cells) });
          return { spinWin, coreCount: countKind(cells, "CORE"), reachedCritical, forgePowersThisSpin, capped: true };
        }
      }
      TR({
        t: "cascade",
        depth,
        tier,
        clusters: clTrace,
        spinWinX: xOf(spinWin),
        roundWinX: xOf(roundWin),
        capped: false,
      });

      // ---- step 5: Heat ----
      let heatGainThisStep = 0;
      for (const cl of clusters) {
        const g = heatGainCenti(cells, cl.cells, depth, tier);
        heat += g;
        heatGainThisStep += g;
        rd.heatGenCenti += g;
      }
      TR({ t: "heat", gainCenti: heatGainThisStep, totalCenti: heat, thresholdCenti: bp.heatThreshold });

      // ---- step 6: removal ----
      const removedCells = trace ? [] : null;
      for (const cl of clusters)
        for (const ci of cl.cells)
          if (!cells[ci].locked) {
            cells[ci] = EMPTY();
            if (removedCells) removedCells.push(ci);
          }
      for (const si of consumeShards) {
        cells[si] = EMPTY();
        ctx.shardCount--;
      }
      TR({
        t: "remove",
        board: snap(cells),
        removed: removedCells,
        shardsConsumed: trace ? [...consumeShards] : null,
      });

      // ---- step 7: Forge Power trigger ----
      let powersThisStep = 0;
      const HT = bp.heatThreshold;

      // forced advantage powers (FS1 depth 1 only): no heat cost, no step-cap, seq-cap only
      if (depth === 1 && forced && forced.length) {
        for (const fp of forced) {
          if (powersThisSequence >= bp.powersPerSeqCap) break;
          if (!legalTargets(cells, W, H).has(fp)) continue; // skipped, not deferred
          let pdetail;
          if (fp === "SHIELD") pdetail = applyShield(cells, W, H, bp);
          else {
            pdetail = applyHammer(cells, W, H, ctx, rng);
            responsibleEdit = "HAMMER";
          }
          TR({ t: "power", kind: fp, forced: true, detail: pdetail, board: snap(cells) });
          rd.powersByType[fp]++;
          forgePowersThisSpin++;
          powersThisSequence++;
        }
      }

      while (heat >= HT && powersThisStep < POWERS_PER_STEP_CAP && powersThisSequence < bp.powersPerSeqCap) {
        const L = legalTargets(cells, W, H);
        if (L.size === 0) {
          heat -= HT;
          powersThisSequence++;
          powersThisStep++;
          rd.powersByType.NO_TARGET++;
          continue;
        }
        const optsArr = [...L];
        const weights = optsArr.map((o) => CAL.POWER_WEIGHTS[o]);
        const total = weights.reduce((a, b) => a + b, 0);
        rng.tag("POWER_SELECT");
        const pick = optsArr[rng.drawWeighted(weights, total)];
        let pdetail;
        if (pick === "BLADE") {
          pdetail = applyBlade(cells, W, H, rng, bp);
          responsibleEdit = "BLADE";
        } else if (pick === "HAMMER") {
          pdetail = applyHammer(cells, W, H, ctx, rng);
          responsibleEdit = "HAMMER";
        } else {
          pdetail = applyShield(cells, W, H, bp);
        }
        TR({ t: "power", kind: pick, forced: false, detail: pdetail, board: snap(cells) });
        rd.powersByType[pick]++;
        forgePowersThisSpin++;
        heat -= HT;
        powersThisSequence++;
        powersThisStep++;
      }

      // ---- steps 8-11 ----
      gravity(cells, W, H);
      TR({ t: "gravity", board: snap(cells) });

      const preRefill = trace ? cells.map((c) => c.kind) : null;
      refillBoard(cells, W, H, rng, scfg, ctx, "REFILL", "SHARD_ROLL");
      if (trace) {
        const newCells = [];
        const shardSpawns = [];
        for (let i = 0; i < cells.length; i++) {
          if (preRefill[i] === "EMPTY" && cells[i].kind !== "EMPTY") {
            newCells.push(i);
            if (cells[i].kind === "SHARD") shardSpawns.push({ cell: i, level: cells[i].shardLevel });
          }
        }
        TR({ t: "refill", board: snap(cells), newCells, shardSpawns });
      }

      decrementLocks(cells);
      ctx.onMerge = trace
        ? (info) => TR({ t: "merge", from: info.from, to: info.to, level: info.level, board: snap(cells) })
        : null;
      settleMerges(cells, W, H, rng, scfg, ctx);
      ctx.onMerge = null;

      rd.totalCascades++;
      if (depth > rd.maxCascadeDepth) rd.maxCascadeDepth = depth;
      if (depth >= config.cascadeDepthHardCap) {
        rd.cascadeCapHit++;
        break;
      }
    }

    if (ctx.maxShardLevel > rd.maxShardLevel) rd.maxShardLevel = ctx.maxShardLevel;
    spins.push({ grid: W, mode, loc, spinWin, cascades: depth });
    const coreCount = countKind(cells, "CORE");
    TR({ t: "spinEnd", spinWinX: xOf(spinWin), coreCount, board: snap(cells) });
    return { spinWin, coreCount, reachedCritical, forgePowersThisSpin, capped };
  }

  // ================= paid spin =================
  // Buy Bonus (2026-09-05, see docs/DECISIONS.md): entry-method-only feature.
  // opts.buyBonus skips the paid spin and hands the bonus block below a synthetic
  // "paid" result at the minimum natural trigger tier (coreBonusThreshold Forge
  // Cores), so the SAME bonus while-loop (7x7, Molten Charge, Forge Powers,
  // Awakened 8x8, payout logic) runs — no second Bonus implementation.
  const paid = opts.buyBonus
    ? { spinWin: 0, coreCount: config.coreBonusThreshold, reachedCritical: false, forgePowersThisSpin: 0, capped: false }
    : runSpin({ grid: config.gridW, mode: "BASE", forced: [], heatCarry: 0, tmeta: { phase: "PAID" } });

  // ================= bonus (§11 / §12 / §15.1) =================
  let bonus = null;
  if (!capped && paid.coreCount >= config.coreBonusThreshold) {
    const C = paid.coreCount;
    let FS = FREE_SPINS[Math.min(5, C)];
    let fsAwarded = FS;
    let awakened = false;
    let moltenMeter = advMoltenStart(C);
    let moltenRetired = false;
    let pendingExpansion = false;
    let gridNext = 7;
    let spinIndex = 0;
    let fsPlayed = 0;
    let retriggerCount = 0;
    let awakenedAtSpin = null;
    let hitRetriggerCap = false;
    let hitFsCap = false;
    const winBeforeBonus = roundWin;
    const B = CAL.BONUS;
    TR({
      t: "bonusStart",
      triggerCoreCount: C,
      freeSpinsAwarded: fsAwarded,
      moltenStart: moltenMeter,
      moltenThreshold: B.MOLTEN_EXPAND_THRESHOLD,
    });

    while (FS > 0 && !capped) {
      if (fsPlayed >= B.FS_PLAYED_HARD_CAP) {
        hitFsCap = true;
        break;
      }
      if (pendingExpansion) {
        gridNext = 8;
        awakened = true;
        pendingExpansion = false;
        if (awakenedAtSpin === null) awakenedAtSpin = spinIndex;
        TR({ t: "expansion", spinIndex });
      }
      const mode = gridNext === 8 ? "BONUS_8x8" : "BONUS_7x7";
      const forced = spinIndex === 0 ? advForced(C) : [];
      const heatCarry = spinIndex === 0 ? advHeatCarry(C) : 0;

      const s = runSpin({
        grid: gridNext,
        mode,
        forced,
        heatCarry,
        tmeta: {
          phase: awakened ? "AWAKENED" : "BONUS",
          fsIndex: spinIndex,
          fsRemaining: FS,
          molten: moltenMeter,
          moltenThreshold: B.MOLTEN_EXPAND_THRESHOLD,
        },
      });
      FS -= 1;
      fsPlayed += 1;
      spinIndex += 1;
      if (capped) break;

      const rt = retriggerFS(s.coreCount);
      if (rt > 0) retriggerCount += 1;
      const moltenGain =
        s.forgePowersThisSpin + (s.reachedCritical ? 1 : 0) + (s.spinWin >= B.MOLTEN_BIGWIN_MICRO ? 1 : 0) + (rt > 0 ? 2 : 0);

      let expandedNow = false;
      if (!awakened && !moltenRetired) {
        moltenMeter += moltenGain;
        if (moltenMeter >= B.MOLTEN_EXPAND_THRESHOLD) {
          pendingExpansion = true;
          FS += B.AWAKENED_BONUS_SPINS;
          fsAwarded += B.AWAKENED_BONUS_SPINS;
          moltenRetired = true;
          expandedNow = true;
        }
      }
      TR({
        t: "molten",
        meter: moltenMeter,
        threshold: B.MOLTEN_EXPAND_THRESHOLD,
        gained: awakened || moltenRetired ? 0 : moltenGain,
        reached: expandedNow,
        retired: moltenRetired,
      });
      FS += rt;
      fsAwarded += rt;
      if (rt > 0) TR({ t: "retrigger", coreCount: s.coreCount, extraFs: rt, freeSpinsRemaining: FS });
      if (retriggerCount > B.BONUS_RETRIGGER_HARD_CAP) {
        hitRetriggerCap = true;
        break;
      }
    }
    TR({
      t: "bonusEnd",
      bonusWinX: xOf(roundWin - winBeforeBonus),
      reachedAwakened: awakened,
      freeSpinsPlayed: fsPlayed,
      retriggerCount,
    });

    bonus = {
      triggerCoreCount: C,
      freeSpinsAwarded: fsAwarded,
      freeSpinsPlayed: fsPlayed,
      retriggerCount,
      reachedAwakened: awakened,
      awakenedAtSpinIndex: awakenedAtSpin,
      moltenChargesFinal: moltenMeter,
      moltenRetired,
      bonusWin: roundWin - winBeforeBonus,
      hitRetriggerCap,
      hitFsCap,
    };
  }

  // ---- finalize (§15.5) ----
  const bonusTriggered = bonus !== null;
  const result = {
    engineVersion: "0.3.0-fullgame",
    configHash: configHash(config),
    profileId: config.id,
    seedInfo: { masterSeed: String(masterSeed), roundIndex },
    totalBet: 1_000_000,
    cappedWin: roundWin,
    capped,
    contributions: contribWhy,
    contribByLocation: contribLoc,
    spins,
    bonus,
    diagnostics: {
      maxCascadeDepth: rd.maxCascadeDepth,
      totalCascades: rd.totalCascades,
      coreCount: paid.coreCount,
      bonusTriggered,
      capReached,
      powersByType: rd.powersByType,
      powersTotal:
        rd.powersByType.BLADE + rd.powersByType.HAMMER + rd.powersByType.SHIELD + rd.powersByType.NO_TARGET,
      shardsSpawned: sumVals(rd.shardsSpawnedByTier),
      shardsSpawnedByTier: rd.shardsSpawnedByTier,
      merges: sumVals(rd.mergesByLevel),
      mergesByLevel: rd.mergesByLevel,
      maxShardLevel: rd.maxShardLevel,
      shardRoundCapHit,
      heatGenCenti: rd.heatGenCenti,
      maxPressureTier: TIERS[rd.maxPressureTierIdx],
      maxPressureTierIdx: rd.maxPressureTierIdx,
      cascadeCapHit: rd.cascadeCapHit,
      rngDraws: rng.draws,
    },
  };
  if (opts.logTags) result.rngTags = rng.tags;
  if (trace) {
    TR({ t: "roundEnd", cappedWinX: xOf(roundWin), capped, bonusTriggered });
    result.trace = trace;
  }
  return result;
}

function sumVals(o) {
  let s = 0;
  for (const v of Object.values(o)) s += v;
  return s;
}
