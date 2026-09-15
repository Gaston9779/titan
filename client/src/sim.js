// Thin wrapper around the math engine. Produces ONE deterministic RoundResult
// (with its presentation trace) for a given (masterSeed, roundIndex, config).
// No game logic here — this only calls resolveRound and forwards the result.
import { resolveRound, defaultConfig, MICRO } from "./engine.js";

const config = defaultConfig(); // RTP_96 profile, as shipped

export function runRound(masterSeed, roundIndex, opts = {}) {
  const seed = normalizeSeed(masterSeed);
  const result = resolveRound(config, seed, roundIndex, { trace: true, ...opts });
  return { result, seed: String(seed), roundIndex, config };
}

// determinism aid: same input => byte-identical cappedWin + trace length
export function verifyDeterministic(masterSeed, roundIndex, opts = {}) {
  const a = resolveRound(config, normalizeSeed(masterSeed), roundIndex, { trace: true, ...opts });
  const b = resolveRound(config, normalizeSeed(masterSeed), roundIndex, { trace: true, ...opts });
  return (
    a.cappedWin === b.cappedWin &&
    JSON.stringify(a.contributions) === JSON.stringify(b.contributions) &&
    JSON.stringify(a.trace) === JSON.stringify(b.trace)
  );
}

function normalizeSeed(s) {
  if (typeof s === "bigint") return s;
  const str = String(s).trim();
  if (/^\d+$/.test(str)) return BigInt(str);
  // hash arbitrary text to a stable 64-bit-ish seed (FNV-1a) so any string works
  let h = 0x811c9dc5n;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * 0x01000193n) & 0xffffffffffffffffn;
  }
  return h === 0n ? 1n : h;
}

export { MICRO };
