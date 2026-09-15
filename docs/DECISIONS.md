# DECISIONS — FORGE: THE LAST TITAN

Append-only log. Newest entries at the bottom of each section. Every change to the
mathematical model, every resolution of an open question, and every approval gate is
recorded here with date, author, rationale, and (for math changes) the simulation
evidence.

Format:

```
### <YYYY-MM-DD> — <short title>
- Type: DESIGN-CLARIFICATION | MATH-INITIAL | MATH-CHANGE | FROZEN-RULE-CHANGE | APPROVAL-GATE | OPEN-QUESTION-RESOLVED
- Author: <name / role>
- Context:
- Decision:
- Rationale:
- Evidence (sim run ids, stats): <n/a for Phase 1 spec>
- Affected parameters / docs:
- Requires human approval: YES/NO — status
```

---

## 1. Phase 1 — specification decisions

### 2026-09-02 — Phase 1 specification created
- Type: MATH-INITIAL
- Author: Lead game-math architect (Claude, Sonnet 5) — pending human review
- Context: Frozen game concept for FORGE: THE LAST TITAN handed over for mathematical
  architecture. No code to be written in Phase 1.
- Decision: Created `CLAUDE.md` and `docs/00`–`docs/05` plus this log. Produced an
  initial, internally-coherent V1 math specification with every numeric value tagged
  `TUNABLE_V1`.
- Rationale: Establish an auditable baseline before simulation.
- Evidence: none — this is the pre-simulation specification. No value here is proven.
- Affected parameters / docs: all of `docs/`.
- Requires human approval: YES — this specification must be approved before Phase 2
  (simulator implementation) begins. Status: **PENDING**.

### 2026-09-02 — Round-level max-win cap
- Type: DESIGN-CLARIFICATION
- Author: Lead math architect
- Context: F9 requires deterministic max-win enforcement but does not fix the scope.
- Decision: The 10,000× cap applies at **round level** (paid spin + all triggered free
  spins). On reaching it the round halts immediately with an exact truncation to the
  cap; remaining free spins are forfeited. Simulation additionally runs an uncapped
  diagnostic mode to measure "cap cost".
- Rationale: Round-level is the natural RTP accounting unit; exact truncation keeps the
  capped distribution well-defined; the diagnostic mode prevents the cap from hiding a
  pathological tail.
- Evidence: n/a (Phase 1).
- Affected parameters / docs: `02_MATH_SPEC.md` §13, `03` R9/R16, `04` §3.1/§10.
- Requires human approval: NO (consistent with frozen text) — but flagged for reviewer
  awareness.

### 2026-09-02 — Shard multiplier combination is additive-in-value, not multiplicative
- Type: MATH-INITIAL
- Author: Lead math architect
- Context: F6 freezes the merge ladder shape but not how multiple Shards touching one
  cluster combine.
- Decision: A cluster's Shard multiplier = `max(1, Σ shardValue of adjacent Shards)`
  (sum), capped per cluster/step/round. Spawned Shards are always level 1 (2×); higher
  values come only from merges.
- Rationale: Multiplicative combination is doubly exponential with the geometric merge
  ladder (R3) and cannot be tuned independently or bounded below the cap without
  heavy-handed clamps. Additive-in-value keeps Shard EV sub-exponential in the number
  of adjacent Shards while preserving the "merge to grow" fantasy.
- Evidence: n/a (Phase 1) — to be validated at S3 (Shard contribution stability,
  `maxShardLevel` histogram).
- Affected parameters / docs: `02` §9–§10, `03` R3/R6.
- Requires human approval: NO (combination rule is not frozen).

### 2026-09-02 — Heat and Pressure are separate systems
- Type: MATH-INITIAL
- Author: Lead math architect
- Context: The brief describes Heat (enables Forge Powers) and Pressure (COLD…CRITICAL
  during a cascade) somewhat overlappingly.
- Decision: Heat = an accumulating within-spin resource (from cluster wins) that
  triggers Forge Powers at a threshold. Pressure = a state derived solely from cascade
  depth that modulates three bounded probabilities (Shard spawn, a small Heat-gain
  multiplier, merge column-pull). Pressure is never a win multiplier.
- Rationale: Keeping them orthogonal makes each independently tunable and prevents a
  feedback path where an EV quantity feeds Pressure which feeds EV (R6).
- Evidence: n/a (Phase 1).
- Affected parameters / docs: `02` §5–§6, `03` R2/R6.
- Requires human approval: NO (both mechanisms explicitly not frozen).

### 2026-09-02 — Independent weighted per-cell symbol generation (no reel strips) for V1
- Type: MATH-INITIAL
- Author: Lead math architect
- Context: Cluster-pays cascade game needs a symbol source model.
- Decision: Each generated paying cell is an independent draw from a categorical
  distribution `W_GEN` (optionally per-column later). No reel strips in V1.
- Rationale: Analytic tractability, no strip-index RNG-order bugs, natural fit for
  cascade refills. Trade-off (loss of near-miss strip shaping) accepted; revisit only
  if base variance needs shaping.
- Evidence: n/a (Phase 1).
- Affected parameters / docs: `02` §3.
- Requires human approval: NO.

### 2026-09-02 — Forge Cores are sticky within a sequence, counted at sequence end
- Type: DESIGN-CLARIFICATION
- Author: Lead math architect
- Context: F7 freezes the 3/4/5+ tiers and V1 spin counts but not the Core-landing
  model under cascades.
- Decision: Cores are inert, do not form clusters, stick through cascades of the
  current spin (fall with gravity, never removed by wins), and are counted once at
  sequence end. Cleared at sequence end.
- Rationale: Gives a coherent accumulation story, adds mild negative feedback on
  cascade length, keeps bonus evaluation a single well-defined check.
- Evidence: n/a — bonus frequency response to `W_CORE` to be measured (R23).
- Affected parameters / docs: `02` §3.3/§11, `03` R23.
- Requires human approval: NO.

### 2026-09-02 — Four-lever MathProfile architecture
- Type: MATH-INITIAL
- Author: Lead math architect
- Context: Need 92–96 profiles without a global prize coefficient and with preserved
  volatility identity.
- Decision: Profiles differ only in `W_CORE_BASE`, `PAYTABLE_MID_SCALE` (buckets
  B7–B15), `MOLTEN_EXPAND_THRESHOLD`, `BONUS_W_CORE`. All other parameters shared and
  frozen across profiles. Each profile independently certified.
- Rationale: These four have the most localised RTP effect and the smallest impact on
  hit frequency and tail shape; documented in `05`.
- Evidence: n/a (Phase 1) — lever sensitivities and profile-comparison table to be
  produced at S3 per profile.
- Affected parameters / docs: `05` (whole), `02` §17.
- Requires human approval: NO for the architecture; each profile's final numbers
  require an approval gate after S4.

---

### 2026-09-02 — Phase 1 internal audit: specification corrections applied
- Type: MATH-CHANGE (precision/consistency; no intended change to EV behaviour except
  item A which conforms to the authoritative frozen doc)
- Author: Lead math architect (audit pass)
- Context: Adversarial audit of `02_MATH_SPEC.md` for deterministic simulatability.
  Blockers found where an engineer would have had to invent math. Frozen rules
  unchanged; `01_GAME_DESIGN_FROZEN.md` treated as authoritative.
