# HANDOFF — FORGE: THE LAST TITAN — TUNING PHASE

Compact context for a fresh session. Read this + the files in §11. Do not re-read the
whole repo.

---

## 1. Current project status

- Phase 1 (math spec) — DONE, human-approved (gate G0 in `docs/DECISIONS.md`).
- Phase 2 engine — DONE and passing:
  - S0–S2 headless engine (RNG, grid, clusters+wilds, cascades, payout, max-win cap).
  - Base-game feature layer (Heat, Pressure, Blade, Hammer, Shield, Shards, Merge).
  - Core-feature activation calibration (1 pass — see §4).
  - Full AWAKEN THE TITAN bonus (7×7 → molten → 8×8 Awakened, retrigger, advantages).
- **Next: tune MathProfile RTP_96** (see §10). Nothing tuned toward 96% yet — current
  full-game RTP is ~0.163.
- NOT started: other RTP profiles (92–95), frontend/PixiJS, presentation, importance
  sampling, S3/S4 large runs, certification stats battery.

---

## 2. Frozen rules — NEVER change without an explicit human approval line in `docs/DECISIONS.md`

Authoritative source: `docs/01_GAME_DESIGN_FROZEN.md` (F1–F11). Summary:

- 6×6 base grid; Cluster Pays; min cluster 5; orthogonal adjacency; cascade to
  exhaustion; winning symbols removed + gravity + refill.
- Symbol taxonomy: 4 LOW + 4 HIGH + FORGE CORE + Forge Shard system (+ Forged Wild,
  Hammer/advantage only).
- Exactly 3 Forge Powers with fixed identities: Blade (row/col, removes LOW), Hammer
  (~local region, destroy + may make Wilds), Shield (lock/preserve valuable cells).
- Pressure: exists only during a cascade sequence; 5 states COLD→WARM→HOT→OVERHEAT→
  CRITICAL; resets at sequence end; NOT a raw global win multiplier.
- Shard merge ladder shape: equal+equal → next level; 2→4→8→16→32→64; merge mechanic
  itself frozen; >64× (level 7) "not assumed safe" — blocked, sim must justify.
- Forge Core: 3 / 4 / 5+ Cores → **8 / 10 / 12 free spins** (these counts FROZEN);
  advantages at 4 and 5+.
- Bonus: starts 7×7 → molten progression → expands to 8×8 (single, terminal) →
  Awakened enhances existing mechanics (no new feature set).
- Max win: deterministic enforcement mandatory; target 10,000× (target revisable only
  as an explicit product decision).
- Math/presentation fully separable; frontend never decides outcomes.
- `seed + config + state ⇒ identical result`; production RNG stays abstract.

Everything numeric is TUNABLE_V1 (see `docs/02_MATH_SPEC.md` §17 and §19 classification).

---

## 3. Engine architecture & files (`engine/`)

Pure, deterministic, no static mutable state. `resolveRound(config, masterSeed,
roundIndex, opts?) -> RoundResult`.

| File | Responsibility |
|---|---|
| `rng.js` | `Rng` (xoshiro256** seeded via splitmix64), integer-only selection; `deriveRoundRng(seed, idx)` → independent per-round substream; optional `tags[]` stream. |
| `config.js` | `defaultConfig(overrides)`, `MICRO=1_000_000`, `PAYTABLE_V1`, `WGEN_*`, `bucketIndex`, `payMicro`, `configHash` (includes `CAL`). Money in integer µ (1x = 1e6 µ). |
| `grid.js` | cell model, `fillBoard`, `gravity`/`columnGravity` (locked cells = immovable dividers), `neighbors`, `generateCell`. Coords: `idx=row*W+col`, row 0 = top. |
| `clusters.js` | `detectClusters` incl. §4.6 wild bridging/contest (partial: contested-blob re-split deferred — Wilds only appear via Hammer). |
| `features.js` | `CAL` (all calibration + bonus params), `modeParams(mode)`, Heat (`heatGainCenti`), `pressureTier(depth, awakened)`, `legalTargets`, `applyBlade/applyHammer/applyShield`, `decrementLocks`, `refillBoard`/`refillCellMaybeShard`, `settleMerges`, `effectiveShardPMille`, `shardValue`, `FREE_SPINS`, `roundHalfEven`. |
| `round.js` | `resolveRound` — `runSpin()` closure (fill + 12-step cascade loop §4.2) + bonus lifecycle (§11/§12/§15.1); why-partition + location-partition contribution; max-win halt across bonus. |
| `index.js` | re-exports. |

