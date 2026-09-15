# 01 — GAME DESIGN (FROZEN FOR V1)

This document restates the approved, frozen design and adds **only the clarifications
required to make it unambiguous for simulation**. Clarifications are marked
`[CLARIFICATION]` and are themselves subject to human confirmation, but they do not
change the intent of any frozen rule. Numeric values are NOT here — they live in
`docs/02_MATH_SPEC.md` tagged `TUNABLE_V1`.

Any change to a rule in this document requires an explicit approval line in
`docs/DECISIONS.md`.

---

## F1. Base game

- **Grid:** 6×6 (36 cells).
- **Mechanic:** Cluster Pays.
- **Minimum winning cluster:** 5 matching symbols.
- **Adjacency:** orthogonal only (up/down/left/right). Diagonals never connect.
- **Win resolution:** winning symbols are removed.
- **Refill:** new symbols fall into empty positions (gravity + top refill).
- **Cascades:** continue until no new winning cluster exists.

`[CLARIFICATION]` A "cluster" is a maximal orthogonally-connected set of ≥5 cells all
showing the same paying symbol, where Forged Wilds substitute for any paying symbol.
A cell belongs to at most one cluster. When a connected region of one symbol could be
partitioned, it is **not** partitioned — the whole connected same-symbol region (with
substituting wilds) is one cluster and pays once for its total size.

`[CLARIFICATION]` "Fall into empty positions" = column gravity: within each column,
non-removed, non-locked cells drop to the lowest available position; empty cells at
the top are filled by new draws.

---

## F2. Symbol structure

- **4 LOW symbols.**
- **4 HIGH symbols.**
- **FORGE CORE** special symbol (bonus trigger).
- **FORGE SHARD** system (special multiplier/value objects — see F6).

`[CLARIFICATION]` A ninth on-board paying/near entity, the **FORGED WILD**, is created
only by the Hammer power (F4) and, where specified, by bonus advantages. It is not a
"symbol" in the distribution sense (it is never drawn from the symbol pool) but it
occupies a cell and substitutes for paying symbols. This is consistent with the frozen
Hammer concept ("may create FORGED WILDS").

Exact symbol probabilities and pay values are NOT frozen.

---

## F3. Heat system

- Winning clusters generate **Heat**.
- Heat represents energy accumulated by the Forge.
- Larger clusters should generally be capable of generating more Heat.
- Long cascade sequences may influence Heat generation.
- Heat ultimately enables **Forge Power** events.

NOT frozen: the Heat formula, thresholds, accumulation behaviour, reset behaviour,
interaction with cascades, and the Forge Power trigger mechanism.

Design requirements (frozen as *requirements*, not as a solution):

- understandable player behaviour
- statistically controllable
- simulatable without presentation code
- no hidden dependency that makes RTP validation impractical
- avoid uncontrolled positive-feedback loops

---

## F4. Forge Powers

Exactly **three** core Forge Powers, with **frozen identities**:

- **BLADE — CUT:** affects a row or column and removes LOW-value symbols, enabling
  replacement symbols and potentially additional cascades.
- **HAMMER — SMASH:** affects a local region (initially envisioned ~3×3). Destroys
  symbols and may create FORGED WILDS before triggering another cascade.
- **SHIELD — LOCK:** preserves selected valuable cells, Wilds, multipliers or relevant
  special states through subsequent cascade behaviour.

NOT frozen: probabilities, targeting rules, number of affected cells, Wild creation
rates, lock duration, activation conditions, expected value.

Special attention (frozen as a *design directive*): interactions between Shield,
Shards, Hammer, cascades and high-value states.

---

## F5. Forge Pressure

- Exists **only during an active cascade sequence**.
- Conceptual states: **COLD → WARM → HOT → OVERHEAT → CRITICAL**.
- **Resets when the cascade sequence ends.**
- Must **not** simply apply an uncontrolled global win multiplier.
- Increasing Pressure may affect carefully selected mechanics: Forge Shard occurrence,
  Forge Power opportunity, Merge opportunity, or other mathematically justified
  probabilities.
- Purpose: make long cascade chains increasingly exciting while maintaining controlled
  mathematical exposure.

NOT frozen: the exact effects.

---

## F6. Forge Shards and Merge

- Forge Shards are special multiplier/value objects.
- **Two compatible equal-value Shards can merge into a higher-value Shard.**
- Conceptual progression: `2x+2x→4x`, `4x+4x→8x`, `8x+8x→16x`, `16x+16x→32x`,
  `32x+32x→64x`.
