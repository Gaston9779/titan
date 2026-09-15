// Buy Bonus RTP measurement — calls the canonical Bonus engine directly via
// resolveRound(config, seed, i, { buyBonus: true }), the SAME code path a
// natural 3-Core trigger uses (see round.js). Measurement only.
// Usage: node sim/audit_buybonus.js [count] [masterSeed] [priceX]
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";

const count = Number(process.argv[2] || 1_000_000);
const masterSeed = BigInt(process.argv[3] || "20260905");
const priceX = Number(process.argv[4] || 50);
const cfg = defaultConfig();

let sum = 0n;
let awakenedCount = 0;
let maxWin = 0;
const winsX = new Float64Array(count);
const t0 = performance.now();

for (let i = 0; i < count; i++) {
  const r = resolveRound(cfg, masterSeed, i, { buyBonus: true });
  const w = r.cappedWin;
  sum += BigInt(w);
  winsX[i] = w / MICRO;
  if (w > maxWin) maxWin = w;
  if (r.bonus && r.bonus.reachedAwakened) awakenedCount++;
}
const ms = performance.now() - t0;

const sorted = Float64Array.from(winsX).sort();
const pct = (p) => sorted[Math.min(count - 1, Math.floor(p * count))];

const avgX = Number(sum) / MICRO / count;
console.log(
  JSON.stringify(
    {
      count,
      masterSeed: String(masterSeed),
      priceX,
      elapsedSec: +(ms / 1000).toFixed(1),
      roundsPerSec: Math.round(count / (ms / 1000)),
      avgBonusReturnX: +avgX.toFixed(4),
      medianX: +pct(0.5).toFixed(4),
      p90X: +pct(0.9).toFixed(4),
      p95X: +pct(0.95).toFixed(4),
      p99X: +pct(0.99).toFixed(4),
      p999X: +pct(0.999).toFixed(4),
      maxObservedX: maxWin / MICRO,
      awakenedFrequency: +(awakenedCount / count).toFixed(6),
      buyBonusRtpAtPrice: +(avgX / priceX).toFixed(6),
      fairPrice96: +(avgX / 0.96).toFixed(4),
    },
    null,
    2,
  ),
);
