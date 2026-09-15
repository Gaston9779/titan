// HAMMER placement audit — collects HAMMER_TARGET activations from the real
// engine trace and reports window distribution, full-pattern distribution
// (window + which of the destroyed cells became WILD), and whether a
// Hammer-made WILD ends up touching/supporting a paying cluster before being
// consumed. Measurement only — no engine changes.
// Usage: node sim/audit_hammer.js [target] [seed]
import { resolveRound } from "../engine/round.js";
import { defaultConfig } from "../engine/config.js";

const TARGET = Number(process.argv[2] || 10000);
const masterSeed = BigInt(process.argv[3] || "20260905");
const cfg = defaultConfig();

const windowCounts = {};
const patternCounts = {}; // window + sorted relative WILD offsets within window
let total = 0;
let supported = 0;
let unsupported = 0;
const t0 = performance.now();

for (let i = 0; total < TARGET; i++) {
  const r = resolveRound(cfg, masterSeed, i, { trace: true });
  const trace = r.trace;
  for (let ti = 0; ti < trace.length && total < TARGET; ti++) {
    const ev = trace[ti];
    if (ev.t !== "power" || ev.kind !== "HAMMER") continue;
    total++;
    const [tr, tc] = ev.detail.window;
    const wkey = `${tr},${tc}`;
    windowCounts[wkey] = (windowCounts[wkey] || 0) + 1;

    const W = ev.board.length === 49 ? 7 : ev.board.length === 64 ? 8 : 6;
    const wildCells = ev.detail.wildCells || [];
    const rel = wildCells
      .map((idx) => {
        const c = idx % W, rr = (idx - c) / W;
        return `${rr - tr}:${c - tc}`;
      })
      .sort()
      .join("|");
    const pkey = `${wkey}#${rel}`;
    patternCounts[pkey] = (patternCounts[pkey] || 0) + 1;

    // "meaningfully supports a potential cluster" = right after Hammer
    // resolves (ev.board, pre-gravity), at least one placed WILD has an
    // orthogonal neighbor that is a real symbol it could substitute for and
    // help build a cluster with — the actual precondition for it ever paying.
    const board = ev.board;
    const neighborsOf = (idx) => {
      const c = idx % W, rr = (idx - c) / W;
      const out = [];
      if (rr > 0) out.push(idx - W);
      if (rr < W - 1) out.push(idx + W); // grid is square (W==H) in this game
      if (c > 0) out.push(idx - 1);
      if (c < W - 1) out.push(idx + 1);
      return out;
    };
    const touchesSymbol = wildCells.some((wi) => neighborsOf(wi).some((n) => board[n] && board[n].k === "SYM"));
    if (touchesSymbol) supported++;
    else unsupported++;
  }
}
const ms = performance.now() - t0;

const winSorted = Object.entries(windowCounts).sort((a, b) => b[1] - a[1]);
const patSorted = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
const maxWinShare = winSorted[0][1] / total;
const maxPatShare = patSorted[0][1] / total;

console.log(
  JSON.stringify(
    {
      totalActivations: total,
      elapsedSec: +(ms / 1000).toFixed(1),
      distinctWindows: winSorted.length,
      topWindowShare: +maxWinShare.toFixed(4),
      top10Windows: winSorted.slice(0, 10).map(([k, n]) => [k, n, +((n / total) * 100).toFixed(2) + "%"]),
      distinctFullPatterns: patSorted.length,
      topPatternShare: +maxPatShare.toFixed(4),
      top10Patterns: patSorted.slice(0, 10).map(([k, n]) => [k, n, +((n / total) * 100).toFixed(2) + "%"]),
      hammerWildClusterSupportRate: +(supported / total).toFixed(4),
      hammerWildNoImmediateSupportRate: +(unsupported / total).toFixed(4),
    },
    null,
    2,
  ),
);
