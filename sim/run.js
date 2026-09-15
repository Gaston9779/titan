// Counters-only full-game simulation runner (docs/04_SIMULATION_PLAN.md).
// Usage: node sim/run.js [count] [masterSeed]
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";

const count = Number(process.argv[2] || 10000);
const masterSeed = BigInt(process.argv[3] || "20260902");
const cfg = defaultConfig();
const WHY = ["BASE_CLUSTER", "CASCADE", "BLADE", "HAMMER", "SHIELD", "SHARD_MULT"];
const LOC = ["BASE", "BONUS_BASE", "BONUS_AWAKENED"];

let sum = 0n;
let sumSq = 0n;
let wins = 0;
let cappedRounds = 0;
let maxWin = 0;
let powersTotal = 0;
let powerRounds = 0;
let shardsSpawned = 0;
let merges = 0;
let mergeRounds = 0;
let maxShardLevel = 0;
let maxDepth = 0;
let depthSum = 0;
// bonus
let bonus = 0;
let bonusWinSum = 0n;
let fsPlayedSum = 0;
let fsAwardedSum = 0;
let retriggers = 0;
let retriggerBonuses = 0;
let awakenedBonuses = 0;
const whyMicro = Object.fromEntries(WHY.map((t) => [t, 0n]));
const locMicro = Object.fromEntries(LOC.map((t) => [t, 0n]));
const mergeLevelHist = {};
const t0 = performance.now();

for (let i = 0; i < count; i++) {
  const r = resolveRound(cfg, masterSeed, i);
  const w = r.cappedWin;
  sum += BigInt(w);
  sumSq += BigInt(w) * BigInt(w);
  if (w > 0) wins++;
  if (r.capped) cappedRounds++;
  if (w > maxWin) maxWin = w;

  const d = r.diagnostics;
  powersTotal += d.powersTotal;
  if (d.powersTotal > 0) powerRounds++;
  shardsSpawned += d.shardsSpawned;
  merges += d.merges;
  if (d.merges > 0) mergeRounds++;
  if (d.maxShardLevel > maxShardLevel) maxShardLevel = d.maxShardLevel;
  if (d.maxCascadeDepth > maxDepth) maxDepth = d.maxCascadeDepth;
  depthSum += d.maxCascadeDepth;
  for (const [l, n] of Object.entries(d.mergesByLevel)) mergeLevelHist[l] = (mergeLevelHist[l] || 0) + n;

  let cs = 0;
  for (const t of WHY) {
    whyMicro[t] += BigInt(r.contributions[t]);
    cs += r.contributions[t];
  }
  let ls = 0;
  for (const t of LOC) {
    locMicro[t] += BigInt(r.contribByLocation[t]);
    ls += r.contribByLocation[t];
  }
  if (cs !== w || ls !== w) {
    console.error(`CONTRIB MISMATCH round ${i}: why=${cs} loc=${ls} win=${w}`);
    process.exit(1);
  }

  if (r.bonus) {
    bonus++;
    bonusWinSum += BigInt(r.bonus.bonusWin);
    fsPlayedSum += r.bonus.freeSpinsPlayed;
    fsAwardedSum += r.bonus.freeSpinsAwarded;
    retriggers += r.bonus.retriggerCount;
    if (r.bonus.retriggerCount > 0) retriggerBonuses++;
    if (r.bonus.reachedAwakened) awakenedBonuses++;
  }
}

const ms = performance.now() - t0;
const betTotal = Number(BigInt(count) * BigInt(MICRO));
const rtp = Number(sum) / betTotal;
const meanX = Number(sum) / count / MICRO;
const varX = Number(sumSq) / count / (MICRO * MICRO) - meanX * meanX;
const asRtp = (m) => Number((Number(m) / betTotal).toFixed(6));

console.log(
  JSON.stringify(
    {
      count,
      masterSeed: String(masterSeed),
      roundsPerSec: Math.round(count / (ms / 1000)),
      fullGameRtp: Number(rtp.toFixed(6)),
      rtpByLocation: {
        base: asRtp(locMicro.BASE),
        bonus7x7: asRtp(locMicro.BONUS_BASE),
        bonusAwakened8x8: asRtp(locMicro.BONUS_AWAKENED),
        bonusTotal: asRtp(locMicro.BONUS_BASE + locMicro.BONUS_AWAKENED),
      },
      rtpByWhy: Object.fromEntries(WHY.map((t) => [t, asRtp(whyMicro[t])])),
      hitFrequency: Number((wins / count).toFixed(5)),
      cappedWinFrequency: cappedRounds / count,
      cappedWins: cappedRounds,
      maxObservedWinX: maxWin / MICRO,
      meanX: Number(meanX.toFixed(5)),
      variance: Number(varX.toFixed(4)),
      stdDev: Number(Math.sqrt(Math.max(0, varX)).toFixed(4)),
      avgCascadeDepth: Number((depthSum / count).toFixed(4)),
      maxCascadeDepth: maxDepth,
      bonus: {
        triggerFrequency: Number((bonus / count).toFixed(6)),
        oneIn: bonus ? Math.round(count / bonus) : null,
        avgPayoutX: bonus ? Number((Number(bonusWinSum) / bonus / MICRO).toFixed(3)) : 0,
        avgFreeSpinsPlayed: bonus ? Number((fsPlayedSum / bonus).toFixed(2)) : 0,
        avgFreeSpinsAwarded: bonus ? Number((fsAwardedSum / bonus).toFixed(2)) : 0,
        retriggerFreqPerBonus: bonus ? Number((retriggers / bonus).toFixed(4)) : 0,
        bonusesWithRetrigger: bonus ? Number((retriggerBonuses / bonus).toFixed(4)) : 0,
        awakened8x8FreqPerBonus: bonus ? Number((awakenedBonuses / bonus).toFixed(5)) : 0,
        awakenedCount: awakenedBonuses,
      },
      forgePowerFreqPerRound: Number((powersTotal / count).toFixed(5)),
      forgePowerRoundRate: Number((powerRounds / count).toFixed(5)),
      shardSpawnFreqPerRound: Number((shardsSpawned / count).toFixed(5)),
      mergeFreqPerRound: Number((merges / count).toFixed(6)),
      mergeRoundRate: Number((mergeRounds / count).toFixed(6)),
      maxShardLevelObserved: maxShardLevel,
      mergeLevelHist,
    },
    null,
    2,
  ),
);