Cascade loop (round.js `runSpin`): settle → [detect → depth++/pressure → pay(+shard
mult, cap check) → Heat → remove → powers(forced then natural) → gravity →
refill(+shard spawn) → decrement locks → settle] → repeat.

`RoundResult`: `cappedWin` µ, `capped`, `contributions` (why partition:
BASE_CLUSTER/CASCADE/BLADE/HAMMER/SHIELD/SHARD_MULT), `contribByLocation`
(BASE/BONUS_BASE/BONUS_AWAKENED), `bonus` (null | {triggerCoreCount, freeSpinsAwarded,
freeSpinsPlayed, retriggerCount, reachedAwakened, moltenChargesFinal, bonusWin, …}),
`diagnostics` (cascade depth, powersByType, shards/merges, maxShardLevel, heatGenCenti,
maxPressureTier, …). Both partitions sum EXACTLY to `cappedWin` (tested invariant).

---

## 4. Current calibrated parameter values (`engine/features.js` `CAL`)

Only the ACTIVATION layer has been calibrated (1 pass, 2026-09-02). Everything else is
raw `02_MATH_SPEC.md` V1. Full detail + old→new in `docs/DECISIONS.md`.

Calibrated (changed from spec V1):
- `CAL.HEAT_THRESHOLD`: **650** centi (was 1200)  — Forge Power trigger, §5.3.
- `CAL.PRESSURE.COLD.pMille`: **40** (was 20)  — p_shardSpawn.
- `CAL.PRESSURE.WARM.pMille`: **55** (was 35).
- `CAL.PRESSURE.HOT.pMille`: **70** (was 55)  — keeps spawn ladder monotone.

Still at spec V1 (NOT tuned) — full values in `engine/features.js` `CAL`:
`CLASS_LOW/HIGH/WILD` 100/180/50; `DEPTH_FACTOR` {≤2:1,3:1.15,4:1.30,≥5:1.50};
`PRESSURE_DEPTH` {WARM:2,HOT:3,OVERHEAT:4,CRITICAL:5}; `PRESSURE` heatMult
1/1/1.05/1.10/1.20, OVERHEAT/CRITICAL pMille 80/110, pull OVERHEAT+;
`POWER_WEIGHTS` {BLADE:40,HAMMER:35,SHIELD:25}. Structural caps (features.js consts,
fixed unless a risk forces it): powersPerStep 1, powersPerSeq 4, bladeMinLow 3,
hammerWilds 2, shieldCells 3, shieldTtl 2, shieldMaxActive 4, shardBoardCap 5,
shardMaxLevel 6, multCaps 64/128/5000×, mergePassCap 8, columnPullGap 5.
`CAL.BONUS` (raw spec §11–§12): `BONUS_W_CORE` 5, `MOLTEN_EXPAND_THRESHOLD` 18,
`MOLTEN_BIGWIN` 20×, `AWAKENED_BONUS_SPINS` 3, awakened heat thr ×0.85 (→552),
A5 molten start 4 (+1/extra core, cap +3), heatCarry ×0.5 (→325),
RETRIGGER {3:+4,4:+6,5:+9}; 7×7 overrides powersPerSeq 5 / shardCap 6; 8×8 overrides
powersPerSeq 7 / shardCap 7 / shieldCells 4 / shieldTtl 3 / hammerWilds 3 /
bladeHitsH1 / shardSpawn ×1.5 cap 0.16. Backstops (not game rules, never hit):
retriggerHardCap 30, fsPlayedHardCap 800, cascadeDepthHardCap 40.
`PAYTABLE_V1`, `W_GEN_V1` (`W_CORE` 7): raw spec, in `config.js`.

