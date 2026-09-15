// V1 configuration — values from docs/02_MATH_SPEC.md (all TUNABLE_V1).
// Money in integer micro-units: 1x total bet = 1_000_000 µ.

import { CAL } from "./features.js";

export const MICRO = 1_000_000;
export const MIN_CLUSTER = 5; // FROZEN (F1)

// §3.2 W_GEN — RTP_96 tuning pass 1 (2026-09-02): flatten LOW dominance for hit-freq
// control + raise W_CORE for bonus frequency. OLD V1 = [220,200,175,150,90,70,45,28,7].
// See docs/DECISIONS.md.
// TUNABLE_V1 — 2026-09-05 pass 2 (see docs/DECISIONS.md): natural base-game WILD
// ENABLED. The original weights [210,192,...,9] only give ~0.1%/cell resolution
// per integer step (weight 1 of ~984 already overshoots the target WILD-visibility
// band) — WGEN_SCALE re-expresses every EXISTING symbol at 10x, changing NO
// relative probability (each ratio is identical), so WGEN_WILD_WEIGHT can sit at
// a fine enough resolution to land in the 0.5-1.5% "spins with a natural WILD"
// target. IMPORTANT: CAL.BONUS.BONUS_W_CORE (features.js) is a fixed ABSOLUTE
// weight spliced into this SAME array for bonus-mode Core generation — it is
// scaled by the identical WGEN_SCALE there so Core spawn chance is mathematically
// UNCHANGED (verified: 96.95% RTP at WGEN_WILD_WEIGHT=0 post-scale, matching the
// pre-scale/pre-WILD baseline within sampling noise). Calibration (300-400k
// rounds, seed 20260905): weight 2 -> 0.77% spins w/ natural WILD, RTP 95.83%;
// weight 3 -> 1.16%, RTP 96.22%; weight 4 -> 1.54%, RTP 96.68%. Weight 3 chosen
// (centered in the 0.5-1.5% band). The resulting ~96.2% (before the paytable
// compensation below) is brought back to ~95.5% by BASE_PAYTABLE_COMP.
export const WGEN_SCALE = 10;
export const WGEN_WILD_WEIGHT = 3;
export const WGEN_SYMBOLS = ["L1", "L2", "L3", "L4", "H1", "H2", "H3", "H4", "CORE", "WILD"];
export const WGEN_WEIGHTS = [
  210 * WGEN_SCALE, 192 * WGEN_SCALE, 170 * WGEN_SCALE, 148 * WGEN_SCALE,
  95 * WGEN_SCALE, 76 * WGEN_SCALE, 50 * WGEN_SCALE, 33 * WGEN_SCALE, 9 * WGEN_SCALE,
  WGEN_WILD_WEIGHT,
];

// §2.2 PAYTABLE (x total bet), bucket order:
// B5 B6 B7 B8 B9 B10 B12 B15 B20 B25 B30 B36 B49
// RTP_96 tuning pass 1 (2026-09-02): scale + top-heavy reshape of PAYTABLE_V1.
// Effective per-bucket multiplier vs V1 = 5.87 x ramp
//   [0.85,0.88,0.9,0.94,1.0,1.12,1.35,1.9,2.7,3.8,5.2,7.0,9.0]
// (bulk buckets ~x5.0-5.9 for base RTP; upper buckets ramped for high-vol tail /
// bonus mega-clusters). Monotonic in size and symbol rank preserved. See docs/DECISIONS.md.
const PAYTABLE_X = {
  L1: [0.998, 1.29, 1.58, 2.21, 3.23, 5.26, 9.51, 22.3, 55.5, 134, 305, 740, 1580],
  L2: [1.25, 1.55, 2.11, 2.76, 4.11, 6.57, 11.9, 29, 71.3, 178, 397, 904, 2010],
  L3: [1.5, 2.07, 2.64, 3.59, 5.28, 8.55, 15.8, 37.9, 95.1, 223, 519, 1230, 2640],
  L4: [2, 2.58, 3.43, 4.69, 7.04, 11.2, 20.6, 49.1, 119, 290, 672, 1560, 3430],
  H1: [2.99, 4.13, 5.81, 8.28, 12.3, 19.7, 36.5, 83.6, 206, 491, 1160, 2670, 5810],
  H2: [3.99, 5.68, 7.92, 11.6, 17.6, 28.3, 52.3, 123, 301, 714, 1680, 3900, 8450],
  H3: [5.99, 8.78, 12.7, 18.2, 27.6, 44.7, 83.2, 190, 475, 1160, 2750, 6370, 13740],
  H4: [9.98, 15, 21.7, 31.5, 47.5, 78.9, 143, 335, 824, 2010, 4730, 11090, 24300],
};

