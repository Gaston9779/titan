// Activation-layer diagnostics (calibration pass).
// Usage: node sim/diag.js [count] [seed]
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";
import { CAL } from "../engine/features.js";

const count = Number(process.argv[2] || 100000);
const seed = BigInt(process.argv[3] || "20260902");
const cfg = defaultConfig();

const pctile = (arr, p) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

let sum = 0n;
let wins = 0;
let paid = 0; // rounds with >=1 winning cascade
let winCascades = 0;
let capped = 0;
let bonus = 0;
let maxWin = 0;
const heatPerRound = [];
const heatPerPaidRound = [];
let heatTotal = 0;
const tierReach = [0, 0, 0, 0, 0]; // rounds whose max tier >= idx
const powerType = { BLADE: 0, HAMMER: 0, SHIELD: 0, NO_TARGET: 0 };
let powerRounds = 0;
let powersTotal = 0;
const shardByTier = { COLD: 0, WARM: 0, HOT: 0, OVERHEAT: 0, CRITICAL: 0 };
let shardsSpawned = 0;
let shardRounds = 0;
let merges = 0;
let mergeRounds = 0;
const mergeLevel = {};
let maxShardLevel = 0;
const depthHist = {};

for (let i = 0; i < count; i++) {
  const r = resolveRound(cfg, seed, i);
  const d = r.diagnostics;
  sum += BigInt(r.cappedWin);
  if (r.cappedWin > 0) wins++;
  if (r.cappedWin > maxWin) maxWin = r.cappedWin;
  if (r.capped) capped++;
  if (d.bonusTriggered) bonus++;

  const h = d.heatGenCenti / 100;
  heatPerRound.push(h);
  heatTotal += h;
  if (d.totalCascades > 0) {
    paid++;
    winCascades += d.totalCascades;
    heatPerPaidRound.push(h);
  }
  for (let t = 0; t <= d.maxPressureTierIdx; t++) tierReach[t]++;
  for (const k of Object.keys(powerType)) powerType[k] += d.powersByType[k];
  if (d.powersTotal > 0) powerRounds++;
  powersTotal += d.powersTotal;
  for (const k of Object.keys(shardByTier)) shardByTier[k] += d.shardsSpawnedByTier[k];
  shardsSpawned += d.shardsSpawned;
  if (d.shardsSpawned > 0) shardRounds++;
  merges += d.merges;
  if (d.merges > 0) mergeRounds++;
  for (const [lvl, n] of Object.entries(d.mergesByLevel)) mergeLevel[lvl] = (mergeLevel[lvl] || 0) + n;
  if (d.maxShardLevel > maxShardLevel) maxShardLevel = d.maxShardLevel;
  depthHist[d.maxCascadeDepth] = (depthHist[d.maxCascadeDepth] || 0) + 1;
}

const rtp = Number(sum) / (count * MICRO);
const oneIn = (n) => (n ? Math.round(count / n) : null);

console.log(
  JSON.stringify(
    {
      calibration: {
        HEAT_THRESHOLD: CAL.HEAT_THRESHOLD,
        CLASS: [CAL.CLASS_LOW, CAL.CLASS_HIGH, CAL.CLASS_WILD],
        DEPTH_FACTOR: CAL.DEPTH_FACTOR,
        PRESSURE_DEPTH: CAL.PRESSURE_DEPTH,
        pMille: Object.fromEntries(Object.entries(CAL.PRESSURE).map(([k, v]) => [k, v.pMille])),
        POWER_WEIGHTS: CAL.POWER_WEIGHTS,
      },
      count,
      rtp: +rtp.toFixed(5),
      hitFreq: +(wins / count).toFixed(4),
      paidRoundFreq: +(paid / count).toFixed(4),
      maxWinX: maxWin / MICRO,
      cappedFreq: capped / count,
      bonusOneIn: oneIn(bonus),
      heat: {
        perRound_mean: +(heatTotal / count).toFixed(2),
        perPaidRound_mean: +(heatTotal / Math.max(1, paid)).toFixed(2),
        perWinningCascade_mean: +(heatTotal / Math.max(1, winCascades)).toFixed(2),
        paidRound_p50: +pctile(heatPerPaidRound, 50).toFixed(2),
        paidRound_p90: +pctile(heatPerPaidRound, 90).toFixed(2),
        paidRound_p99: +pctile(heatPerPaidRound, 99).toFixed(2),
        round_p99: +pctile(heatPerRound, 99).toFixed(2),
        threshold: CAL.HEAT_THRESHOLD / 100,
      },
      pressureReachFreq: {
        WARM: +(tierReach[1] / count).toFixed(4),
        HOT: +(tierReach[2] / count).toFixed(4),
        OVERHEAT: +(tierReach[3] / count).toFixed(5),
        CRITICAL: +(tierReach[4] / count).toFixed(6),
      },
      forgePower: {
        perRound: +(powersTotal / count).toFixed(5),
        oneInRounds: oneIn(powerRounds),
        byType: powerType,
      },
      shard: {
        spawnPerRound: +(shardsSpawned / count).toFixed(4),
        roundsWithShardOneIn: oneIn(shardRounds),
        byTier: shardByTier,
      },
      merge: {
        perRound: +(merges / count).toFixed(5),
        oneInRounds: oneIn(mergeRounds),
        byLevelReached: mergeLevel,
        maxShardLevel,
      },
      cascadeDepthHist: depthHist,
    },
    null,
    2,
  ),
);
