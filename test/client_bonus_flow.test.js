// Focused tests for the 2026-09-06 Bonus Experience Integration pass — pure
// presentation-pacing logic (client/src/bonusFlow.js), run against REAL
// engine traces (no client test harness exists for DOM/Pixi; these test the
// STRUCTURE of how a round's already-resolved trace gets paced into manual
// Bonus spins, not any rendered pixel). See the final report for which of
// the 9 requested scenarios need a browser instead.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveRound } from "../engine/round.js";
import { defaultConfig } from "../engine/config.js";
import { chunkSteps, shouldAutoContinue } from "../client/src/bonusFlow.js";

const cfg = defaultConfig();

// buildTimeline() is trivial (rename + nominal duration) and lives in
// client/src/timeline.js; re-implement just the "kind" mapping needed here
// so this file has zero DOM/Pixi imports.
const KIND = {
  fill: "spinStart", cascade: "clusterHighlight", heat: "heat", remove: "remove",
  power: "power", gravity: "gravity", refill: "refill", merge: "merge",
  spinEnd: "spinEnd", bonusStart: "bonusStart", expansion: "expansion",
  molten: "molten", retrigger: "retrigger", bonusEnd: "bonusEnd",
  maxWin: "maxWin", roundEnd: "roundEnd",
};
const toSteps = (trace) => trace.map((ev) => ({ kind: KIND[ev.t], data: ev })).filter((s) => s.kind);

function findRound(predicate, seed = "20260902", limit = 3000) {
  for (let i = 0; i < limit; i++) {
    const r = resolveRound(cfg, seed, i, { trace: true });
    if (predicate(r)) return { round: i, result: r };
  }
  throw new Error("no matching round found in range");
}

const natural = findRound((r) => !!r.bonus, "20260902", 3000); // e.g. round 749 per the dev-drawer preset
const bought = { round: 0, result: resolveRound(cfg, "20260902", 0, { trace: true, buyBonus: true }) };

test("a non-Bonus round chunks into exactly one segment (unchanged, no pause)", () => {
  const { result } = findRound((r) => !r.bonus, "20260902", 500);
  const chunks = chunkSteps(toSteps(result.trace));
  assert.equal(chunks.length, 1);
});

test("no automatic first Free Spin: chunk[0] ends at bonusStart, not the first spin's spinEnd", () => {
  const chunks = chunkSteps(toSteps(natural.result.trace));
  assert.ok(chunks.length > 1, "expected a Bonus round to produce >1 chunk");
  const last = chunks[0][chunks[0].length - 1];
  assert.equal(last.kind, "bonusStart");
  // the free spin's own spinStart must NOT be in chunk[0]
  assert.ok(!chunks[0].some((s, idx) => s.kind === "spinStart" && idx > 0));
});

test("one SPIN click resolves exactly one Bonus spin: every subsequent chunk has exactly one spinStart/spinEnd pair", () => {
  const chunks = chunkSteps(toSteps(natural.result.trace));
  for (const chunk of chunks.slice(1, -1)) {
    // an interior free-spin chunk (not necessarily the last, which may also
    // carry bonusEnd/roundEnd) starts with its own spinStart
    assert.equal(chunk[0].kind, "spinStart");
    assert.equal(chunk.filter((s) => s.kind === "spinStart").length, 1);
    assert.equal(chunk.filter((s) => s.kind === "spinEnd").length, 1);
  }
  // the very last chunk still has exactly one spin, plus the round's tail
  const lastChunk = chunks[chunks.length - 1];
  assert.equal(lastChunk.filter((s) => s.kind === "spinStart").length, 1);
  assert.ok(lastChunk.some((s) => s.kind === "roundEnd"));
});

test("chunking preserves total step count and order (no event dropped/reordered/duplicated)", () => {
  const steps = toSteps(natural.result.trace);
  const chunks = chunkSteps(steps);
  const flat = chunks.flat();
  assert.equal(flat.length, steps.length);
  assert.deepEqual(flat, steps);
});

test("Buy Bonus produces the SAME chunk-boundary shape as a natural trigger (one shared entry path)", () => {
  const naturalChunks = chunkSteps(toSteps(natural.result.trace));
  const boughtChunks = chunkSteps(toSteps(bought.result.trace));
  assert.ok(boughtChunks.length > 1);
  assert.equal(boughtChunks[0][boughtChunks[0].length - 1].kind, "bonusStart");
  assert.equal(naturalChunks[0][naturalChunks[0].length - 1].kind, boughtChunks[0][boughtChunks[0].length - 1].kind);
  // Buy Bonus skips the paid spin entirely — chunk[0] has no "remove"/"clusterHighlight"
  // BASE-mode cascade steps before bonusStart, unlike (usually) a natural trigger's chunk[0].
  assert.equal(bought.result.trace[0].t, "bonusStart");
});

test("Base autoplay never auto-consumes a Bonus spin (shouldAutoContinue is false while bonusPending)", () => {
  assert.equal(shouldAutoContinue({ auto: true, playing: false, bonusPending: true, balance: 100, bet: 1 }), false);
  assert.equal(shouldAutoContinue({ auto: true, playing: false, bonusPending: false, balance: 100, bet: 1 }), true);
  assert.equal(shouldAutoContinue({ auto: false, playing: false, bonusPending: false, balance: 100, bet: 1 }), false);
  assert.equal(shouldAutoContinue({ auto: true, playing: true, bonusPending: false, balance: 100, bet: 1 }), false);
  assert.equal(shouldAutoContinue({ auto: true, playing: false, bonusPending: false, balance: 0.5, bet: 1 }), false);
});

// ---- Free Spins panel visibility / background wiring: DOM+CSS, no headless
// browser harness in this project — verified by static presence of the exact
// rules instead of a rendered check. See the final report for the honest
// limitation (this does not prove the CSS renders correctly, only that the
// wiring hasn't been silently deleted).
test("Free Spins panel visibility rule exists: hidden in base, shown in bonus/awakened", () => {
  const css = readFileSync(new URL("../client/src/styles.css", import.meta.url), "utf8");
  assert.match(css, /#app\[data-phase="base"\]\s*#fs-panel\s*\{\s*display:\s*none/);
  assert.match(css, /#app\[data-phase="bonus"\]\s*#fs-panel/);
});

test("Bonus background crossfade rule exists on #bg[data-phase]", () => {
  const css = readFileSync(new URL("../client/src/styles.css", import.meta.url), "utf8");
  assert.match(css, /#bg\[data-phase="bonus"\]\s*#bg-video-bonus\.ready/);
  assert.match(css, /#bg\[data-phase="bonus"\]\s*#bg-video\.ready/);
  assert.match(css, /#bg-video-bonus\.ready\s*,[^{]*\{\s*opacity:\s*1/); // Bonus video becomes visible
});
