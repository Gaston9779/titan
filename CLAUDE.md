# CLAUDE.md — FORGE: THE LAST TITAN

Project working agreement for any AI or human contributor. Read this before touching
anything in this repository.

---

## 0. Project phase

**CURRENT PHASE: PHASE 1 — MATHEMATICAL ARCHITECTURE & SPECIFICATION.**

In Phase 1 the only deliverables are documents under `docs/` and this file.

Phase 1 explicitly forbids:

- implementing the playable game
- building the PixiJS / rendering / 3D / audio frontend
- creating visual, audio or animation assets
- installing frontend dependencies
- writing the simulator / math engine code (that is Phase 2, and only after the
  human owner writes an explicit approval line in `docs/DECISIONS.md`)

Phase 1 permits and requires:

- deriving, documenting and stress-testing the mathematical model on paper
- identifying mathematical failure modes
- producing a specification precise enough that Phase 2 is transcription, not design

---

## 1. Frozen vs. tunable

### 1.1 Frozen game-design rules

The mechanics described in `docs/01_GAME_DESIGN_FROZEN.md` are **frozen**. They cannot
be changed, replaced, reinterpreted or "improved" without an explicit written approval
from the human owner recorded in `docs/DECISIONS.md`.

If analysis shows a frozen rule causes a serious mathematical problem, you must NOT
silently redesign it. You must file an entry in `docs/03_MATH_RISK_REGISTER.md` with:

```
PROBLEM
WHY IT MATTERS
SEVERITY
RECOMMENDED MATHEMATICAL SOLUTION
WHETHER IT REQUIRES CHANGING A FROZEN RULE
```

and stop, pending human decision.

### 1.2 Tunable parameters

Every numeric parameter (probability, weight, pay value, threshold, cap, count,
duration, frequency target) is **NOT frozen** in Phase 1. Each such value introduced
in `docs/02_MATH_SPEC.md` must be tagged `TUNABLE_V1` and accompanied by:

- why this initial value was selected
- expected effect on RTP
- expected effect on volatility
- expected interaction with other parameters
- safe tuning direction (which way to move it and what breaks first)

A guessed number must never be written as if it were a proven number.

---

## 2. Engineering principles (binding on Phase 2 and later)

1. **Math and presentation are completely separable.** The math engine consumes RNG +
   config + initial state and emits an immutable `RoundResult`. The frontend only
   presents that result.

2. **The frontend never determines** wins, symbol outcomes, feature activation,
   multiplier values, bonus outcomes or payout. Not even tie-breaks. Not even
   cosmetic-looking randomness that could drift.

3. **Every payout-affecting mechanic runs headlessly.** If a mechanic cannot be
   simulated without a renderer, it is wrong and must be redesigned at the spec level.

4. **Deterministic replay is mandatory.** `same config + same seed + same initial
   state ⇒ byte-identical RoundResult`. Every random draw is consumed in a specified
   order and tagged with its purpose.

5. **Tests accompany mathematical implementation.** No math module lands without unit
   tests for its state transitions and property tests for its invariants (RNG
   consumption order, determinism, cap enforcement, no impossible board states).

6. **Observed RTP is not theoretical correctness.** An observed RTP from a finite
   sample is an estimate with a confidence interval. It is never cited as proof the
   model is right. Convergence criteria live in `docs/04_SIMULATION_PLAN.md`.

7. **No feature may be tuned solely to make a short simulation display a target
   RTP.** Tuning must be justified by the parameter's documented role and validated at
   the sample sizes in the simulation plan.

8. **No hardcoded outcomes to satisfy tests.** Tests assert invariants and
   distributions (with tolerances), never "spin 7 pays 12.5x". Any fixture-based test
   must derive its expected value from the spec formulas, not from a recorded run that
   was blessed after the fact.

9. **All later math changes are recorded in `docs/DECISIONS.md`** with date, author,
   rationale, affected parameters, and the simulation evidence that supports the
   change.

---

## 3. Repository layout (Phase 1)

```
CLAUDE.md                         ← this file
docs/
  00_PRODUCT_VISION.md            ← what we are building and why
  01_GAME_DESIGN_FROZEN.md        ← the frozen mechanics, verbatim intent + clarifications
  02_MATH_SPEC.md                 ← the initial V1 mathematical specification
  03_MATH_RISK_REGISTER.md        ← failure modes, severity, mitigations
  04_SIMULATION_PLAN.md           ← staged Monte Carlo methodology & statistics
  05_MATH_PROFILE_ARCHITECTURE.md ← multi-RTP profile design & certification impact
  DECISIONS.md                    ← append-only decision log
```

Phase 2 will add `engine/`, `sim/`, `config/` and `tests/`. Do not create them yet.

---

## 4. Definitions used across all docs

- **Total bet / stake**: the single player stake for a round. All pays are expressed
  as a multiple of total bet ("x"). There are no paylines and no separate bet
  components in V1.
- **Round**: one paid spin plus every feature and free-spin sequence it triggers,
  resolved to completion (or to the max-win cap). The unit of RTP accounting.
- **Spin**: one board fill and its full cascade sequence. A round has one paid spin
  and, if the bonus triggers, one or more free spins.
- **Cascade sequence**: the loop of (detect clusters → pay → remove → gravity →
  refill) within a single spin, until no winning cluster remains.
- **Cascade depth**: number of winning cascade iterations resolved so far in the
  current sequence (the first paid board is depth 1).
- **RoundResult**: the immutable output record of a round. Its schema is specified in
  `docs/02_MATH_SPEC.md`.

---

## 5. Review standard

Treat this as commercial gambling mathematics, not a demo. Be adversarial toward the
design. Prefer a simpler, mathematically controllable mechanic over hidden complexity.
Every state transition unambiguous. Every payout attributable to a source. Every
random decision identifiable. Every mechanic with a measurable EV contribution. Every
round reproducible. Every RTP profile independently testable.
