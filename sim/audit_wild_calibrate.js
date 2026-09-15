// Natural-WILD calibration: scales the existing WGEN weights by a common
// factor (preserving every symbol's relative probability exactly) so a small
// WILD weight can be expressed at finer granularity, then measures, per
// candidate weight: the fraction of PAID spins (fill + all cascade refills in
// that one spin) containing at least one naturally-drawn WILD, plus RTP/hit
// rate impact. Measurement only.
// Usage: node sim/audit_wild_calibrate.js [scale] [weights...]
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";
import { CAL } from "../engine/features.js";

const scale = Number(process.argv[2] || 10);
const candidateWeights = process.argv.slice(3).map(Number);
const weights = candidateWeights.length ? candidateWeights : [1, 2, 3, 4, 6];
const N = Number(process.env.N || 300000);
const seed = 20260905n;

const base = defaultConfig();
// Scaling wgenWeights by a common factor changes NO probability by itself (every
// ratio is identical) EXCEPT the bonus-mode CORE override, which is a fixed
// ABSOLUTE weight (CAL.BONUS.BONUS_W_CORE) assigned directly into the SAME
// weights array — so it must be scaled by the same factor to keep Core spawn
// chance in bonus mode mathematically unchanged. Restored after each measurement.
const origBonusWCore = CAL.BONUS.BONUS_W_CORE;

function cfgWithWild(w) {
  const scaled = base.wgenWeights.map((x) => x * scale);
  scaled[scaled.length - 1] = w; // WILD is last
  CAL.BONUS.BONUS_W_CORE = origBonusWCore * scale;
  return { ...base, wgenWeights: scaled, wgenTotal: scaled.reduce((a, b) => a + b, 0) };
}

// Does the PAID spin (fill event through its own spinEnd) contain >=1
// naturally-drawn WILD? A WILD in "fill" is unambiguously natural (first
// board, no power has run yet). A WILD newly appearing in a "refill" board at
// a cell that was EMPTY in the immediately preceding "gravity" board is also
// unambiguously natural (a pre-existing WILD moved by gravity lands on itself,
// never on an EMPTY destination, so refill never touches it).
function paidSpinHasNaturalWild(trace) {
  let sawFill = false;
  let prevGravityBoard = null;
  for (const ev of trace) {
    if (ev.t === "fill") {
      if (sawFill) break; // next spin (bonus) started — paid spin is done
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

for (const w of weights) {
  const cfg = cfgWithWild(w);
  let sum = 0n;
  let wins = 0;
  let naturalSpins = 0;
  for (let i = 0; i < N; i++) {
    const r = resolveRound(cfg, seed, i, { trace: true });
    sum += BigInt(r.cappedWin);
    if (r.cappedWin > 0) wins++;
    if (paidSpinHasNaturalWild(r.trace)) naturalSpins++;
  }
  const rtp = Number(sum) / (N * MICRO);
  console.log(
    JSON.stringify({
      scale,
      wildWeight: w,
      totalWeight: cfg.wgenTotal,
      perCellProb: +(w / cfg.wgenTotal).toFixed(6),
      N,
      naturalWildSpinFrequency: +(naturalSpins / N).toFixed(5),
      totalRtp: +rtp.toFixed(5),
      hitRate: +(wins / N).toFixed(5),
    }),
  );
}