Profile levers (planned, `docs/05`): `W_CORE_BASE`, `PAYTABLE_MID_SCALE` (B7–B15),
per-profile `MOLTEN_EXPAND_THRESHOLD` & `BONUS_W_CORE`. RTP_96 = reference; keep
tail/vol identity levers (Heat depth factor, shard caps, merge ladder) constant
across profiles.

---

## 5. Full-game baseline metrics (1,000,000 rounds, seed 20260902, current params)

```
Full-game RTP ............ 0.16324
  base contribution ...... 0.15771
  bonus contribution ..... 0.00553   (7x7 0.00553 / Awakened 8x8 0.00000)
Bonus trigger frequency .. 1 / 379
Average bonus payout ..... 2.10x
Average free spins ....... 8.24  (played == awarded; cap never truncates a bonus)
Retrigger ................ 2.4% of bonuses (0.024 retriggers/bonus)
8x8 activation ........... 0 / ~2639 bonuses  (molten expansion never fires)
Hit frequency ............ 33.607%
Max observed win ......... 18x        (10,000x cap: 0 capped wins in 1M)
Avg / max cascade depth .. 0.42 / 9
Forge Power frequency .... 0.0168 / round  (Blade 0.0087, Hammer 0.0075, Shield 0.00057)
Shard spawn frequency .... 0.127 / round
Merge frequency .......... 0.0063 / round  (~1 in 159)
Max observed shard level . 3
Pressure reach / round ... WARM 6.9%  HOT 1.4%  OVERHEAT 0.29%  CRITICAL 0.071%
Performance .............. ~24,700 rounds/sec (single core, counters-only)
Tests ................... 68 / 68 PASS
Deterministic replay .... PASS
```

why-partition RTP (1M): BASE_CLUSTER 0.1273 · CASCADE 0.0282 · BLADE 0.00083 ·
HAMMER 0.00253 · SHIELD 0.000014 · SHARD_MULT 0.00437.

---

## 6. Known mathematical problems / findings (open, for tuning)

1. **Payout scale far below target.** Full-game RTP 0.163 vs 0.96 target. Base game is
   the bulk (0.158). The paytable and/or cluster-formation frequency are the primary
   dials; do not fix with a global multiplier (`docs/05` forbids it).
2. **Bonus EV negligible (0.0055 RTP ≈ 3.4% of total).** Product target is ~28–32%.
   Root causes: bonus frequency 1/379 (target ~1/180–220 → `W_CORE`) and average bonus
   payout only ~2.1× (barely above a base paid spin).
3. **Awakened / 8×8 mode effectively unreachable** (0 expansions in 1M). Molten charge
   sources (Forge Powers ~0.017/round, CRITICAL ~7e-4, big-win ≥20× ~never, retrigger
   2.4%) are far too sparse vs `MOLTEN_EXPAND_THRESHOLD`=18. Needs either much higher
   feature/tail activity in the bonus or a threshold/charge-rate rework — a tuning
   decision, must be recorded in `docs/DECISIONS.md`.
4. **Shield is barely alive** (0.00057/round, RTP 1.4e-5). Non-zero (was dead) but a
   near-dead feature (risk R10). Depends on shards/wilds being present when a power
   fires.
5. **Merges shallow** — max shard level 3 in 1M; level-6 (64×) never observed. Tail
   mechanics contribute almost nothing yet.
6. Risk register `docs/03_MATH_RISK_REGISTER.md`: R2/R3/R5/R6/R9 (feedback / tail /
   Shield persistence / cap bias) must be re-checked at every tuning candidate — the
   structural caps that bound them are load-bearing.

Convergence: current runs are 1M (S2/S3 scale). RTP 96% certification needs S4
(1e8–1e9) per `docs/04_SIMULATION_PLAN.md` — not yet run.

---

## 7. Tests / status

- `node --test` → **68 / 68 PASS** (~5s). Files: `rng`, `grid`, `clusters`, `features`
  (21), `round`, `sim`, `bonus` (18). Covers RNG replay, cluster+wild detection,
  gravity/refill, cascade+cap, Heat/Pressure/each Power/Shard spawn/merge (simultaneous,
  chain, max level, column pull), all bonus tiers + advantages + molten boundary +
  Awakened overrides + retrigger + cap-mid-bonus, contribution-sum (both partitions),
  no state leakage, no infinite loops.
