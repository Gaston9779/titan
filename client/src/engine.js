// Single entry point to the authoritative math engine (repo-root /engine).
// The client imports ONLY from here. It never re-implements any game decision.
export { resolveRound } from "@engine/round.js";
export { defaultConfig, MICRO, configHash, bucketIndex } from "@engine/config.js";
export {
  CAL,
  FREE_SPINS,
  SHARD_MAX_LEVEL,
  shardValue,
  HAMMER_WILDS,
  SHIELD_CELLS,
  SHIELD_TTL,
  BLADE_MIN_LOW_TO_FIRE,
  POWERS_PER_SEQUENCE_CAP,
} from "@engine/features.js";
