// Pure presentation-pacing logic for the Bonus flow — no DOM, no Pixi, no
// engine/RNG. A RoundResult's trace already contains the WHOLE round
// (paid spin + every free spin it triggers, per CLAUDE.md's own "Round"
// definition) in one deterministic shot; this module only decides how the
// CLIENT paces presenting that already-fully-resolved trace so each Bonus
// free spin waits for an explicit SPIN click instead of auto-playing through.
//
// chunkSteps splits a buildTimeline() step list at every "spinStart", so:
//   chunk[0]        = the paid spin (fill..spinEnd) + bonusStart if triggered
//   chunk[1..N-1]   = one free spin each (spinStart..spinEnd + its trailing
//                     molten/retrigger/expansion housekeeping events)
//   chunk[last]     = the final free spin + bonusEnd/roundEnd/maxWin
// A non-bonus round always produces exactly one chunk (unchanged behavior).
export function chunkSteps(steps) {
  const chunks = [];
  let current = [];
  for (const step of steps) {
    if (step.kind === "spinStart" && current.length) {
      chunks.push(current);
      current = [];
    }
    current.push(step);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// Should the Base-Game autoplay loop schedule another spin right now?
// Bonus free spins are ALWAYS manual, regardless of the Base autoplay toggle.
export function shouldAutoContinue({ auto, playing, bonusPending, balance, bet }) {
  return !!auto && !playing && !bonusPending && balance >= bet;
}
