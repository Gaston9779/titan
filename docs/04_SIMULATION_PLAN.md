# 04 — SIMULATION PLAN

Staged Monte Carlo methodology for validating the model in `docs/02_MATH_SPEC.md`.
This document defines *what to run, how many, what to measure, and what "converged"
means*. It does not implement anything (Phase 2).

---

## 1. Principles

1. An observed RTP from a finite sample is an **estimate with a confidence interval**,
   never proof of correctness. We report the estimator, its standard error, and the CI
   method every time.
2. The **theoretical** RTP is what the model *is*; simulation *estimates* it. Where a
   sub-mechanic admits a closed-form or semi-analytic expectation (e.g. base-board
   single-cascade cluster EV), compute it and use it as an independent cross-check on
   the simulator.
3. Reproducibility first: every reported number carries `{engineVersion, configHash,
   profileId, masterSeed, roundCount, shardScheme}` so it can be regenerated exactly.
4. Parallelism must not change statistical semantics: rounds are i.i.d.; worker `k`
   consumes `split(master, k)` substreams; the union of results is identical to a
   single-thread run over the same round indices.
5. No tuning to make a short run "look right" (CLAUDE.md §2.7). A parameter change is
   justified by its documented role and validated at the sample size appropriate to
   the metric it targets (see §6).

---

## 2. Run stages

| Stage | Rounds | Purpose | Gate to pass |
|---|---|---|---|
| S0 dev sanity | 1e3–1e4 | smoke: no crashes, invariants hold, RoundResult well-formed | all §16 invariants pass; no impossible-state aborts |
| S1 shape | 1e5 | first look at hit freq, cascade depth, feature freq, gross RTP | RTP within ±3% of target; no feature at 0; no NaN/overflow; cascade depth tail sane |
| S2 balance | 1e6 | primary tuning loop; contribution breakdown; volatility metrics | RTP within ±1%; all R10 dead-feature bars met; contribution tags sum to RTP exactly |
| S3 tail | 1e7 | Shard/merge tails, Awakened frequency, P(win>1000x), profile comparison | RTP within ±0.5% (95% CI); P(cap) and cap-cost measured; profile table within tolerances (§7) |
| S4 certification-grade | 1e8–1e9 (per profile) | final RTP with tight CI; extreme tail P(win>5000x), P(cap); skew/kurtosis stability | RTP 95% CI half-width ≤ 0.10% absolute; tail probabilities stable across two independent seed families; uncapped diagnostic run agrees on tail |
| S5 regression | 1e6 fixed-seed golden | lock behaviour; every later change re-runs this and diffs | byte-identical RoundResult stream for unchanged config; documented diff for intended changes |

Progression is gated: you do not run S3 until S2 gates pass for the profile in
question. The 96% profile goes first and furthest; 92–95 follow once 96 is locked.

---

## 3. Required statistical outputs (every S2+ run)

### 3.1 Headline

- observed RTP (capped) = `Σ cappedWin / Σ totalBet`
- RTP 95% and 99% confidence intervals (§5)
- observed RTP (uncapped, diagnostic mode)
- cap cost = uncapped RTP − capped RTP
- hit frequency = `P(cappedWin > 0)`
- zero-win frequency = `P(cappedWin == 0)` (= 1 − hit freq)

Two partitions are reported, each summing to capped RTP exactly (`02_MATH_SPEC.md`
§ 14):

**Location partition** (where the pay happened):
- base-game contribution = every pay in the **paid spin** (all why-tags), target ~68–72%
- bonus contribution = every pay in **free spins**; split `BONUS_BASE` (7×7) vs
  `BONUS_AWAKENED` (8×8)

**Why partition** (what produced the pay), across the whole round:
- `BASE_CLUSTER` (depth-1, no feature) and `CASCADE` (depth ≥ 2, no feature)
- per power: `BLADE` / `HAMMER` (base pay of feature-driven cascades); `SHIELD`
  (locked-Shard persistence increment only)
- `SHARD_MULT` (non-locked Shard multiplier increment)
- residual / invisible-adjustment sum (R24) — must be < 0.1% RTP

"Base-game" (a location term) and "base cluster" (a why-tag) are distinct — do not
conflate. Cascade contribution and Forge-Power contribution come from the why
partition and may span both locations.

### 3.3 Frequencies

- Bonus trigger frequency (rounds per bonus), by trigger tier (3 / 4 / 5+ Cores)
- Forge Power frequency (per paid round, per paying round, per bonus spin)
- Shard spawn frequency (per spin, per cascade step)
- P(reach Awakened | bonus); spins-to-Awakened distribution
- retrigger frequency; `E[total FS | bonus]`

### 3.4 Distributions (histograms + summary stats)