// TUNABLE_V1 — 2026-09-05 pass 2: RTP room for natural WILD (above), created by
// a uniform micro-cut to every symbol/bucket in the shared paytable (cluster
// thresholds, bucket boundaries, Bonus/feature probabilities all untouched).
// Measured uncompensated RTP with WILD enabled ~96.2% (300-400k rounds, seed
// 20260905); target final RTP ~95.5% (band 95.0-96.0%) => multiplier
// 95.5/96.2 ~= 0.9925. Applied identically to every bucket of every symbol so
// size/rank ordering (and thus the paytable's shape) is preserved exactly.
export const BASE_PAYTABLE_COMP = 0.9925;
function toMicroTable(t) {
  const out = {};
  for (const k of Object.keys(t)) out[k] = t[k].map((x) => Math.round(x * BASE_PAYTABLE_COMP * MICRO));
  return out;
}

// n -> bucket index (or -1 if below min cluster). §2.1
export function bucketIndex(n) {
  if (n < 5) return -1;
  if (n <= 9) return n - 5; // 5..9 -> 0..4
  if (n <= 11) return 5; // B10  (10-11)
  if (n <= 14) return 6; // B12  (12-14)
  if (n <= 19) return 7; // B15  (15-19)
  if (n <= 24) return 8; // B20  (20-24)
  if (n <= 29) return 9; // B25  (25-29)
  if (n <= 35) return 10; // B30 (30-35)
  if (n <= 48) return 11; // B36 (36-48)
  return 12; // B49 (49-64)
}

export function payMicro(config, sym, n) {
  const bi = bucketIndex(n);
  if (bi < 0) return 0;
  const row = config.paytableMicro[sym];
  if (!row) return 0; // WILD / CORE never pay directly
  return row[bi];
}

export function defaultConfig(overrides = {}) {
  const cfg = {
    id: "RTP_96",
    gridW: 6,
    gridH: 6,
    minCluster: MIN_CLUSTER,
    wgenSymbols: WGEN_SYMBOLS,
    wgenWeights: WGEN_WEIGHTS,
    wgenTotal: WGEN_WEIGHTS.reduce((a, b) => a + b, 0),
    paytableMicro: toMicroTable(PAYTABLE_X),
    maxWinMicro: 10000 * MICRO, // §13 MAX_WIN_X_V1
    cascadeDepthHardCap: 40, // §4.5
    coreBonusThreshold: 3, // F7
  };
  return { ...cfg, ...overrides };
}

// Stable-order hash of the payout-affecting config (FNV-1a over canonical JSON).
export function configHash(config) {
  const canon = {
    id: config.id,
    gridW: config.gridW,
    gridH: config.gridH,
    minCluster: config.minCluster,
    wgenSymbols: config.wgenSymbols,
    wgenWeights: config.wgenWeights,
    paytableMicro: config.paytableMicro,
    maxWinMicro: config.maxWinMicro,
    cascadeDepthHardCap: config.cascadeDepthHardCap,
    coreBonusThreshold: config.coreBonusThreshold,
    cal: CAL, // activation/frequency calibration layer (§5-§7)
  };
  const s = JSON.stringify(canon);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