- Levels **above 64x (e.g. 128x) must NOT be assumed safe.** The simulator decides
  whether they are acceptable.
- **The merge mechanic itself is frozen.**

Must be defined rigorously (in `02_MATH_SPEC.md`): spawn rules, spawn locations,
adjacency requirements, when merge resolution occurs, merge ordering with multiple
possible merges, whether chain merges are possible, how Shard values affect wins,
Shard lifecycle, interaction with cascades / Shield / Hammer / Pressure, and behaviour
in Bonus mode.

Frozen requirement: **no ambiguous board state**; given the same initial state and RNG
sequence, resolution is always deterministic.

---

## F7. Forge Core / Bonus trigger

- FORGE CORE is the bonus-trigger symbol.
- **3 Cores → Bonus. 4 Cores → enhanced Bonus. 5+ Cores → stronger enhanced Bonus.**

V1 concept (spin counts frozen as the V1 starting design; the *enhancements* are not
mathematically frozen):

- **3 Cores:** 8 Free Spins.
- **4 Cores:** 10 Free Spins + an advantage.
- **5+ Cores:** 12 Free Spins + a stronger initial advantage.

`[CLARIFICATION]` "5+" is treated as a single tier for spin count (12) but the initial
advantage may scale with the exact Core count above 5 if `02_MATH_SPEC.md` justifies
it. Whether it scales is TUNABLE.

---

## F8. Awaken the Titan bonus

- Bonus starts on a **7×7 grid**.
- The player can progress toward expansion during the bonus.
- The bonus can expand to **8×8**.
- Progress is represented through **MOLTEN CELL / FORGE progression**.
- On reaching 8×8, **AWAKENED TITAN MODE** activates.
- Awakened mode **enhances existing mechanics**, it does not add an unrelated second
  feature set. Candidate enhancements: stronger Blade, stronger Hammer, stronger
  Shield, more Shard/Merge opportunity, modified Pressure behaviour.

NOT frozen: exact mathematical implementation.

`[CLARIFICATION]` Free spins in the bonus use the same cascade/Heat/Pressure/Shard/
Power/Core rules as the base game, on the current bonus grid size, with bonus-specific
parameter overrides defined in `02_MATH_SPEC.md`.

---

## F9. Maximum win

- Initial target: **10,000× total bet**.
- The engine must **enforce the maximum win deterministically**.
- Must define: whether the cap applies at round level; how an in-progress
  cascade/bonus is resolved when the cap is reached; how theoretical exposure above
  the cap is accounted for; how simulation reports capped vs. uncapped theoretical
  payout.

`[CLARIFICATION]` "Round level" is adopted in `02_MATH_SPEC.md` (§ Max-Win). This is a
design choice consistent with the frozen text, not a change to it.

---

## F10. Architecture (frozen principle)

`RNG → MATH ENGINE → ROUND RESULT → PRESENTATION ENGINE → PIXIJS / 3D / VIDEO / AUDIO`.

The frontend must **never** determine wins, symbol outcomes, feature activation,
multiplier values, bonus outcomes or payout.

---

## F11. RNG & determinism (frozen principle)

`same configuration + same seed + same initial state ⇒ exactly the same result`.

A custom PRNG is **not** claimed suitable for regulated production. Production RNG
integration stays abstract and replaceable.

---

## Frozen-rule index (quick reference)

| ID | Rule | Frozen element |
|---|---|---|
| F1 | 6×6, cluster pays, min 5, orthogonal, cascade to exhaustion | mechanic & topology |
| F2 | 4 LOW + 4 HIGH + Forge Core + Shard system | symbol taxonomy |
| F3 | Heat from wins → enables Forge Powers | existence + requirements |
| F4 | Blade / Hammer / Shield with stated identities | the three identities |
| F5 | Pressure exists only during a cascade sequence; 5 states; resets on sequence end; not a raw global multiplier | scope, states, reset, constraint |
| F6 | Equal Shards merge to next level; progression to 64x; merge mechanic itself | merge rule & ladder shape |
| F7 | 3 / 4 / 5+ Cores → 8 / 10 / 12 FS (+advantages at 4 and 5+) | trigger tiers & V1 spin counts |
| F8 | Bonus 7×7 → molten progression → 8×8 → Awakened enhances existing mechanics | expansion path & "enhance not add" |
| F9 | Max win enforced deterministically; target 10,000x | enforcement requirement |
| F10 | Math/presentation separation; frontend never decides outcomes | architecture |
| F11 | Seed + config + state ⇒ identical result; production RNG abstract | determinism |
