# 05 — MATH PROFILE ARCHITECTURE

How FORGE supports RTP profiles **92 / 93 / 94 / 95 / 96** as explicit, independently
testable math configurations — without reducing to "multiply all prizes by a
coefficient" and while preserving the volatility identity and feature behaviour "where
reasonably possible" (product requirement).

RTP_96 is the primary balancing reference. The other profiles are derived from it by a
**small, documented lever set**, then independently validated.

---

## 1. What a MathProfile is

```
MathProfile {
  id: "RTP_92" | "RTP_93" | "RTP_94" | "RTP_95" | "RTP_96"
  targetRTP: 0.9200 | ... | 0.9600
  # --- the ONLY fields allowed to differ between profiles in V1 ---
  W_CORE_BASE                # = the per-profile value of 02_MATH_SPEC W_CORE_V1
                             #   (base-game Forge Core weight). Primary lever:
                             #   bonus trigger frequency.
  PAYTABLE_MID_SCALE         # scalar on mid buckets B7..B15 only (secondary lever).
                             #   New parameter, defined here; not in the §17 baseline
                             #   because the RTP_96 reference value is exactly 1.000.
  MOLTEN_EXPAND_THRESHOLD    # per-profile override of 02_MATH_SPEC
                             #   MOLTEN_EXPAND_THRESHOLD_V1 (tertiary: Awakened freq).
  BONUS_W_CORE               # per-profile override of 02_MATH_SPEC BONUS_W_CORE
                             #   (fine lever: retrigger frequency).
  # everything else is INHERITED from a shared BaseConfig and is identical
}
```

Naming: `W_CORE_BASE` here and `W_CORE_V1` / `W_CORE` in `02_MATH_SPEC.md` refer to the
**same knob** (base-game Core weight); this document sets its value per profile, the
math spec documents its role. `MOLTEN_EXPAND_THRESHOLD` and `BONUS_W_CORE` likewise
shadow the identically-named math-spec parameters. Only `PAYTABLE_MID_SCALE` is
introduced solely here (RTP_96 value 1.000, i.e. a no-op for the reference profile).

Everything not in that list — grid sizes, adjacency, min cluster, cascade rules, Heat
formula, Pressure tables, Power identities/weights, Shard spawn probabilities, merge
ladder, `SHARD_BOARD_CAP`, all caps, `HEAT_DEPTH_FACTOR`, bonus spin counts (frozen),
Awakened overrides, `MAX_WIN_X` — is **shared and identical across all five profiles**.

That shared core is what makes the five profiles "the same game".

---

## 2. Why these four levers

### 2.1 Design goal

Move ~4 percentage points of RTP (96 → 92) while keeping:
- hit frequency ≈ constant (players should not feel a "deader" 92 game),
- the extreme-tail shape (P(win>1000x), P(cap)) ≈ constant in *shape*,
- feature trigger cadence recognisably similar,
- the base/bonus split within a few points.

### 2.2 Lever roles (primary → fine)

