import test from "node:test";
import assert from "node:assert/strict";
import { resolveRound } from "../engine/round.js";
import { defaultConfig, MICRO } from "../engine/config.js";

test("1000-round counters run: sane, finite, reproducible aggregates", () => {
  const cfg = defaultConfig();
  const runAgg = () => {
    let sum = 0n;
    let wins = 0;
    for (let i = 0; i < 1000; i++) {
      const r = resolveRound(cfg, 2026n, i);
      sum += BigInt(r.cappedWin);
      if (r.cappedWin > 0) wins++;
    }
    return { rtp: Number(sum) / (1000 * MICRO), hit: wins / 1000 };
  };
  const a = runAgg();
  const b = runAgg();
  assert.deepEqual(a, b); // reproducible
  assert.ok(a.rtp > 0 && a.rtp < 5, `rtp sanity: ${a.rtp}`); // NOT a tuning assertion
  assert.ok(a.hit > 0.02 && a.hit < 0.9, `hit sanity: ${a.hit}`);
});