- cascade-depth distribution (paid spin; bonus spin)
- merge-depth distribution (`mergesByLevel`; `maxShardLevel` per round)
- Forge-Powers-per-sequence distribution
- bonus payout distribution; `E[bonus payout | bonus]`, median, P90, P99, max
- per-round win distribution: mean, median, variance, std dev, skewness, kurtosis
- maximum observed win; capped-win frequency = `P(capped)`

### 3.5 Empirical exceedance probabilities (with CI)

`P(win > x·bet)` for x ∈ {1, 5, 10, 50, 100, 500, 1000, 5000} and
`P(win reaches 10,000x cap)`. Report count, point estimate, and Wilson/Jeffreys
interval; flag any where the expected count < 100 as "insufficient sample — needs
Stage S4 or importance sampling".

### 3.6 Additional diagnostics

- empirical branching factor per cascade depth (R1): `b(d)`; require `b(d) < 0.6 ∀d`
- RTP contribution vs `maxCascadeDepth` bucket (R6): require concave/bounded; report
  fraction of RTP from depth ≥ 8 (target < ~8%)
- `shardsDestroyedByHammer`, `POWER_NO_TARGET` count, `SHARD_ROUND_CAP_HIT` count,
  `CASCADE_CAP_HIT` count, `BONUS_RETRIGGER_HARD_CAP` hits (all should be ~0 or small;
  non-trivial counts are findings)
- parameter-sensitivity report (R11): perturb each profile lever ±10%, tabulate delta
  on every contribution tag and on hit/bonus frequency
- per-feature acceptance bar check (R10)

---

## 4. Convergence criteria

### 4.1 RTP

Let `X_i` = capped win of round `i` in bet units, `i.i.d.`, `n` rounds.
Estimator `R̂ = (1/n) Σ X_i` (since `bet = 1`). Sample variance `s² = (1/(n−1)) Σ
(X_i − R̂)²`. Standard error `SE = s / √n`. 95% CI = `R̂ ± 1.96·SE` (n large, CLT
applies for the mean despite heavy tails — but see §4.3).

**Convergence gate (S4):** 95% CI half-width `≤ 0.0010` (0.10% absolute RTP), AND the
estimate from two disjoint independent seed families (e.g. even vs odd `roundIndex`,
or two master seeds) agree within `2·SE`.

### 4.2 Sample size guidance

Slot per-round win variance is dominated by the tail. Expect `s²` in the range ~20–200
(bet²) for a high-vol 96% game (to be measured at S2). For `s² = 100`, CI half-width
0.001 needs `n ≈ (1.96²·100)/(0.001²) ≈ 3.8e8`. Hence S4 at 1e8–1e9 per profile. If
measured `s²` is higher, `n` scales linearly with `s²`; the plan adjusts `n` upward,
never relaxes the gate.

### 4.3 Heavy-tail caution

Because the capped distribution has a point mass at 10,000x, the mean's CLT is valid
(finite support ⇒ finite variance) but convergence is slow and the sample skew/kurtosis
themselves converge slowly. Therefore:

- report skewness and kurtosis with a **stability check**: recompute on 10 disjoint
  sub-samples; report the spread. Do not quote a single kurtosis number without its
  sub-sample range.
- for tail probabilities where expected count < ~1000 at S4, use **stratified /
  importance sampling** in a *separate* diagnostic run (never the certified headline):
  e.g. condition on bonus triggered, or on `maxShardLevel ≥ 5`, estimate the
  conditional tail, and re-weight by the (separately, precisely measured) conditioning
  probability. Document the estimator and its variance.

### 4.4 Cross-checks (independent of the main simulator)

- **Analytic base EV:** closed-form expected pay of the *first* cascade on a fresh
  6×6 board (no features, no shards) via inclusion–exclusion / direct enumeration of
  cluster configurations by symbol, or a dedicated brute-force micro-sim at 1e8
  first-boards only. Must match the simulator's depth-1 `BASE_CLUSTER` contribution
  (restricted to depth 1, no shard) within CI.
- **Feature EV isolation:** run the engine with each feature independently disabled
  (Blade off, Hammer off, Shield off, Shards off, Bonus off) and check that the RTP
  deltas are consistent with the reported contribution tags (they will not be exactly
  additive due to interactions — the discrepancy is the "interaction term" and must be
  small and explainable, R11).
- **Determinism:** S5 golden run byte-diff.

---

## 5. Confidence-interval methodology