- Decisions (all in `02_MATH_SPEC.md` unless noted):
  A. **Wild bridging (CRITICAL).** Rewrote § 4.6 into a normative cluster-detection
     algorithm where wild blobs *bridge and extend* same-symbol regions and each
     contested wild blob is resolved to exactly one symbol by a documented
     marginal-pay rule with total tie-breaks. Previous § 4.6 greedily attached a wild
     to a single group and could partition a genuinely connected region — contradicting
     frozen F1 ("maximal connected"). This is a conformance fix, not a redesign.
  B. **Gravity with locked cells (CRITICAL).** § 4.2 step 9 now specifies the exact
     per-column, per-segment compaction algorithm (locked cells are immovable dividers;
     no fall-through; sub-divider empties still refill).
  C. **Heat formula (HIGH).** § 5.2 replaced the ambiguous "mostly wilds" clause with
     `effClassW` = per-cell average class weight, and made `heatMult(pressureTier)`
     explicit in the formula. All factors specified as exact rationals.
  D. **Power no-target / RNG order (HIGH).** § 7.1 + cascade-loop step 8: legal-target
     set `L` computed before any draw; a single `POWER_SELECT` draw over weights
     restricted to `L`; `L = ∅` ⇒ `POWER_NO_TARGET` with no draw. Removed the
     re-roll path. `powersThisStep` reset point specified.
  E. **Wild tie-break unification (HIGH).** § 4.2 step 1 no longer states a separate
     "highest resulting pay" rule; § 4.6 is the single source.
  F. **Bonus post-spin ordering (HIGH).** § 15.1 rewritten with explicit ordering:
     all molten charges (forced powers + retrigger + CRITICAL + big-win) summed before
     the expansion-threshold test; retrigger FS added after; expansion effective next
     spin.
  G. **Uncapped diagnostic mode (HIGH).** § 13.3: defined as a *paired* second
     evaluation of the same round substream with cap disabled — never inferred from a
     capped RoundResult (it consumes more RNG past the cap).
  H. **drawWeighted integer-only (HIGH).** § 15.4: selection uses `nextInt(total)`,
     never `nextFloat`; probability thresholds compared as integer `num/den`.
  I. **Attribution (MEDIUM).** § 14: a PayEvent carries a `contrib: [{tag, amount}]`
     list (not one tag); Shield never sets the responsible-edit pointer; shard
     increment split pro-rata by `shardValue` into `SHIELD`/`SHARD_MULT`; cap clips
     applied pro-rata. `RoundResult` schema (§ 15.5) updated (`clusters[].contrib`,
     `powers[]` list).
  J. **Coordinate system (MEDIUM).** New § 0: `(col,row)` with row 0 = top, row H-1 =
     bottom; row-major and fill/refill draw orders fixed; expansion cell mapping made
     normative in § 12.3 (existing symbols `row += 1`; new cells = top row + right
     column).
  K. **Clamp ordering (MEDIUM).** § 9.6: cluster→step→round shard clamps then the
     max-win check, in that fixed order.
  L. **Forced-power accounting (MEDIUM).** § 11.2: forced A4/A5 powers consume no Heat,
     count toward `POWERS_PER_SEQUENCE_CAP` but **not** the per-step cap (so A5 spin 1
     gets forced Shield + forced Hammer + up to one natural power in the same depth-1
     step), set `responsibleEdit` like natural powers (Hammer yes, Shield no), add
     `+1` molten charge each, and are applied at depth-1 step 7 before the natural
     check. Skipped if the sequence cap is already reached or no legal target.
  M. **State scope (MEDIUM).** § 4.1 split into spin-start vs round-start state;
     `roundWinSoFar`, `shardContribRound`, `capped` are round-scoped.
  N. **Parameter classification (MEDIUM).** New § 19: every number classified
     FROZEN / TUNABLE_V1 / DERIVED. `04` § 3.2 reworked into location vs why partitions
     ("base game" ≠ "base cluster"). `05` reconciles `W_CORE_BASE` naming with
     `W_CORE_V1` and marks `PAYTABLE_MID_SCALE` as introduced there.
  O. Invariant 3 (§ 16) corrected to `1 ≤ shardLevel` (0 never valid).
- Rationale: each item was a point where deterministic simulation was impossible or
  under-specified from the docs alone.
- Evidence: n/a (Phase 1). Items A, C, F, I change measurable outputs and must be
  covered by property tests + measured at S2.
- Requires human approval: NO. Item A conforms to a frozen rule rather than changing
  one. Flagged for reviewer confirmation nonetheless.

### 2026-09-02 — Core feature activation calibration (Phase 2, base game)
- Type: MATH-CHANGE (activation/frequency layer only — NOT total-RTP tuning; Bonus not
  implemented)
- Author: Lead math architect (calibration pass)
- Context: The un-tuned V1 activation parameters made Heat/Pressure/Powers/Shards
  functionally near-dead. Diagnostics over 100k rounds: Heat ≈ 2.0 per winning
  cascade / 2.5 per paid round (p99 ≈ 10) vs a `HEAT_THRESHOLD` of 12 → Forge Powers
  1/990 rounds, Shield 3/100k, merges 1/515 rounds and never above shard level 2,
  max observed win 4.65× over 100k. Root cause = threshold scaling (plus shards too
  rarely co-occurring for merges), not Heat-generation shape or an interaction bug.
- Decision: change 3 existing `TUNABLE_V1` parameters (in `engine/features.js` `CAL`):

  | Parameter | OLD → NEW | Reason |
  |---|---|---|
  | `HEAT_THRESHOLD` (§5.3, centi) | `1200` → `650` | 12.0 Heat was unreachable by normal cascades; 6.5 gives Forge Power ≈ 1 per 20 paid rounds (target 15–40), `NO_TARGET` = 0, powers still capped at 4/sequence. |
  | `PRESSURE.COLD.p_shardSpawn` (§6.2) | `0.020` → `0.040` | Shards rarely co-occurred → merges dead. Most spawns are at COLD; raises 2-shard co-occurrence. |
  | `PRESSURE.WARM.p_shardSpawn` (§6.2) | `0.035` → `0.055` | Same; brings meaningful merges to ≈ 1 per 57 paid rounds (target 25–75), level-3 shards ≈ 3/100k. |
  | `PRESSURE.HOT.p_shardSpawn` (§6.2) | `0.055` → `0.070` | Keeps the spawn ladder strictly increasing after the COLD/WARM bump (behaviourally ~neutral vs leaving it at 0.055). |

  No other parameter changed. Frozen rules untouched. `HEAT_CLASS_*`,
  `HEAT_DEPTH_FACTOR`, `PRESSURE_DEPTH`, `POWER_WEIGHTS`, all caps, paytable and
  `W_GEN` unchanged. `configHash` now includes the `CAL` block.
- Evidence (seed 20260902): tests 50/50; deterministic replay PASS (2 seeds, ±tags);
  100k + 1,000,000-round runs. 1M: base-game RTP 0.15771 (bonus not executed),
  hit 33.4%, avg cascade depth 0.42, max win 18× (0 capped rounds), Forge Power
  1/67 rounds (Blade 0.0082/rd, Hammer 0.0072/rd, Shield 5.2e-4/rd), shard spawn
  0.123/rd (1 in 10 rounds), merge 1/171 rounds, level-3 shards 26/1M, max shard
  level 3, Pressure reach/round WARM 6.9% HOT 1.3% OVERHEAT 0.27% CRITICAL 0.063%.
  No runaway (max depth «40 cap), no feedback signature, 17.3k rounds/s.
  Contribution RTP: base 0.1232, cascade 0.0272, Blade 0.00076, Hammer 0.00236,
  Shield 1.4e-5, Shards 0.0042.
- Requires human approval: NO (all three are `TUNABLE_V1`). Recorded for review.

### 2026-09-02 — Awaken the Titan Bonus implemented (Phase 2)
- Type: MATH-CHANGE (implementation of already-approved §11–§14; NOT tuning)
- Author: Lead math architect
- Context: Full-game engine — base spin now triggers and runs the bonus.
- Decision: Implemented §11 trigger tiers (3/4/5+ → 8/10/12 FS, A4/A5 advantages),
  §12 free-spin lifecycle on 7×7, molten-meter progression, exact `moltenMeter ≥ 18`
  expansion boundary → 8×8 Awakened mode with its §12.2 overrides, §12.4 retrigger,
  §13 round-level max-win halt spanning the bonus, §14 location partition
  (`BASE` / `BONUS_BASE` / `BONUS_AWAKENED`) alongside the why partition. All bonus
  parameters are the spec values, collected in `CAL.BONUS` (now part of `configHash`).