| Lever | Moves primarily | Cross-effects | Why acceptable |
|---|---|---|---|
| `W_CORE_BASE` | **Bonus contribution** (≈ 28–32% of RTP at 96). Lower `W_CORE` → fewer bonuses → lower RTP. | Slightly lowers hit frequency (Cores don't pay, so fewer Cores ≈ marginally more paying area — actually a tiny *positive* hit-freq effect). Negligible effect on base-win tail. | Bonus frequency differing between RTP profiles is normal and expected in the industry; the bonus *itself* is unchanged, so its internal volatility identity is preserved. |
| `PAYTABLE_MID_SCALE` | **Base-game mid-size cluster RTP.** A scalar (e.g. 0.97–1.00) applied to buckets B7–B15 only. | Barely touches hit frequency (B5/B6 unscaled ⇒ the "did I win at all" boundary is identical). Does not touch the top buckets (B20+) ⇒ tail shape preserved. | Keeps small-win feel and big-win feel identical; only the "medium win" magnitude shifts. This is a genuine math change (per-symbol pay values), not a global multiplier. |
| `MOLTEN_EXPAND_THRESHOLD` | **Awakened-mode frequency** within the bonus (Awakened RTP-per-spin is ~1.5–2× base bonus spin). Raise threshold → fewer Awakened → lower RTP. | Changes `E[bonus payout]` and the bonus tail slightly; does not change base game at all. | Lets us tune the bonus's own richness without changing bonus frequency or base game. |
| `BONUS_W_CORE` | **Retrigger frequency** ⇒ `E[total FS | bonus]`. Fine adjustment (±0.1–0.3% RTP). | Minor effect on bonus payout tail. | Small, localised trim to land the target precisely after the three coarser levers. |

### 2.3 What we deliberately do NOT use as profile levers

- `HEAT_*`, `PRESSURE p_shardSpawn`, `HEAT_DEPTH_FACTOR`, `SHARD_BOARD_CAP`,
  `SHARD_MULT_*` caps, `POWER_WEIGHTS`, merge ladder, `MAX_WIN_X`.
- These have **wide cross-effects** (R11) and/or **define the volatility identity**.
  Changing them per profile would make the 92 game feel structurally different from
  the 96 game and multiply the validation surface. They stay frozen across profiles.
- `PAYTABLE` top buckets (B20+): unchanged so the "dream win" is identical in every
  profile.
- Global prize coefficient: explicitly rejected by the brief and by good practice
  (it shifts the whole distribution including the cap interaction).

---

## 3. Initial lever values (TUNABLE_V1 — to be fitted by simulation)

Starting hypotheses, anchored on RTP_96 = the §17 baseline of `02_MATH_SPEC.md`
(`W_CORE_BASE = 7`, `PAYTABLE_MID_SCALE = 1.000`, `MOLTEN_EXPAND_THRESHOLD = 18`,
`BONUS_W_CORE = 5`):

| Profile | `W_CORE_BASE` | `PAYTABLE_MID_SCALE` | `MOLTEN_EXPAND_THRESHOLD` | `BONUS_W_CORE` | intended split of the −Δ |
|---|---|---|---|---|---|
| RTP_96 | 7.00 | 1.000 | 18 | 5.0 | reference |
| RTP_95 | 6.45 | 0.992 | 19 | 4.8 | ~0.6% from bonus freq, ~0.3% from mid pays, ~0.1% Awakened |
| RTP_94 | 5.95 | 0.984 | 20 | 4.6 | ~1.2 / 0.6 / 0.2 |
| RTP_93 | 5.50 | 0.975 | 21 | 4.4 | ~1.8 / 0.9 / 0.3 |
| RTP_92 | 5.05 | 0.966 | 22 | 4.2 | ~2.4 / 1.2 / 0.4 |

Notes:
- The split targets above are **illustrative allocations**, not measured. Simulation
  (S2/S3 per profile) fits the four numbers to land `targetRTP` within the S4 gate
  while keeping the §7 profile-comparison tolerances of `04_SIMULATION_PLAN.md`.
- Roughly ⅔ of each RTP step comes from bonus frequency (`W_CORE`), ¼ from mid pays,
  the rest from Awakened frequency and retrigger.
- `W_CORE` also participates in the RTP_96 tuning itself (§11.3 of the math spec: it
  may need to rise to ~9–12 to hit 1/180–1/220 bonus frequency). If the RTP_96 value
  lands higher, **all** profile `W_CORE_BASE` values scale accordingly; the *ratios*
  and the method are what this table fixes.

---

## 4. Fitting procedure (per profile, Phase 2)

1. Lock the shared core (validated at RTP_96).
2. For the target profile, start from the §3 hypothesis.
3. Run S2 (1e6). Read RTP and the §7 comparison metrics.
4. Adjust levers using the **sensitivity table** (R11 diagnostic): each lever's
   measured `∂RTP/∂lever` and its `∂(hit freq)/∂lever`, `∂(bonus freq)/∂lever`, etc.
   Solve the small linear system to hit `targetRTP` while keeping the comparison
   metrics inside tolerance. Prefer the coarsest lever that still respects tolerances.
5. Re-run S2; iterate until RTP within ±0.3%.
6. Run S3 (1e7): confirm tail shape and profile-comparison tolerances.
7. Run S4 (1e8–1e9): certification-grade RTP CI.
8. Record the final four numbers and the evidence in `docs/DECISIONS.md`.

---

## 5. Certification / validation implications

### 5.1 Each profile is a separate certifiable configuration

Any change to any payout-affecting parameter — including the four profile levers —
produces a **distinct math configuration** that a testing lab evaluates independently.
There is no "the levers are small so one certificate covers all five". Each profile
gets:

- its own full statistical pack (`04_SIMULATION_PLAN.md` §3),
- its own theoretical RTP statement (capped and uncapped),
- its own `configHash` and golden regression set,
- its own S4 run artifacts.

### 5.2 What is shared and reduces (not eliminates) validation effort

- The **engine binary/source** is identical across profiles — one code review, one
  determinism/RNG audit, one set of invariant/property tests.
- The **rules** (mechanics) are identical — one rules description document; the lab
  reviews mechanics once, then five parameter sets.
- The **RNG integration** is identical — one RNG certification.
- Because only four scalar fields differ and all are `Config` inputs (no code
  branching on `profile.id` beyond reading these fields), the risk of a profile-
  specific code path bug is structurally near-zero (enforced by a test: the engine
  must produce identical output for two profiles that happen to share all four lever
  values).

### 5.3 What still requires per-profile validation

- Observed RTP convergence to the profile target (S4).
- The full statistical battery, per profile (RTP labs typically want ~1e8–1e10 rounds
  per configuration).
- Max-win reachability and P(cap) per profile (the cap interacts with the tail, which
  shifts slightly with `PAYTABLE_MID_SCALE` and bonus frequency).
- Profile-comparison table (§7 of the sim plan) as evidence that the "same game"
  claim holds.

### 5.4 Changes that would escalate validation cost (avoid unless necessary)

- Introducing a profile-specific value for any *shared-core* parameter (Heat, Pressure,
  Shard caps, Power weights). This would mean the volatility identity differs and each
  profile needs its own mechanics scrutiny, not just its own parameter set.
- Adding a bonus-buy or feature-buy (a separate product with its own RTP profile and
  its own certification, out of V1 scope).
- Raising `SHARD_MAX_LEVEL` or `MAX_WIN_X` for some profiles and not others.

---

## 6. Volatility-identity preservation — how we measure it

At S3+, for every profile, produce the comparison table from
`04_SIMULATION_PLAN.md` §7. The claim "these are the same game at different RTP" is
**accepted only if** all five profiles sit within tolerance of RTP_96 on:

hit frequency, bonus frequency (relative), base/bonus split, P(win>100x) (relative),
P(cap) (order of magnitude), skewness (relative, sub-sample-stable), Awakened
frequency (relative).

If a profile fails, the lever choice is wrong — return to §4 step 4 with a different
lever mix, or (last resort, with a DECISIONS.md entry) accept a documented deviation
for the most extreme profile only.

---

## 7. Summary

| Aspect | Decision |
|---|---|
| Profile model | 4 scalar levers over a shared frozen core |
| Primary lever | `W_CORE_BASE` (bonus frequency) |
| Secondary | `PAYTABLE_MID_SCALE` on buckets B7–B15 only |
| Tertiary | `MOLTEN_EXPAND_THRESHOLD` (Awakened frequency) |
| Fine | `BONUS_W_CORE` (retrigger) |
| Never a lever | Heat, Pressure, Shard caps/spawn, Power weights, merge ladder, top paytable buckets, `MAX_WIN_X` |
| Validation | Each profile independently certified; engine/rules/RNG reviewed once |
| Identity check | Mandatory profile-comparison table within tolerance of RTP_96 |
| Rejected | Global prize coefficient |
