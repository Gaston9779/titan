// ============================================================================
// CENTRAL PRESENTATION CONFIG
// The single home for every *optical* tuning knob the renderer applies on top of
// the approved artwork: per-symbol scale hierarchy, special-symbol emphasis
// (WILD / FORGE CORE aura + pulse), and the timing curve of the fall / refill /
// landing animation system.
//
// Nothing here changes a game outcome. It only decides how the engine's trace is
// PRESENTED. No render file may hardcode these values locally — import from here.
// ============================================================================

// --- optical scale hierarchy -------------------------------------------------
// Multiplies the base symbol fit (assets.js SYMBOL_FIT) AFTER alpha-trim so the
// visible artwork — not the source PNG box — drives comparative weight.
// Target reading order (largest / most prominent first):
//   FORGE CORE  >  WILD  >  SHARD  >  HIGH  >  LOW
export const OPTICAL = {
  LOW: 1.0,
  HIGH: 1.05, // HIGH tier reads a touch heavier than LOW
  SHARD: 1.1,
  WILD: 1.13, // clearly above a HIGH symbol, never as big as a CORE
  CORE: 1.22, // the special that must be spotted instantly (stays inside its cell)
};

// Per-asset fine nudges (optical weight still off after trim + tier scale).
// Applied on top of the tier value above. Keep small (±0.08).
export const PER_SYMBOL_NUDGE = {
  L3: 0.96, // busy silhouette — pull in slightly
  H1: 0.98,
  H3: 0.97,
  H4: 0.98,
};

// --- WILD emphasis --------------------------------------------------------
// Molten/orange aura, restrained idle breathing, strong landing impact + sparks.
export const WILD = {
  auraColor: 0xff9a3c, // molten orange
  auraScale: 1.5, // aura sprite size vs cell — soft falloff, minimal neighbour bleed
  auraAlpha: 0.5,
  pulsePeriodMs: 1650, // slow, restrained breathing
  pulseAmp: 0.1, // aura scale swing (±)
  symbolPulseAmp: 0.035, // the artwork itself breathes very slightly
  landScale: 1.34, // entrance / landing overshoot
  shimmerMs: 460, // molten sweep on appearance
};

// --- FORGE CORE emphasis -----------------------------------------------
// The bonus symbol: MORE important than WILD — hotter, larger halo, slow pulse,
// landing flash + molten particle burst, escalating emphasis for multiples.
export const CORE = {
  auraColor: 0xff6a1f, // deeper, hotter molten than WILD
  auraColorInner: 0xffe3a0,
  auraScale: 1.7, // visibly larger halo than WILD
  auraAlpha: 0.64, // stronger than WILD
  pulsePeriodMs: 1550, // slow breathing energy
  pulseAmp: 0.16,
  symbolPulseAmp: 0.055,
  landScale: 1.46, // bigger landing impact than WILD
  burstParticles: 20,
  ringMs: 560,
};

// --- SHARD escalation by level (2x/4x subtle -> 64x strongest; presentation
// only, level values themselves come verbatim from the engine trace) ---------
// level: 1=2x 2=4x 3=8x 4=16x 5=32x 6=64x (SHARD_MAX_LEVEL=6, see engine).
export const SHARD_TIER = {
  1: { emberMult: 1.0, pulseMult: 1.0, flash: false, shake: false },
  2: { emberMult: 1.0, pulseMult: 1.0, flash: false, shake: false },
  3: { emberMult: 1.3, pulseMult: 1.12, flash: false, shake: false },
  4: { emberMult: 1.3, pulseMult: 1.12, flash: false, shake: false },
  5: { emberMult: 1.7, pulseMult: 1.3, flash: true, shake: false }, // 32x — strong molten pulse
  6: { emberMult: 2.3, pulseMult: 1.55, flash: true, shake: true }, // 64x — strongest: pulse + board flash + shake
};
export function shardTier(level) {
  return SHARD_TIER[level] || SHARD_TIER[1];
}

// --- multi-CORE anticipation (presentation only — trigger math is the engine's) -
export const CORE_ANTICIPATION = {
  two: { shakeAmp: 0, vignette: 0.18, sound: null }, // subtle tension
  threePlus: { banner: "FORGE CORES ALIGNED", vignette: 0.4, holdMs: 900 },
};

// --- fall / gravity / refill / landing ----------------------------------
// Distance-aware: duration scales with how many rows a symbol travels, clamped.
// ONE shared drop animator uses these for BOTH the new-spin drop and cascades.
export const FALL = {
  perRowMs: 40, // ms added per row of travel
  // NEW SPIN drop-in: whole grid falls from above the mask (spec: ~180–320ms)
  spin: { minMs: 180, maxMs: 320 },
  // CASCADE: surviving-symbol gravity slide + refill drop (spec: ~150–280ms)
  cascade: { minMs: 150, maxMs: 280 },
  columnStaggerMs: 34, // each column starts a beat after the previous
  rowStaggerMs: 16, // within a column, higher cells lag slightly (loose stack)
  refillSpawnRows: 1.15, // cascade refill: rows above the top edge to spawn at
  newSpinSpawnRows: 0.9, // new-spin drop: the strip starts just above the board
  landSquash: 0.15, // y-squash / x-stretch at impact
  landReboundMs: 130,
};

// --- cascade cadence (nominal holds between phases; scaled by clock.speed) ---
export const CADENCE = {
  clusterHold: 520,
  heatHold: 90,
  postRemoveHold: 40,
  interCascadeHold: 40,
};

// distance-aware fall duration for a travel of `rows` cells, within `range`
// (FALL.spin for the new-spin drop-in, FALL.cascade for gravity/refill).
export function fallDuration(rows, range = FALL.cascade) {
  const r = Math.max(1, Math.abs(rows));
  return Math.min(range.maxMs, Math.max(range.minMs, range.minMs + (r - 1) * FALL.perRowMs));
}