- Tests assert invariants/distributions with tolerances, not recorded outcomes. Some
  use fixture configs (Core-heavy) or temporary `CAL` mutation restored in `finally`.

---

## 8. Determinism / replay status

- PASS. `seed + config + roundIndex ⇒ byte-identical RoundResult` incl. `rngTags`.
  `sim/verify.js` dual-hashes. Per-round substream `deriveRoundRng(seed, idx)` →
  parallel-safe, order-independent. Integer µ money, integer RNG selection,
  `roundHalfEven` for rationals — no float in payout/Heat.

---

## 9. Simulation commands

```
node --test                              # full test suite (68)
node sim/run.js  <count> <seed>           # counters-only full-game run; JSON report
node sim/diag.js <count> <seed>           # activation-layer diagnostics (Heat pctiles,
                                          #   pressure reach, power/shard/merge detail)
node sim/verify.js <seed> <count>         # determinism check (dual hash)
```
Baseline seed used in reports: `20260902`. `run.js` aborts on any contribution-sum
mismatch. ~25k rounds/s ⇒ 1M ≈ 40s, 10M ≈ 7min.

---

## 10. EXACT NEXT OBJECTIVE — tune MathProfile RTP_96

Goal: bring the **RTP_96** profile to 96.00% RTP with a healthy high-volatility
identity, using only TUNABLE_V1 parameters, without touching frozen rules.

Method:
- Staged per `docs/04`: 100k → 1M for candidates, larger for the final. Never tune to
  make a short run display 96%.
- Exploratory targets (NOT hard): hit freq ~25–30%, bonus freq ~1/180–220, base
  contribution ~68–72% of RTP, bonus/extreme ~28–32%, 10,000× reachable but P(cap)
  tiny, high volatility.
- Likely dials: `PAYTABLE_V1` shape (top buckets for tail), `W_CORE` (bonus freq),
  bonus strength (molten charge rate / `MOLTEN_EXPAND_THRESHOLD` so Awakened is
  reachable-but-rare, `AWAKENED_*`), Heat depth factor / heatMult for tail escalation.
- For each serious candidate re-check `docs/03` R1/R2/R3/R5/R6/R9: no runaway
  cascade/Heat/Shard growth, cap cost ≲ 0.5%, no feedback explosion.
- Keep 68 tests green (update value-dependent fixtures; never weaken an invariant).
- Record EVERY change in `docs/DECISIONS.md` (OLD→NEW + reason + evidence). Edit
  `engine/features.js` `CAL` and/or `engine/config.js`.

Do NOT: implement profiles 92–95, frontend, or presentation; run an audit; rewrite
docs beyond DECISIONS + targeted spec value updates.

---

## 11. Files the next session MUST read

1. This file.
2. `docs/02_MATH_SPEC.md` §2 (paytable), §17 (TUNABLE register + tuning directions),
   §19 (FROZEN/TUNABLE/DERIVED). Skim §5–§12 for mechanics only if needed.
3. `docs/05_MATH_PROFILE_ARCHITECTURE.md` (RTP_96 reference; lever strategy).
4. `docs/DECISIONS.md` (change log).
5. `engine/features.js` (`CAL` — most tuning happens here).
6. `engine/config.js` (`PAYTABLE_X`, `WGEN_WEIGHTS`).
7. `sim/run.js` (report shape).
8. `docs/03_MATH_RISK_REGISTER.md` (per-candidate safety checklist).

## 12. Files NOT to re-read unless specifically needed

- `docs/00_PRODUCT_VISION.md`, `docs/01_GAME_DESIGN_FROZEN.md` (frozen rules in §2).
- `docs/04_SIMULATION_PLAN.md` (only for final-run CI/convergence methodology).
- `engine/rng.js`, `grid.js`, `clusters.js`, `round.js` — complete & tested; tuning is
  data not logic, do not modify.
- `test/*` — run them; read only if one breaks.
- The conversation history.