| Quantity | Method |
|---|---|
| RTP (mean) | Normal CI on the mean via CLT: `R̂ ± z·s/√n`; report z=1.96 and z=2.576 |
| Frequencies / exceedance probs | Wilson score interval (default) and Jeffreys as a cross-check; exact Clopper–Pearson when expected count < 30 |
| Contribution fractions | delta method on the ratio `contrib_tag / totalWin`, or bootstrap (10⁴ resamples) if the delta method is shaky |
| Skewness / kurtosis | point estimate + 10-way sub-sample spread (§4.3); optional bootstrap |
| Bonus `E[payout | bonus]` | mean CI on the conditional sample; report conditional `n` |
| P(cap) | Wilson; if count < 30 at S4, escalate to importance sampling (§4.3) |

Every CI in a report states: method, z or level, `n`, and observed count where
applicable.

---

## 6. Which metric needs which stage

| Metric | Reliable from |
|---|---|
| gross RTP ±1% | S2 (1e6) |
| gross RTP ±0.1% | S4 (1e8–1e9) |
| hit frequency | S1 (1e5) |
| bonus frequency | S2–S3 (need ≥ ~5000 bonuses ⇒ ~1e6 rounds) |
| cascade-depth distribution | S2 |
| Forge Power / Shard spawn frequency | S2 |
| P(win > 100x) | S3 (1e7) |
| P(win > 1000x) | S3–S4 (need ≥ ~1000 events) |
| P(win > 5000x), P(cap) | S4 (1e8–1e9) or importance sampling |
| skew / kurtosis stability | S4 |
| Awakened frequency, bonus payout tail | S3–S4 (need ≥ ~2000 Awakened bonuses) |
| profile-comparison table | S3 per profile, confirmed S4 |

A metric quoted below its stage is labelled "provisional — insufficient sample".

---

## 7. Profile-comparison acceptance (S3+, all 5 profiles)

For each profile, tabulate vs the RTP_96 reference and require (tolerances TUNABLE,
initial proposal):

| Metric | Tolerance vs RTP_96 |
|---|---|
| hit frequency | within ±2 percentage points |
| bonus frequency | within ±15% relative |
| base vs bonus RTP split | within ±4 percentage points |
| P(win > 100x) | within ±20% relative |
| P(cap) | same order of magnitude (within ×3) |
| skewness | within ±15% relative (sub-sample-stable) |
| Awakened frequency | within ±20% relative |

If a profile violates a tolerance, the lever choice is wrong (R17) — revisit
`05_MATH_PROFILE_ARCHITECTURE.md`, do not ship the profile.

---

## 8. Run configuration & artifacts

Every run produces:

- `run.json`: full config, profile, engine version + git hash, seeds, round count,
  wall time, host arch, throughput
- `stats.json`: every metric in §3 with CIs
- `histograms/`: cascade depth, merge level, powers/seq, win distribution (log-binned),
  bonus payout
- `diagnostics.json`: R1/R6/R9/R24 checks, backstop-hit counts, sensitivity table
- `golden/` (S5 only): first N RoundResult records, hashed

Reports are diffed run-to-run; any metric moving beyond its CI between two runs of the
*same* config is a determinism or environment bug (R14/R15/R18).

---

## 9. Parallel execution contract

- Input: `masterSeed`, `[startIndex, endIndex)`, worker count `P`.
- Worker `p` processes round indices `i ≡ p (mod P)` (or contiguous blocks — either,
  fixed per run), each round using `rng = derive(masterSeed, i)`.
- Counters-only accumulation (R20) uses numerically stable running moments (Welford for
  mean/variance; higher moments via the corrected online formulas) and integer counts.
- Merge step: sum integer counts; combine moments with the parallel/Chan formula.
  Combined result must equal a single-thread run bit-for-bit for counts and within
  fixed-point tolerance for moments (document the tolerance; target exact for
  mean/variance via integer micro-unit accumulation of `Σx` and `Σx²`).
- `Σx` and `Σx²` are accumulated as big integers (or 128-bit) to keep the mean and
  variance **exact**; skew/kurtosis (needing `Σx³`, `Σx⁴`) may use 128-bit or
  documented float with the sub-sample stability check.

---

## 10. When is the math "validated"?

All of:

1. S4 complete for all 5 profiles; each RTP within its target with 95% CI half-width
   ≤ 0.10% absolute, and the target value inside the CI.
2. Contribution tags sum to RTP exactly; every feature meets its R10 acceptance bar;
   interaction terms (R11 cross-check) small and explained.
3. No open CRITICAL or HIGH risk in `03_MATH_RISK_REGISTER.md` without an evidenced
   mitigation confirmed by a run.
4. Profile-comparison table within all §7 tolerances.
5. Cap cost ≤ ~0.5% (or a product decision recorded in DECISIONS.md if the frozen
   mechanics genuinely cannot do better at 10,000x — R9).
6. S5 golden regression locked; determinism verified across at least two architectures.
7. Independent analytic base-EV cross-check agrees.

Only then does a human record an approval line in `docs/DECISIONS.md` and the math is
considered validated for that version.