- Parameter values: all per `02_MATH_SPEC.md` §11–§12. `heatCarry` and the Awakened
  Heat threshold are DERIVED (`HEAT_THRESHOLD×0.5` = 325; `×0.85` = 552). One value is
  **not** from the spec: `FS_PLAYED_HARD_CAP = 800` — a pure compute backstop
  (alongside the spec's `BONUS_RETRIGGER_HARD_CAP = 30`), not a game rule; never hit in
  1M rounds.
- Evidence (seed 20260902): tests 68/68; deterministic replay PASS (incl. full bonus
  rounds + tag stream); 10k/100k/1M runs. 1M: full-game RTP 0.16324 (base 0.15771,
  bonus 0.00553, Awakened 8×8 0.00000 — 0 expansions in ~2639 bonuses), bonus 1/379,
  avg bonus payout 2.10×, avg FS 8.24, retrigger 2.4%/bonus, hit 33.6%, max win 18×
  (0 capped), avg/max cascade depth 0.42/9. No infinite loops, no state leakage.
- Finding (for the tuning phase, NOT acted on): with un-tuned V1 values the bonus is
  functionally alive but EV-negligible — molten expansion never fires (charge sources
  too rare vs threshold 18) so Awakened mode is unreachable in practice, and average
  bonus payout (~2.1×) barely exceeds a base paid spin. Expected; this is the first
  honest full-game measurement.
- Requires human approval: NO (implementation of approved spec).

### 2026-09-02 — RTP_96 playable calibration, tuning pass 1 (Phase 2)
- Type: MATH-CHANGE (full-game RTP tuning toward the RTP_96 profile; TUNABLE_V1 only)
- Author: Lead game-math architect (tuning pass)
- Context: First honest full-game measurement had RTP ≈ 0.163 (base 0.158, bonus
  0.0055, Awakened unreachable). Objective: bring RTP_96 to ~96% (accept 95.5–96.5 at
  1M) with a high-volatility identity, no frozen-rule changes, no global multiplier as
  the sole lever.
- Decision: changed the following `TUNABLE_V1` values (`engine/config.js`,
  `engine/features.js` `CAL`). Frozen rules untouched (grid, cluster/cascade rules,
  symbol taxonomy, 3 Powers, Pressure semantics, merge ladder shape, 8/10/12 FS counts,
  7×7→8×8 progression, 10,000× cap).

  | Parameter | OLD → NEW | Reason |
  |---|---|---|
  | `PAYTABLE_V1` (all cells) | ×`5.87 · ramp` where ramp (B5..B49) = `[0.85,0.88,0.9,0.94,1.0,1.12,1.35,1.9,2.7,3.8,5.2,7.0,9.0]` | Bulk buckets ×~5.0–5.9 lift base RTP to ~0.72; upper buckets ramped (not a flat multiplier) to build the high-vol tail and give 7×7/8×8 mega-clusters real weight. Monotonicity in size & rank preserved (tested). |
  | `WGEN_WEIGHTS` | `[220,200,175,150,90,70,45,28,7]` → `[210,192,170,148,95,76,50,33,9]` | Mild LOW-dominance flatten drops hit frequency 33.7%→30.1% (target 25–30, high edge) without collapsing cascade depth; CORE 7→9 for bonus frequency. |
  | `CAL.HEAT_THRESHOLD` | `650` → `500` | Forge-Power / molten-charge health at the new payout scale (power freq 0.017→0.049/round). |
  | `CAL.PRESSURE.pMille` COLD/WARM/HOT/OVERHEAT/CRITICAL | `40/55/70/80/110` → `46/62/82/100/125` | Raise shard spawn/merge co-occurrence for tail identity; ladder strictly increasing; CRITICAL 0.125 < §17 ceiling 0.14. |
  | `CAL.BONUS.BONUS_W_CORE` | `5` → `20` | Bonus was EV-negligible; drives retrigger frequency (retrigger events also feed the molten meter). Retrigger feedback verified **bounded**: identical 1M RTP and bounded max-FS at hard-cap 400 vs 800; branching factor < 1. |
  | `CAL.BONUS.MOLTEN_EXPAND_THRESHOLD` | `18` → `5` | 18 was unreachable at realistic charge rates → Awakened never occurred. 5 makes 8×8 reachable in ~30% of bonuses. |
  | `CAL.BONUS.MOLTEN_BIGWIN_MICRO` | `20e6` (20×) → `6e6` (6×) | Restore the big-win molten-charge source at the new per-free-spin EV. |
  | `CAL.BONUS.AWAKENED_BONUS_SPINS` | `3` → `10` | Make reaching 8×8 a materially rewarded state; gives Awakened measurable EV (0.18 RTP). |
  | `CAL.BONUS.RETRIGGER` | `{3:4,4:6,5:9}` → `{3:4,4:5,5:6}` | Smaller per-event FS adds keep the retrigger branching factor < 1 (stability) while retrigger *events* stay frequent for molten feed. |
  | `CAL.BONUS.BONUS_RETRIGGER_HARD_CAP` | `30` → `400` | Pure compute backstop (spec: “expected never hit”). At 30 it would clip ~5–9% of bonuses of the tuned config; at 400 it is non-shaping (RTP identical at 400/800). |
  | `CAL.BONUS.SHARD_SPAWN_MUL_8x8` | `[3,2]` (×1.5) → `[5,2]` (×2.5) | Awakened multiplier engine — raise shard density in 8×8 for the extreme tail. |
  | `CAL.BONUS.SHARD_SPAWN_CAP_MILLE_8x8` | `160` → `240` | Matches the raised 8×8 scaling; still a hard ceiling. |
  | `CAL.BONUS.SHARD_BOARD_CAP_8x8` | `7` → `8` | Allow slightly deeper merge chains in Awakened (structural bound retained). |

- Evidence (seed 20260902, 1,000,000 rounds; searches at 20k–300k rejected en route,
  finalist confirmed at 250k–500k on 4 seeds then 1M):
  full-game RTP **0.9575** (base 0.7223, bonus 0.2352 = 7×7 0.0549 + Awakened 8×8
  0.1804). Hit 30.06%, zero-win 69.94%. Bonus 1/195, avg bonus 45.8×, avg FS played
  28.1, retriggers 3.88/bonus, 8×8 reached in 29.6% of bonuses (1,520 in 1M),
  Awakened RTP 0.180. Avg/max cascade depth 0.375/9. Forge Power 0.0494/round, shard
  spawn 0.209/round, merge 0.0189/round, max shard level 4. Max observed win 1012×;
  P(>10×)=7.3e-3, P(>50×)=1.34e-3, P(>100×)=7.9e-4, P(>500×)=1.6e-5, P(>1000×)=1e-6.
  Capped wins 0/1M (10,000× cap not hit). No runaway: cascade hard cap (40) never
  approached, retrigger/FS hard caps never hit, RTP invariant to the retrigger
  backstop value. why-partition: BASE_CLUSTER 0.7255 · CASCADE 0.1251 · BLADE 0.0119 ·
  HAMMER 0.0484 · SHIELD 4.5e-4 · SHARD_MULT 0.0462. Tests 68/68 PASS (3 value-
  dependent bonus/power-cap fixtures updated to derive from `CAL`; no invariant
  weakened). Deterministic replay PASS (seeds 20260902, 777777; ±tag stream).
- Known residuals for pass 2 (not blockers): base contribution 72.2pp and 8×8
  incidence ~30% sit at the edge of the exploratory targets; bonus split (7×7 only
  0.055) is thin — bonus EV is carried by Awakened; shard merges rarely exceed level 3
  (level-6/64× ladder still unexercised — a tail-mechanic health item, R3/R5); 1M
  estimate has a wide CI (σ≈6.75) driven by the Awakened tail — S4 needed for
  certification per `docs/04`.
- Requires human approval: NO (all changed values are `TUNABLE_V1`). Recorded for
  review; RTP_96 S4 validation + gate G1 still outstanding.

### 2026-09-02 — Presentation trace hook + PixiJS prototype client (Phase 2)
- Type: MATH-CHANGE (instrumentation only — NO change to any outcome) + tooling
- Author: Lead game-math architect
- Context: Building a playable browser prototype. `RoundResult` alone is not
  presentation-friendly (no per-step board states), so an ordered event trace is
  needed to animate a round.
- Decision:
  - `engine/round.js` / `engine/features.js`: added an **opt-in** trace recorder,
    active only when `resolveRound(cfg, seed, i, { trace: true })`. It records an
    ordered list of board snapshots + semantic events (fill, cascade, heat, remove,
    power, gravity, refill, merge, spinEnd, bonusStart/molten/expansion/retrigger/
    bonusEnd, maxWin, roundEnd) onto `result.trace`. It consumes **no RNG**, makes
    **no decision**, and does nothing unless the flag is set. `settleMerges` gained an
    optional `ctx.onMerge` callback (null unless tracing).
  - New `client/` (Vite + PixiJS 8) presents one deterministic `RoundResult` by
    animating its trace. `client/src/timeline.js` is a pure adapter (trace → ordered
    presentation steps + nominal durations; no game logic). The client imports the
    engine read-only via `@engine` alias and never determines an outcome.
- Evidence: `node --test` 68/68 PASS (3 value-dependent bonus fixtures updated to
  derive from `CAL` in the RTP_96 entry above; no invariant weakened). `sim/verify.js`
  deterministic PASS (seeds 20260902, 314159) — trace flag off path byte-identical.
  In-client check: `resolveRound` with/without `trace` yields identical `cappedWin` +
  `contributions`; `verifyDeterministic` true for the normal / bonus / awakened preset
  rounds. `sim/run.js` 200k RTP 0.9573 (unchanged). `vite build` succeeds.
- Requires human approval: NO (no behavioural change; instrumentation + presentation).

### 2026-09-03 — Client visual polish pass (Phase 2, presentation only)
- Type: PRESENTATION-ONLY (no engine / RNG / paytable / probability / trace change)
- Author: Presentation pass (Claude, Sonnet 5)
- Context: The PixiJS prototype rendered the approved assets but read as static: the
  WILD was lost among normal symbols, the FORGE CORE was not prominent, gravity/refill
  snapped instead of falling, and the background crop under-emphasised the Titan.
- Decision (all under `client/`; `engine/` untouched):
  - New `client/src/render/presentation.js` — single home for every optical knob:
    symbol scale hierarchy (`OPTICAL`: CORE 1.20 > WILD 1.14 > SHARD 1.10 > HIGH 1.05
    > LOW 1.00, ×`PER_SYMBOL_NUDGE`), WILD/CORE aura+pulse config, `FALL`/`CADENCE`
    timing, `CORE_ANTICIPATION`. `assets.js` `SYMBOL_TUNE`/`SHARD_TUNE` removed (was a
    second source of truth); `SYMBOL_FIT` 0.84→0.82 (base = LOW tier).
  - WILD/CORE: cached radial-glow texture (one canvas decode, tinted Sprite, `add`
    blend — no filters) behind the cell frame; shared idle-pulse ticker breathes aura
    + artwork; landing plays an overshoot + rune shimmer (WILD) / ring pulse + ember
    burst (CORE). Optical scale bump so neither can be mistaken for a HIGH symbol.
  - Gravity/refill rewritten: `easeInQuad` acceleration, distance-aware duration
    (130–300 ms), per-column + per-row stagger, squash/rebound landing. Refill spawns
    above the board and falls as a staggered per-column stack. Instant/skip still snap
    to the engine's final board (verified: 0 empty cells at 6×6/7×7/8×8).
  - Multi-CORE anticipation: presentation-only tension dressing on the cores panel +
    board CORE pulse at 2 cores, "FORGE CORES ALIGNED" beat at 3+ (trigger math
    unchanged — driven off the engine trace's core count).
  - `#bg` crop reworked (`background-position: 50% 24%` + aspect-ratio media queries,
    edge vignette) so the Titan stays framed left / board centre / forge city right at
    1920×1080, 1600×900, 1440×900, 1366×768. `background-size: cover` kept (never
    stretched).
  - Control cluster: full-width 3-col grid → centred flex group hugging the board;
    SPIN unchanged and still dominant.
  - Root `package.json`: added `dev` / `build` / `preview` scripts delegating to
    `client` (`npm --prefix client run …`). Existing scripts untouched.
- Evidence: `node --test` 68/68 PASS (unchanged — no engine file touched).
  `sim/verify.js` 20260902 ×2000 deterministic PASS. `npm run build` succeeds.
  In-client: `verifyDeterministic` true for normal/cascade/bonus/awakened presets;
  final board states match engine `cappedWin` (5.76 / 22.82 / 134.41×) with no gaps.
- Requires human approval: NO (presentation only; no payout-affecting change).

### 2026-09-03 — Client visual polish pass 2 (Phase 2, presentation only)
- Type: PRESENTATION-ONLY (no engine / RNG / paytable / probability / trace change)
- Author: Presentation pass (Claude, Sonnet 5)
- Context: Second polish round on the same prototype. Cascades still "snapped"
  (board A → holes → board B), the horizontal Heat track was weak, the Forge Core /
  Shards HUD panels showed a redundant giant "0", and a looping background video was
  supplied to replace the still.
- Decision (all under `client/`; `engine/` untouched):
  - Background: `#bg` now hosts `<video autoplay muted loop playsinline>` over
    `background_base_loop.mp4`, with the approved PNG as `poster` + `#bg` background
    (no black flash); `object-fit: cover`, Titan-left / city-right composition kept.
    Decorative only — never read by game code.
  - `render/board.js` rebuilt on a PERSISTENT-SPRITE model: one sprite per occupied
    cell, created once and MOVED through highlight → dissolve → gravity → refill →
    land. `renderInstant` (spin start / SKIP) is the only hard reconcile; mid-cascade
    uses `_reconcile` (keeps untouched survivors, animates out what vanished, pops in
    Hammer wilds). Removal nulls `this.sym[i]` immediately then dissolves the visual,
    so gravity never sees a ghost survivor and the fall overlaps the shrink — no
    static holey board. Gravity/refill: `easeInQuad`, distance-aware duration, column
    stagger, squash/rebound landing. Data-driven → identical at 6×6/7×7/8×8.
  - Win highlight moved to a layer BEHIND the symbols (soft additive halo + rim
    stroke); the winning artwork is never covered.
  - ONE `VerticalMeter` (DOM): `meter_vertical_frame/fill.png`, fill masked in the
    glass channel, rises bottom→top by a JS-set `clip-path: inset(N% 0 0 0)`
    (continuous, no step art). HEAT in base, MOLTEN CHARGE in bonus — same component,
    switched by phase. Old horizontal Heat + Molten meters removed.
  - HUD: Forge Core panel shows only its 3 lit ring slots (giant "0" removed) with
    2-core / 3+-core anticipation dressing; Shards panel shows the actual shard art
    in its 6 baked slots (giant "0" removed).
  - WILD aura recoloured molten/orange (was cool blue); FORGE CORE aura made hotter
    /larger/brighter than WILD with landing flash + particle burst (`presentation.js`).
- Evidence: `node --test` 68/68 PASS. `sim/verify.js` 20260902 ×2500 deterministic
  PASS (hash cf92b12…). `npm run build` succeeds. In-client (instant + preset replay):
  persistent-sprite count == engine non-empty cells at 6×6/7×7/8×8 (36/49/64), wins
  5.76 / 22.82 / 134.41× unchanged, zero leaked sprites/glows, `verifyDeterministic`
  true. Video `readyState 4`, poster fallback verified.
- Requires human approval: NO (presentation only; no payout-affecting change).

### 2026-09-03 — Client visual integration & animation pass 3 (Phase 2, presentation only)
- Type: PRESENTATION-ONLY (no engine / RNG / paytable / probability / trace change)
- Author: Presentation pass (Claude, Sonnet 5)
- Context: Final integration pass. New assets supplied: `background_base_loop.mp4`
  (already a seamless ping-pong loop) and `fx/{win_ring,win_burst,energy_slash,
  energy_arc,rune_burst}.png`. Outstanding issues: empty board flashed on load,
  background washed-out with the Titan buried, logo over the Titan, leftover
  "BASE GAME" bar, cascade still read as snapping, Core socket indicators off-centre.
- Decision (all under `client/`; `engine/` untouched):
  - Background sharpness/composition: removed the heavy `#bg-fx` vignette
    (0.62→0.34 edge, boundary pushed out) and the left-side `#bg::after` darkening
    (Titan was sitting in a dark falloff — perceived as "out of focus"; no CSS/Pixi
    blur was ever present). `#bg` / `#bg-video` `object-position` biased left (22%);
    the whole `#machine` pushed right via `--machine-shift` (`clamp(0,11vw,190px)`,
    subtracted in `main.js` layout()) so the chained Titan (head + torso + cracks +
    chains) is fully exposed on the left, forge city still readable right.
  - Logo: moved out of the top bar to a small fixed brand mark bottom-left
    (`clamp(48px,7vw,82px)` tall), clear of meter / board / controls.
  - Removed the `#phase-strip` "BASE GAME" bar entirely (element + CSS); `#app`
    still carries `data-phase` for feature dimming.
  - Empty-board fix: `main.js` no longer renders an EMPTY grid. New
    `App.showIdleBoard()` runs the engine for round 0, takes the `fill` trace
    event's board and `renderInstant`s it (instant, no RNG touched) BEFORE the
    loader is dismissed — first visible frame is the real deterministic layout.
  - New win FX (`render/fx.js`): pooled `win_ring` (added to glowLayer, BEHIND the
    symbol — expands + fades) on highlight, pooled `win_burst` (fx layer) on
    removal. Textures loaded once via the manifest (`assets.js` `fx:` block) and
    reused from a sprite pool — never re-decoded per win. `energy_slash/arc` and
    `rune_burst` are loaded but reserved (not used on ordinary cluster wins).
    Removed the old opaque `cell_highlight` overlay + Graphics rim from the win
    path. Layer order: frame → win_ring/glow → symbol → burst.
  - Cascade removal shrink shortened (130ms) and `wait` after it cut to 70ms so
    gravity overlaps it — no perceptible holey-board pause.
  - Core socket indicators re-seated to the real recess centres of
    `forge_cores_panel.png` (29% / 50% / 71% x, 48% y); shard slots aligned to the
    6 hex recesses of `shards_panel.png`.
- Evidence: `node --test` 68/68 PASS. `sim/verify.js` 20260902 ×3000 deterministic
  PASS (hash 08ffbda…, unchanged). `npm run build` succeeds. In-client: fresh load
  shows 36 populated cells / 0 empty; instant preset replays 36/49/64 sprites ==
  engine non-empty, wins 5.76 / 22.82 / 134.41× unchanged, zero leaked FX/sprites
  across interrupted+resumed rounds; video autoplay/muted/loop/playsinline/no-controls
  + poster confirmed, `readyState 4`. Engine file mtimes unchanged (Sep 2).
- Requires human approval: NO (presentation only; no payout-affecting change).

### 2026-09-03 — Client visual fixes pass 4 (Phase 2, presentation only)
- Type: PRESENTATION-ONLY (no engine / RNG / paytable / probability / trace change)
- Author: Presentation pass (Claude, Sonnet 5)
- Context: Pass-3 changes to the background crop and the Core-tracker dot were not
  visibly effective (the `object-position` X change is inert under 16:9 `cover`, so
  the crop looked unchanged; the dot y-offset was ~6% too high). The prompt also
  referenced a "modular board asset pack" (frame/corner pieces) — NOT present in the
  repo: `client/public/assets/board/` contains only the 4 supplied cell tiles
  (`cell_base`, `cell_highlight`, `cell_molten`, `cell_locked`).
- Decision (all under `client/`; `engine/` untouched):
  - Background: new `positionBackgroundVideo()` in `main.js` computes the framing
    NUMERICALLY from the viewport aspect and the 1608×1288 source — `object-position`
    50% ~4% (frames the whole Titan, drops the plaza) + `transform: scale(1.10)`
    `transform-origin: 10% 24%` (enlarge toward the Titan, push city/foreground out).
    Values exposed as CSS vars (`--bg-obj-pos/--bg-scale/--bg-origin`). `image-rendering:auto`,
    no blur, mild ≤1.1× zoom. Verified: Titan head+torso+chains dominant on the left.
  - Core tracker: explicit per-slot `CORE_SLOTS` constant in `hud.js` (fractions of
    the panel, measured on a 5%-ruler overlay of `forge_cores_panel.png`): slot
    centres x = 27.5% / 49.5% / 71.0%, y = 53.5%; each orb `left/top` set from that
    constant, orb ⌀ 12.5% so it nests inside the ~15% socket. Shard slots nudged to
    the hex centres (x ≈ 16.5/30/43/57/70/83.5%, y ≈ 52%).
  - Board: the 4 supplied cell tiles ARE the modular pack — now all used: `cell_base`
    per occupied + empty cell (empty at 0.55α, no longer a dim 0.32 "generic grid"),
    `cell_molten` in Awakened, `cell_locked` for shields, and `cell_highlight` swapped
    in behind the symbol as the winning-cell BACKGROUND state (`setCellWinning()` —
    frame child sits before the sprite → never covers the art; reverts for survivors).
    Added a procedural outer forge frame (`Board._drawForgeFrame`, Pixi Graphics —
    no frame-piece rasters exist): recessed bezel + molten inner edge + corner
    brackets, re-tinted BASE/AWAKENED, sized into a reserved 2.4%-of-stage inset so
    the grid shrinks to fit it.
  - Robustness: `tween` now snaps to its final value if `clock.instant` flips true
    mid-flight (SKIP during turbo); `renderInstant` sweeps orphan sprites left by an
    interrupted cascade; a full `_clearFx()` runs on every hard reconcile.
- Evidence: `node --test` 68/68 PASS. `sim/verify.js` 20260902 ×3000 deterministic
  PASS (hash 08ffbda…, unchanged). `npm run build` succeeds. In-client (fresh
  server): initial board 36 populated / 0 empty; instant replays normal/cascade/
  bonus/awakened = 36/49/64 sprites == engine non-empty, wins 5.76 / 22.82 /
  134.41× unchanged, 0 orphans, 0 leaked FX after turbo-interrupt; `cell_highlight`
  frame swap confirmed BEHIND the symbol and reverting; Core orbs resolve to the
  measured socket centres. Engine file mtimes unchanged (Sep 2).
- Requires human approval: NO (presentation only; no payout-affecting change).

### 2026-09-03 — Client spin/drop animation + shard/control fixes, pass 5 (Phase 2, presentation only)
- Type: PRESENTATION-ONLY (no engine / RNG / paytable / probability / trace change)
- Author: Presentation pass (Claude, Sonnet 5)
- Context: (1) the shard tracker glyphs were unreadably small; (2) the first SPIN
  looked "consumed" — `spinStart` was a static `renderInstant` and (with sprite
  identity preservation) an identical/similar board showed no motion; (3) a NEW
  SPIN swapped textures instead of dropping symbols in; (4) the control bar was
  centred on the screen, not the (deliberately right-shifted) board.
- Decision (all under `client/`; `engine/` untouched):
  - SHARED DROP ANIMATOR: `Board._dropColumns(board, cells, opts)` — symbols spawn
    ABOVE the board as a per-column rigid strip and fall vertically (`easeInQuad`,
    distance-aware 150–340 ms, column + row stagger, bottom-first so the column
    stacks up, landing squash + rebound). Used by BOTH:
      A. `Board.dropInBoard(board)` — clears the current board (quick staggered
         fall-out) then drops the whole grid in. `spinStart` now calls this
         instead of `renderInstant`, so EVERY spin (first one included) is a
         visible physical drop. Balance/win still update from the engine result.
      B. `Board.refill(afterBoard, newCells)` — cascade case, drops only the new
         cells. `gravity()` still slides the persistent survivors down.
    `presentation.js` `FALL` retuned; adds `newSpinSpawnRows`.
  - FRAME / SYMBOL layers separated: the cell socket (cell_base / cell_molten /
    cell_highlight) is now a STATIC per-cell sprite in `frameLayer`; the symbol
    container holds only the moving art. Layer order forge→sockets→win_ring→
    symbols→burst, so `win_ring` (glowLayer) and the `cell_highlight` swap both
    sit BEHIND the symbol and never cover it. `setCellWinning(frame, on)` swaps
    the socket texture; reverts for survivors / on removal / on `renderInstant`.
  - SHARDS: panel `width: 174%` (bleeds right past the narrow rail into the spare
    screen space) → sockets ~46 px (were ~22 px); shard art `background-size:
    contain` fills ~80% of each socket; slot centres 16.5/29.9/43.3/56.7/70.1/
    83.5% match the art. No transform on the resting slot (a paused CSS anim was
    freezing the size). Rails widened to `clamp(184px,13vw,232px)`, `--machine-shift`
    reduced to `clamp(0,8vw,150px)`.
  - CONTROL ROW: one flex row `.ctl-row` — BET-/BET/BET+ · SPIN · TURBO · AUTOPLAY
    · SKIP · SOUND · FULLSCREEN, `gap:16px`, common centreline, no overlaps, SPIN
    the largest. Centred on the BOARD: `layout()` measures `#board-frame` and sets
    `--controls-shift` (CSS fallback `--machine-shift/2`). Verified board mid ==
    control mid == 1035 px at 1920×1080.
  - Robustness: `_reconcile` + `renderInstant` sweep orphan sprites; `dropInBoard`
    `_clearDetached` first; `_build` destroys the old layer tree on grid change.
- Evidence: `node --test` 68/68 PASS. `sim/verify.js` 20260902 ×3000 deterministic
  PASS (hash 08ffbda…, unchanged). `npm run build` succeeds. In-client: first
  SPIN advances `session.round` 0→1 and drops round 0 in (balance 1000→999);
  mid-drop all 36 sprites confirmed above the board falling as strips; instant
  replays normal/cascade/bonus/awakened = 36/49/64 sprites == engine non-empty,
  wins 5.76 / 22.82 / 134.41× unchanged; 0 orphans / 0 leaked layers across
  base→bonus→awakened→base; win FX layer order confirmed forge<sockets<win_ring<
  symbols<burst. Engine file mtimes unchanged (Sep 2).
- Requires human approval: NO (presentation only; no payout-affecting change).

### 2026-09-04 — HUD layout: ControlsBar + vertical Shards tracker + Heat animation, pass 6 (Phase 2, presentation only)
- Type: PRESENTATION-ONLY (no engine / RNG / paytable / probability / trace change)
- Author: Presentation pass (Claude, Sonnet 5)
- Context: the bottom controls were an uneven scatter, the shards tracker was a
  cramped horizontal strip in the rail with tiny glyphs, and the vertical Heat
  meter was static.
- Decision (all under `client/`; `engine/` untouched; existing assets only):
  - CONTROLSBAR: `#controls > .controls-bar > .ctl-row`. `.controls-bar` is a
    CSS forged-metal container (the same gradient/bevel language as `.w-item` /
    `#board-frame` — no new art), shrink-wrapped around the group with equal
    padding. Order BET-/BET/BET+ · SPIN · TURBO · AUTOPLAY · SKIP · SOUND ·
    FULLSCREEN; measured gaps 28 / 18 / 14·4 (small-in-bet, larger-before-SPIN,
    medium-after, consistent rest); one centreline (±4 px). `#controls` is
    `translateX(--controls-shift)` where `layout()` measures `#board-frame` and
    sets it to `boardMidX − screenMidX` → the bar is centred on the BOARD, not
    the viewport (verified 0 px offset at 1920 and 1366).
  - SHARDS → vertical `#right-hud` (board-anchored, `position: fixed`): `layout()`
    sets `left = board.right + 16`, `top = board.top`, `height = board.height`;
    the ladder's `--st-h = board.height * 0.6`. The horizontal `shards_panel.png`
    is `rotate(90deg)`-ed so its 6 octagon sockets read as a ladder 2× (top) →
    64× (bottom); each `.shard-img` counter-rotates so the baked multiplier is
    upright. Sockets ~66 px (were ~22–46). States: inactive = grayscale/dim,
    active `.on` = full + molten glow, `.peak` = brightest + slow pulse, newly
    reached `.just` = scale-punch + glow burst. `hud.setShards(values)` lights
    the ladder rungs present on the board and tracks the round peak — progression
    logic unchanged. `right-hud` never overlaps the board (verified).
  - HEAT / MOLTEN CHARGE meter (one component, same assets): idle
    `moltenScroll` fill texture + `moltenLum` flicker + always-on rising
    `heatBubble` sparks + bright crest at the fill line. Level zones from the
    REAL engine % (`low<30 / mid<58 / high<82 / full`) drive glow, pulse rate,
    bubble count, frame glow, and a `vmeterBreath` at full. `.pumped` one-shot
    burst (frame glow + crest flash + orb punch) fires from `_renderMeter()` when
    the % jumps > 3. The frame's gem/diamond (`.vmeter-orb` / `.vmeter-head`) and
    the pressure orb (`data-heat`) also scale their glow with the level. Fill %
    itself is untouched; the `clip-path` transition gained a slight-overshoot
    cubic-bezier.
  - Right rail removed from the machine flex (one rail now); `layout()` reworked
    to derive the ControlsBar + right-HUD purely from the measured board box (no
    viewport magic numbers), synchronously (no rAF — `getBoundingClientRect`
    forces the reflow).
- Evidence: `node --test` 68/68 PASS. `sim/verify.js` 20260902 ×3000 deterministic
  PASS (unchanged). `npm run build` succeeds. In-client: ControlsBar centred on
  board (Δ0 px @1920 & @1366), 0 control overlaps, gaps 28/18/14; Shards ladder
  vertical, 2×→64×, sockets ~66 px, tracker.left = board.right+21, 0 board
  overlap, on-screen, vertically centred on the board (Δ0); Heat `data-level`
  low→mid→high→full at the engine %, `.pumped` fires on a jump, MOLTEN CHARGE
  reuses the same node; first SPIN + cascade + bonus + awakened all match engine
  (36/49/64), wins 5.76/22.82/134.41× unchanged, 0 orphans. Engine mtimes Sep 2.
- Requires human approval: NO (presentation only; no payout-affecting change).

### 2026-09-04 — Game-feel audit: split spin-drop vs cascade fall-duration windows, pass 7 (Phase 2, presentation only)
- Type: PRESENTATION-ONLY (no engine / RNG / paytable / probability / trace change)
- Author: Presentation pass (Claude, Sonnet 5)
- Context: a spec review of spin-drop / win-destruction / cascade-gravity / refill
  game feel (persistent sprites falling from above, no teleport/snap, WIN → BREAK
  → FALL → REFILL → LAND with no visible empty-cell pause, WILD/CORE idle vs.
  landing emphasis) found the mechanism from pass 5 (`Board._dropColumns`,
  `gravity`, `removeCells`, `showClusters`, `_specialEntrance`, `_idle`) already
  implements all of it — persistent sprite reuse, physical fall, column/row
  stagger, ease-in fall + squash/rebound landing, win highlight behind symbols,
  removal punch→fade→embers before gravity, WILD/CORE breathing + stronger
  entrance. The only gap: `FALL` used one shared 150–340 ms range for both the
  new-spin drop-in and cascade gravity/refill, wider on both ends than intended.
- Decision (`client/src/render/presentation.js`, `client/src/render/board.js`;
  `engine/` untouched):
  - `FALL.minMs`/`FALL.maxMs` replaced with two named windows: `FALL.spin =
    {minMs:180,maxMs:320}` (new-spin drop-in) and `FALL.cascade =
    {minMs:150,maxMs:280}` (gravity slide + refill drop-in).
  - `fallDuration(rows, range = FALL.cascade)` now takes the window explicitly.
  - `Board._dropColumns(..., { durRange })`: `dropInBoard` passes `FALL.spin`;
    `refill` keeps the `FALL.cascade` default. `Board.gravity` passes
    `FALL.cascade` explicitly to `fallDuration`.
  - No change to stagger (`columnStaggerMs`/`rowStaggerMs`), landing squash/
    rebound, removal timing (~175 ms punch→fade, already inside the 120–220 ms
    target), win-highlight layering, or WILD/CORE aura config — all already
    matched spec.
- Evidence: `node --test` 68/68 PASS. `sim/verify.js` seed 424242 ×5000
  deterministic PASS (hash 083ecd27…, repeat match). `npm run build` succeeds.
  No file under `engine/`, `sim/`, or `test/` touched (client-only diff).
- Requires human approval: NO (presentation only; no payout-affecting change).

### 2026-09-05 — Feature system pass: HAMMER placement bug fix, natural WILD scaffold (disabled), Buy Bonus, Shard/Core presentation
- Type: MIXED — one MATH BUG FIX (HAMMER), one MATH FEATURE built but shipped
  inert (natural WILD), one NEW FEATURE with its own price math (Buy Bonus,
  entry-method-only — reuses the existing Bonus implementation verbatim), and
  presentation-only changes (Shard/WILD/Core feedback).
- Author: Feature pass (Claude, Sonnet 5)
- Authorization: instructed directly and explicitly by the human owner in-session
  (this task's brief named exactly these math areas as intentionally in scope).
  This entry is that instruction's required `DECISIONS.md` record per CLAUDE.md
  §2.9. See `docs/03_MATH_RISK_REGISTER.md` R25 for the frozen-rule tension this
  creates with `01_GAME_DESIGN_FROZEN.md` §8 (WILD "never drawn from the symbol
  pool") and why natural WILD is NOT enabled.
- **HAMMER bug fix** (`engine/features.js` `applyHammer`, `engine/round.js`):
  the 3×3-window scan used a strict `cnt > best`, so any tie among equally-good
  windows always resolved to the first one scanned (top-left-most) — measured
  22% of all Hammer activations landing on the exact same `[0,0]` window pre-fix
  (20k-round sample, seed 20260904). Fixed by collecting every window tied for
  the max LOW-count and choosing among them with the seeded engine RNG
  (`rng.nextInt`, tagged `POWER_HAMMER_WINDOW`) — quality of the pick is
  unchanged (still the true max), only the tie-break is randomized and stays
  deterministic-per-seed. Post-fix: top window ≈14% of activations (down from
  22%), all 4 board corners represented near-symmetrically (100k-round sample).
  `applyHammer` now takes `rng` as a 5th argument; both call sites in
  `round.js` updated. This changes the RNG stream from the first Hammer tie
  onward for any affected round (intentional, seed-preserving) — replay hashes
  changed accordingly (expected, not a regression).
- **Natural WILD (scaffold, NOT enabled):** `engine/grid.js` `generateCell` now
  handles a `"WILD"` draw; `engine/config.js` adds `"WILD"` to `WGEN_SYMBOLS`/
  `WGEN_WEIGHTS` via `WGEN_WILD_WEIGHT` (currently `0`). Calibration evidence
  (150–200k-round samples, seed 20260905): no-WILD baseline RTP ≈ 97.0–97.2%
  (already at/above the requested 95–97% band); WILD weight 1 (of 984,
  ≈0.10%/cell) → 98.35%; weight 2 → 99.12%; weight 4 → 105.0%; weight 10 →
  118.7%; weight 25 → 172.7%. WILD in the draw pool is strictly RTP-additive
  (it only ever helps or is neutral to a cluster), so no positive integer
  weight lands inside 95–97% without first freeing up RTP room elsewhere —
  explicitly out of scope for this pass. **STOPPED per instruction — shipped
  at weight 0** (mechanism implemented + unit-tested, inert). See R25 for the
  three remedies (lower baseline first / accept a new band / keep WILD
  Hammer-only and fix the frozen doc to match).
- **HAMMER→WILD presentation** (`client/src/render/board.js`): a Hammer-made
  WILD's entrance (`_specialEntrance`, called via `_reconcile(board, boost)`)
  is scaled up (overshoot, aura spike, ember count × boost) vs. a normal
  cascade pop-in, so it visibly reads as Hammer-made. No engine change.
- **Buy Bonus** (`engine/round.js`, `client/src/{sim,app,main}.js`,
  `client/index.html`, `client/src/styles.css`): price is always
  `bet × 50` (`app.buyBonusCost()`), never a hardcoded currency amount.
  `resolveRound(config, seed, roundIndex, { buyBonus: true })` skips the paid
  spin and hands the EXISTING bonus while-loop a synthetic paid-spin result at
  the minimum natural trigger tier (`coreBonusThreshold` = 3 Cores) — same
  7×7/8×8 Awakened engine, Free-Spin logic, Molten Charge, Forge Powers,
  payout logic; only the entry method differs (no second Bonus
  implementation — verified structurally identical to a natural 3-Core
  trigger in `test/feature_pass.test.js`). Client: a compact `w-item`-styled
  "BUY BONUS · 50×" control in the top wallet bar (no dedicated asset
  exists — see note below), opening a confirmation modal (cost, current bet,
  BUY/CANCEL; purchase never happens on the first click); confirming deducts
  exactly `bet × 50` and enters the bonus through the same `bonusStart`
  presentation as a natural trigger (converges into ONE shared entry).
- **Buy Bonus RTP measurement** (`sim/audit_buybonus.js`, 1,000,000 direct
  bonus purchases, seed 20260905, calling `resolveRound(..., {buyBonus:true})`
  directly — no base spins simulated): avg bonus return **42.68×**, median
  11.57×, P90 129.71×, P95 191.87×, P99 350.12×, P99.9 604.75×, max observed
  1507.44×, Awakened-8×8 frequency 27.82%. **Buy Bonus RTP at the instructed
  50× price = 85.35%** — outside the 95–97% target. Fair price for 96% RTP =
  **44.45×** (`avgBonusReturn / 0.96`). **STOPPED per instruction — Bonus math
  NOT retuned; price left at the instructed 50× pending an owner decision**
  (lower the price to ~44.45×, or accept a different Buy Bonus RTP target).
- **Normal-game re-validation after the Hammer fix** (`sim/audit_run.js`,
  1,000,000 rounds, seed 20260905, final shipped config — WILD weight 0):
  total RTP **95.18%** (base 72.46%, bonus 22.72%), hit rate 30.15%, bonus
  trigger 1-in-193 (0.518%), avg bonus win 43.84×, Shard occurrence 9.90%,
  Hammer-fired-WILD occurrence 1.65%, natural-WILD occurrence 0% (disabled),
  Awakened frequency 0.148%, max observed win 699.98×. Inside the 95–97% band.
- **Shard presentation** (`client/src/render/board.js`, `fx.js`): verified the
  math first (spawn at 2× on refill, tier-scaled probability, merge ladder
  2×→64× with level 7/128× blocked, additive-in-value contribution to a
  cluster's pay, reset every new spin) — all confirmed correct, unchanged.
  Added: a stronger landing impact + molten ember flash when a Shard spawns
  (`_dropColumns`); a new `shardLink()` FX (`fx.js`) drawing a travelling spark
  + beam from each contributing Shard to the winning cluster's label
  (`showClusters`); the win label now sequences `CLUSTER WIN {base}× → SHARD
  {v1}× [+ {v2}× ...] = {mult}× → FINAL {payout}×`, reading the real per-
  cluster `baseX`/`shards`/`mult`/`payX` from the trace — truthfully additive,
  never implying multiplication. Shard merge presentation (`Board.merge`) was
  already within the 250–450ms target and already updates the ladder
  immediately after; left unchanged.
- **Forge Core / Bonus-trigger presentation** (`client/src/{app,styles}.css`):
  fixed a latent bug where the "FORGE CORES ALIGNED" bonus-trigger banner used
  the same one-shot flag as the emphasis pulse, so once Cores hit 3 mid-
  cascade (the common path) the flag latched and the real spin-end call —
  the only one allowed to show the banner — always found it already set and
  silently skipped it. Banner now has its own once-per-spin flag; the
  emphasis pulse re-fires as the count climbs 3→4→5. Added CSS-only
  `[data-cores="4"]`/`[data-cores="5"]` pulse states (no new artwork — the
  panel physically has only 3 sockets) so 4/5 Cores read as visibly MORE than
  3, and the trigger banner appends `+1`/`+2 — BONUS ENHANCED` using the real
  engine meaning (extra Free Spins, forced Shield/Hammer advantage, Molten
  head start) — no invented benefits. Trigger math (`coreBonusThreshold = 3`)
  untouched.
- **No dedicated asset for Buy Bonus**: `client/public/assets/controls/` has
  no "buy"/"bonus" icon. Implemented the minimum styled control reusing the
  existing `.w-item` forged-metal look; a dedicated icon (matching `spin.png`/
  `bet.png`'s art direction) would read better and is recommended.
- Evidence: `node --test` 79/79 PASS (68 original + 11 new in
  `test/feature_pass.test.js`, covering natural-WILD generation + determinism,
  HAMMER seeded-determinism + non-fixed-pattern, Shard additive-math
  invariant, Buy Bonus canonical-engine equivalence + determinism, and
  wager-independence-by-construction). `sim/verify.js` seed 424242 ×5000
  deterministic PASS (hash changed from `083ecd27…` to `a017a6dc…` — expected,
  the Hammer fix and WGEN config change the RNG-consumption stream/configHash;
  internal a==b consistency holds). `npm run build` succeeds.
- Requires human approval: YES, for two items only, both explicitly STOPPED
  pending that approval per the owner's own instruction:
  1. Whether/how to enable natural WILD (R25: lower baseline RTP room first,
     accept a new target band, or keep WILD Hammer-only and correct the
     frozen doc's clarification to match).
  2. Buy Bonus price: keep 50× (RTP 85.35%, below target) or move toward the
     mathematically fair 96%-RTP price of ~44.45×.
  Everything else (HAMMER fix, Buy Bonus mechanism/entry, Shard/Core/WILD
  presentation) is shipped as of this entry.

### 2026-09-05 (pass 3) — Natural WILD enabled, HAMMER round-2 fix, paytable micro-compensation, Buy Bonus 50x -> 45x
- Type: MATH CHANGE (WGEN weights, `BONUS_W_CORE` re-encoding, paytable scale,
  HAMMER WILD-cell selection, Buy Bonus price) — fully authorized in-session by
  the human owner with explicit numeric targets; this entry is that
  instruction's `DECISIONS.md` record per CLAUDE.md §2.9.
- Author: Feature-tuning pass (Claude, Sonnet 5)
- **Natural WILD ENABLED** (`engine/config.js`): `WGEN_SCALE = 10` re-expresses
  every existing WGEN weight at 10x (identical relative probabilities — pure
  re-encoding for resolution) so `WGEN_WILD_WEIGHT = 3` (of a 9833 total) can
  land inside the requested 0.5–1.5% "spins with a natural WILD" band.
  Calibration (300–400k rounds, seed 20260905): weight 2 -> 0.77%/RTP 95.83%;
  weight 3 -> 1.16%/RTP 96.22%; weight 4 -> 1.54%/RTP 96.68%. Weight 3 chosen.
  `CAL.BONUS.BONUS_W_CORE` (`engine/features.js`) scaled 20 -> 200 in lockstep
  with `WGEN_SCALE` — verified this changes NO probability (96.95% RTP at
  WGEN_WILD_WEIGHT=0 post-rescale vs. the pre-rescale baseline, within noise);
  Core spawn chance (base and bonus) is mathematically unchanged. `WGEN_SCALE`
  and `BONUS_W_CORE` must be kept in lockstep if either is ever retuned again.
- **RTP compensation** (`engine/config.js` `BASE_PAYTABLE_COMP = 0.9925`): a
  single uniform multiplier applied to every bucket of every symbol's paytable
  row in `toMicroTable()` — i.e. every one of L1–H4's 13 payout buckets cut by
  exactly 0.75%. No paytable value's rank/monotonicity changed; cluster
  thresholds, `bucketIndex()`, Bonus/feature probabilities untouched.
- **HAMMER round-2 fix** (`engine/features.js` `applyHammer`): the pass-1 fix
  (window tie-break) left the WILD cells THEMSELVES on a fixed scan-order
  sub-pattern (always the first `hammerWilds` destroyed cells top-to-bottom,
  left-to-right within whichever window was picked) — invisible-window but
  visible-WILD-shape bug. Fixed with a seeded Fisher-Yates-prefix sample
  without replacement over the destroyed cells (`rng.nextInt`, tagged
  `POWER_HAMMER_WILD_CELLS`); `detail.wildCells` (exact indices) added to the
  trace for analysis/tests (instrumentation only, no outcome effect). 10,000-
  activation audit (`sim/audit_hammer.js`, seed 20260905): 2301 distinct full
  (window + local WILD shape) patterns, top pattern 0.56% (was effectively a
  single dominant shape pre-fix), top window 12.28% (4 board corners together
  ~45% — a genuine structural artifact of corner 3x3 windows having fewer
  overlapping competitor windows, not a code defect: the corner bias persists
  under a provably-unbiased `nextInt` tie-break because corners more often
  reach the true local max uncontested). 79.58% of Hammer-made WILDs land
  orthogonally adjacent to a real symbol (i.e. could substitute into a
  cluster) — not systematically wasted.
- **Buy Bonus price**: 50x -> 45x (`client/src/app.js` `buyBonusCost()`,
  `client/index.html` display strings). Same canonical Bonus engine, same
  entry mechanism (`opts.buyBonus`) as pass 2 — untouched here.
- Evidence:
  - Normal game (`sim/audit_run.js`, 1,000,000 rounds, seed 20260905, final
    config): total RTP **95.10%** (base 72.42%, bonus 22.69%) — inside
    95.0–96.0%, centered near the requested 95.5%. Hit rate 30.28% (was
    30.15%). Bonus trigger 1-in-192 / 0.522% (was 1-in-193 / 0.518%) — bonus
    frequency materially unchanged. Avg bonus win 43.47x (was 43.84x) —
    materially unchanged. Natural-WILD occurrence 1.166% (target band
    0.5–1.5%, hit). Hammer-WILD occurrence 1.654% (was 1.65%, unchanged).
    Shard occurrence 9.95% (was 9.90%, unchanged). Awakened frequency 0.147%
    (was 0.148%, unchanged). Max observed win 749.18x.
  - Buy Bonus @ 45x (`sim/audit_buybonus.js`, 1,000,000 direct purchases,
    seed 20260905): avg return 42.99x, median 11.56x, P90 130.77x, P95
    194.01x, P99 353.86x, P99.9 608.89x, max observed 1885.69x, Awakened
    frequency 27.86%. **Buy Bonus RTP @ 45x = 95.54%** — inside the 95–97%
    target (fair-96% price would be ~44.79x, i.e. 45x was already very close).
  - `node --test`: **81/81 PASS** (68 original + 13 in
    `test/feature_pass.test.js`; two pre-existing `applyHammer(...)` call
    sites in `test/features.test.js` updated to pass an `Rng` instance, now
    required — a real regression this pass caught and fixed, not a math
    change). `sim/verify.js` seed 424242 ×5000 deterministic PASS (hash
    changed from `a017a6dc…` to `31466519…` — expected, WGEN/paytable/Hammer
    all changed the RNG-consumption stream and payout values). `npm run
    build` succeeds.
- Requires human approval: NO further action needed — every explicit target
  in this instruction (WILD occurrence band, RTP band, Bonus-frequency
  invariance, Buy Bonus RTP band, deterministic replay) was hit without
  touching anything outside the authorized areas. R25 in
  `docs/03_MATH_RISK_REGISTER.md` is superseded by this entry (natural WILD
  is now enabled) but left in place as the historical record of why weight 0
  was shipped first.

## 2. Open questions blocking nothing (tracked)

- OQ1 — flat pay buckets vs interpolation (`02` §2.3 / §18).
- OQ2 — per-column `W_GEN` (`02` §3.4).
- OQ3 — `POWER_NO_TARGET` handling: waste vs Heat refund (`02` §7.1 / `03` R24).
- OQ4 — A5 advantage: continuous scaling with Core count vs step at 5/6/7+.
- OQ5 — whether `SHARD_MAX_LEVEL` may rise to 7 in Awakened only (`03` R3, frozen text
  says level > 64 not assumed safe → sim must decide).
- OQ6 — Core accumulation model vs bonus-frequency tunability; possible per-sequence
  cap on Core accumulation (`03` R23).

## 3. Open questions that DO block simulator implementation

*(To be filled by the human reviewer. The architect's current view: none of the above
block a first simulator pass; the items in `docs/` marked `[CLARIFICATION]` should be
confirmed or corrected by the owner, but sensible defaults are in place for all of
them.)*

---

## 4. Approval gates

| Gate | Description | Status |
|---|---|---|
| G0 | Phase 1 math specification approved; Phase 2 (simulator) may begin | **PENDING** |
| G1 | RTP_96 shared core validated at S4 | not started |
| G2 | Each of RTP_92..95 validated at S4 + profile-comparison table within tolerance | not started |
| G3 | All CRITICAL/HIGH risks in `03` closed with run evidence | not started |
| G4 | Max-win cap cost ≤ ~0.5% (or documented product decision) | not started |
| G5 | Determinism verified across ≥ 2 architectures; S5 golden locked | not started |
| G6 | Math considered validated for v1.0 (all of `04` §10) | not started |

No Phase 2 code is written until G0 has an explicit approval line here from the human
owner.
