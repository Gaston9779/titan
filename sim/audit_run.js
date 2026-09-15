// One-off measurement script for the feature-audit task. Calls the EXISTING
// engine's resolveRound() directly (same call sim/run.js makes) — no new math,
// no engine changes, no second engine. Measurement only.
// Usage: node sim/audit_run.js [count] [masterSeed]
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";

const count = Number(process.argv[2] || 1_000_000);
const masterSeed = BigInt(process.argv[3] || "20260904");
const cfg = defaultConfig();

let sum = 0n;
let baseSum = 0n;
let bonusSum = 0n;
let wins = 0;
let bonusRounds = 0;
let coreRounds = 0;
const coreHist = [0, 0, 0, 0, 0, 0]; // index 5 = "5+"
let shardRounds = 0;
let hammerRounds = 0; // Hammer-made-WILD occurrence proxy (Hammer always plants >=2 WILDs when it fires)
let naturalWildRounds = 0;
let awakenedRounds = 0;

// Natural-WILD detection: a WILD in the paid spin's "fill" board is
// unambiguously natural (first board, no power has run yet); a WILD newly
// appearing in a "refill" board at a cell that was EMPTY in the immediately
// preceding "gravity" board is also unambiguously natural (a pre-existing
// WILD moved by gravity lands on itself, never on an EMPTY destination, so
// refill never touches it). Scoped to the PAID spin only (stops at its own
// spinEnd/second fill, i.e. before any bonus spins).
function paidSpinHasNaturalWild(trace) {
  let sawFill = false;
  let prevGravityBoard = null;
  for (const ev of trace) {
    if (ev.t === "fill") {
      if (sawFill) break;
      sawFill = true;
      if (ev.board.some((c) => c.k === "WILD")) return true;
    } else if (ev.t === "gravity") {
      prevGravityBoard = ev.board;
    } else if (ev.t === "refill") {
      if (prevGravityBoard) {
        for (let i = 0; i < ev.board.length; i++) {
          if (prevGravityBoard[i].k === "EMPTY" && ev.board[i].k === "WILD") return true;
        }
      }
    } else if (ev.t === "spinEnd") {
      if (sawFill) break;
    }
  }
  return false;
}
let maxWin = 0;
const winsX = new Float64Array(count);
const buckets = { x10: 0, x50: 0, x100: 0, x250: 0, x500: 0, x1000: 0 };
const t0 = performance.now();

for (let i = 0; i < count; i++) {
  const r = resolveRound(cfg, masterSeed, i, { trace: true });
  const w = r.cappedWin;
  if (paidSpinHasNaturalWild(r.trace)) naturalWildRounds++;
  sum += BigInt(w);
  const wx = w / MICRO;
  winsX[i] = wx;
  if (w > 0) wins++;
  if (w > maxWin) maxWin = w;
  baseSum += BigInt(r.contribByLocation.BASE);
  bonusSum += BigInt(r.contribByLocation.BONUS_BASE) + BigInt(r.contribByLocation.BONUS_AWAKENED);

  const d = r.diagnostics;
  coreHist[Math.min(5, d.coreCount)]++;
  if (d.coreCount >= 1) coreRounds++;
  if (d.shardsSpawned > 0) shardRounds++;
  if (d.powersByType.HAMMER > 0) hammerRounds++;
  if (r.bonus) {
    bonusRounds++;
    if (r.bonus.reachedAwakened) awakenedRounds++;
  }
  if (wx >= 10) buckets.x10++;
  if (wx >= 50) buckets.x50++;
  if (wx >= 100) buckets.x100++;
  if (wx >= 250) buckets.x250++;
  if (wx >= 500) buckets.x500++;
  if (wx >= 1000) buckets.x1000++;
}
const ms = performance.now() - t0;

const winning = [];
for (let i = 0; i < count; i++) if (winsX[i] > 0) winning.push(winsX[i]);
winning.sort((a, b) => a - b);
const pct = (p) => (winning.length ? winning[Math.min(winning.length - 1, Math.floor(p * winning.length))] : 0);

const betTotal = Number(BigInt(count) * BigInt(MICRO));
const rtp = Number(sum) / betTotal;

console.log(
  JSON.stringify(
    {
      count,
      masterSeed: String(masterSeed),
      elapsedSec: +(ms / 1000).toFixed(1),
      roundsPerSec: Math.round(count / (ms / 1000)),
      totalRtp: +rtp.toFixed(6),
      baseRtp: +(Number(baseSum) / betTotal).toFixed(6),
      bonusRtp: +(Number(bonusSum) / betTotal).toFixed(6),
      hitRate: +(wins / count).toFixed(6),
      noWinRate: +(1 - wins / count).toFixed(6),
      bonusTriggerFrequency: +(bonusRounds / count).toFixed(6),
      bonusOneIn: bonusRounds ? Math.round(count / bonusRounds) : null,
      avgBonusWinX: bonusRounds ? +(Number(bonusSum) / MICRO / bonusRounds).toFixed(3) : 0,
      shardOccurrenceFrequency: +(shardRounds / count).toFixed(6),
      naturalWildOccurrenceFrequency: +(naturalWildRounds / count).toFixed(6),
      hammerWildOccurrenceFrequency: +(hammerRounds / count).toFixed(6),
      coreOccurrenceFrequency_ge1: +(coreRounds / count).toFixed(6),
      coreCountHistogram_0_1_2_3_4_5plus: coreHist,
      awakened8x8Frequency: +(awakenedRounds / count).toFixed(6),
      avgWinWhenWinningX: wins ? +(winning.reduce((a, b) => a + b, 0) / wins).toFixed(4) : 0,
      medianWinningX: +pct(0.5).toFixed(4),
      p90WinningX: +pct(0.9).toFixed(4),
      p95WinningX: +pct(0.95).toFixed(4),
      p99WinningX: +pct(0.99).toFixed(4),
      p999WinningX: +pct(0.999).toFixed(4),
      maxObservedWinX: maxWin / MICRO,
      maxObservedWinAt50EUR: +((maxWin / MICRO) * 50).toFixed(2),
      wins_ge10x: buckets.x10,
      wins_ge50x: buckets.x50,
      wins_ge100x: buckets.x100,
      wins_ge250x: buckets.x250,
      wins_ge500x: buckets.x500,
      wins_ge1000x: buckets.x1000,
    },
    null,
    2,
  ),
);
