# 02 — MATH SPECIFICATION (INITIAL V1)

**Status:** initial, mathematically coherent, *not validated*. Every numeric value is
`TUNABLE_V1` unless it is a frozen rule from `01_GAME_DESIGN_FROZEN.md`. Nothing here
is proven until the simulation plan in `docs/04_SIMULATION_PLAN.md` says so.

Notation:
- `bet` = total bet = `1.0` accounting unit. All pays are in units of `bet` ("x").
- `U()` = next uniform in `[0,1)` from the round RNG stream.
- `d` = current cascade depth (first paid board = 1).
- Parameters are named `SNAKE_CASE`; all are collected in § 17 with tuning notes; every
  numeric parameter is classified FROZEN / TUNABLE_V1 / DERIVED in § 19.

### 0. Coordinate system (normative)

- A grid is `W` columns × `H` rows. `W = H ∈ {6, 7, 8}`.
- `(col, row)` with `col ∈ [0, W)` increasing **left → right**, `row ∈ [0, H)`
  increasing **top → bottom**. Therefore `row = H-1` is the **bottom** row (the floor)
  and `row = 0` is the **top** row (where refills enter).
- "Lower cell" / "falls to the lowest position" = **larger `row` index**.
- **Row-major order** = iterate `row` from `0` to `H-1`, and within each row `col` from
  `0` to `W-1`. Used for all "reading order" / "top-left-most" tie-breaks.
- **Fill/refill draw order** = for `col` from `0` to `W-1`, for `row` from `H-1` down to
  `0` (bottom cell of a column drawn first). Used for every `FILL` / `REFILL` /
  `MERGE_REFILL` draw sequence.
- Grid expansion 7×7 → 8×8: normative cell mapping is in § 12.3 (existing symbols keep
  `col`, `row += 1`; new cells are the top row `row = 0` and the right column
  `col = 7`).

---

## 1. Symbol model

### 1.1 Symbol set

| Id | Class | Role |
|----|-------|------|
| `L1 L2 L3 L4` | LOW | paying, cluster-forming |
| `H1 H2 H3 H4` | HIGH | paying, cluster-forming |
| `CORE` | special | bonus trigger; inert (no clusters), sticky within a sequence |
| `SHARD` | object | multiplier object; not drawn as a normal symbol except via spawn rule; see § 9 |
| `WILD` | object | Forged Wild; created only by Hammer / bonus advantage; substitutes for L*/H* only |

`WILD` never substitutes for `CORE` or `SHARD`. `CORE` and `SHARD` never form or join
clusters. Two different paying symbols never connect.

### 1.2 Cell contents

A cell holds exactly one of: a paying symbol (`L1..H4`), `CORE`, `WILD`, `SHARD`, or
`EMPTY` (transient, during resolution only). A cell also carries a boolean `locked`
(set by Shield) and, if a `SHARD`, an integer `shardLevel ∈ {1..6}` with value
`shardValue = 2^shardLevel` (2,4,8,16,32,64).

---

## 2. Cluster paytable architecture

### 2.1 Structure

Pay is a function `pay(symbol, clusterSize)` in units of `bet`, before any Shard
multiplier. Size is bucketed:

| Bucket | Sizes |
|---|---|
| B5 | 5 |
| B6 | 6 |
| B7 | 7 |
| B8 | 8 |
| B9 | 9 |
| B10 | 10–11 |
| B12 | 12–14 |
| B15 | 15–19 |
| B20 | 20–24 |
| B25 | 25–29 |
| B30 | 30–35 |
| B36 | 36–48 (only reachable on 7×7 / 8×8) |
| B49 | 49–64 (only reachable on 8×8) |

Rationale for bucketing: keeps the paytable to a small, auditable matrix; removes the
need to justify 36 distinct per-size values per symbol; the marginal value of size 13
vs 14 is not player-perceptible. Buckets B36/B49 exist so bonus-grid mega-clusters
have a defined pay without extrapolation.

### 2.2 Initial paytable — `PAYTABLE_V1` (TUNABLE_V1)

Values in x `bet`. Derived from a target base-hit paytable RTP contribution of ~55–60%
(before cascades/features), with LOW:HIGH top-end ratio ≈ 1:12 to give HIGH clusters
identity.

| sym | B5 | B6 | B7 | B8 | B9 | B10 | B12 | B15 | B20 | B25 | B30 | B36 | B49 |
|-----|----|----|----|----|----|-----|-----|-----|-----|-----|-----|-----|-----|
| L1 | 0.20 | 0.25 | 0.30 | 0.40 | 0.55 | 0.80 | 1.20 | 2.00 | 3.50 | 6.0 | 10 | 18 | 30 |
| L2 | 0.25 | 0.30 | 0.40 | 0.50 | 0.70 | 1.00 | 1.50 | 2.60 | 4.50 | 8.0 | 13 | 22 | 38 |
| L3 | 0.30 | 0.40 | 0.50 | 0.65 | 0.90 | 1.30 | 2.00 | 3.40 | 6.00 | 10  | 17 | 30 | 50 |
| L4 | 0.40 | 0.50 | 0.65 | 0.85 | 1.20 | 1.70 | 2.60 | 4.40 | 7.50 | 13  | 22 | 38 | 65 |
| H1 | 0.60 | 0.80 | 1.10 | 1.50 | 2.10 | 3.00 | 4.60 | 7.50 | 13   | 22  | 38 | 65 | 110 |
| H2 | 0.80 | 1.10 | 1.50 | 2.10 | 3.00 | 4.30 | 6.60 | 11   | 19   | 32  | 55 | 95 | 160 |
| H3 | 1.20 | 1.70 | 2.40 | 3.30 | 4.70 | 6.80 | 10.5 | 17   | 30   | 52  | 90 | 155| 260 |
| H4 | 2.00 | 2.90 | 4.10 | 5.70 | 8.10 | 12   | 18   | 30   | 52   | 90  | 155| 270| 460 |

Notes:
- Monotonic in size and in symbol rank (required invariant, tested).
- No single base cluster pay approaches the 10,000x cap; the cap is a *product of
  interactions* (cascades × Shard multipliers × bonus), never one cluster.
- `B49` H4 = 460x is the single largest atomic pay; combined with the max per-round
  Shard multiplier cap (§ 9.6) this bounds any single payout event well under the cap.

### 2.3 Pay lookup for exact size

`pay(sym, n) = PAYTABLE_V1[sym][bucket(n)]`. Within a bucket the pay is flat.
`[CLARIFICATION candidate]` linear interpolation within buckets is an option flagged
for Phase 2 if flat steps produce visible "shelves" in the win distribution; default
is flat.

---

## 3. Symbol generation / distribution

### 3.1 Generation model — independent weighted cell draws

Each newly created paying cell (initial fill or refill) is drawn **independently** from
a categorical distribution over `{L1..H4, CORE}` using weight vector `W_GEN`. Shards
are handled by a separate post-step (§ 9.2); Wilds are never generated here.

Independent per-cell draws (vs. reel strips) are chosen because:
- exact cell-level probabilities are analytically tractable;
- cascade refills have no natural "strip position" to advance;
- it removes an entire class of RNG-consumption-order bugs tied to strip indices.

Cost: we lose the designer control that near-miss reel strips give. Mitigation: cluster
geometry on a 6×6 grid already produces strong variance; if more control is needed,
§ 3.4 describes an optional per-column weight set without changing the draw model.

### 3.2 Initial weights — `W_GEN_V1` (TUNABLE_V1)

Relative weights (normalised at use):

| L1 | L2 | L3 | L4 | H1 | H2 | H3 | H4 | CORE |
|----|----|----|----|----|----|----|----|------|
| 220 | 200 | 175 | 150 | 90 | 70 | 45 | 28 | `W_CORE` |

`W_CORE_V1 = 7` (base game). Total ≈ 1085 ⇒ P(CORE per cell) ≈ 0.00645.

- LOW mass ≈ 68%, HIGH mass ≈ 31%, CORE ≈ 0.6%.
- Rarer symbols pay more; the weight ladder is roughly geometric (~0.8× per step
  within a class, ~0.7× at the LOW→HIGH boundary scaled).
- Expected count of a symbol with weight `w` on a full 36-cell board ≈ `36·w/Σw`.
  H4 ≈ 0.93 cells; a 5-cluster of H4 on the initial board is deep-tail, which is the
  intent (most HIGH wins arrive via cascades and Wild assistance).

### 3.3 CORE landing model

`CORE` is drawn like any symbol but:
- never joins clusters, never removed by clusters;
- **sticky within a sequence**: once landed it stays through all cascades of that spin
  (it falls with gravity but is never cleared by a win);
- counted at **sequence end** (§ 11).
- Because it is sticky and occupies a cell, it slightly reduces the effective playable
  area as a sequence deepens — this is a mild, self-limiting negative feedback on
  cascade length (documented as *desirable* damping in `03_MATH_RISK_REGISTER.md`).

`[CLARIFICATION]` `CORE` cells are **not** valid Blade/Hammer targets for removal and
are **not** valid Shield targets. Hammer destroying a 3×3 area leaves any `CORE` in it
untouched.

### 3.4 Optional per-column weights (deferred)

`W_GEN` may become `W_GEN[col]` (6 vectors) if tuning needs edge/centre shaping. This
does not change §3.1's model or draw order. Deferred to Phase 2; not in V1 baseline.

---

## 4. Cascade resolution

### 4.1 State

Initialised **at spin start**:

```
cascadeDepth       = 0
pressureTier       = COLD
heat               = heatCarryThisSpin   # 0 except A4/A5 free spin 1 (§ 11.2)
powersThisSequence = 0
responsibleEdit    = none
board              = fresh FILL (§ 3): no Shards, no Wilds, no locks, no Cores
```

Initialised **at round start** and carried across all spins of the round (§ 15.1):

```
roundWinSoFar      = 0
shardContribRound  = 0
capped             = false
```

`powersThisStep` is initialised to 0 at the start of every cascade-loop step 7.

### 4.2 Cascade loop (single spin)

**Board settle (S)** — run once on the freshly-FILLed initial board, and again as
step 11 at the end of every iteration:
- **S1 Resolve Shard merges** (§ 10) to fixpoint or `MERGE_PASS_CAP`. Each merge does a
  local column gravity+refill, so merges are resolved here — *before* cluster detection
  — and the board is fully static when detection runs. (On the initial board and any
  board with < 2 mergeable Shards this is a no-op.)

Then repeat:

1. **Detect clusters** on the settled board using the exact algorithm in § 4.6.
   Summary: `WILD` cells are jokers that both **bridge** same-symbol regions and
   **extend** them; each `WILD` belongs to exactly one paying cluster (deterministic,
   § 4.6); a `WILD` that cannot be placed in any ≥ 5 cluster pays nothing and stays.
2. If **no cluster of size ≥ 5** exists → **exit loop**.
3. `cascadeDepth += 1`; update `pressureTier` from `cascadeDepth` (§ 6).
4. **Pay clusters.** Order clusters by descending base pay, tie → row-major anchor
   cell. For each: collect adjacent Shards (§ 9.4), compute
   `clusterPay = pay(sym,n) · shardMultiplier` (clamp order § 9.6), add to
   `roundWinSoFar`, emit a `PayEvent` with its `contrib` breakdown (§ 14), then run the
   **max-win check** (§ 13.2).
5. **Accumulate Heat** from all clusters this cascade (§ 5).
6. **Remove** winning symbols and consumed Shards. Keep: locked cells, `CORE`,
   non-winning `WILD`, non-collected `SHARD`.
7. **Forge Power trigger check** (§ 5.3). Set `powersThisStep = 0`.
   [A4/A5 free spin 1, depth 1 only: first apply the forced powers (§ 11.2) —
    Shield then Hammer — each subject to legal-target and the **sequence** cap
    (`POWERS_PER_SEQUENCE_CAP`) only, **not** the per-step cap, `POWER_SELECT` not
    drawn, no Heat cost. `powersThisStep` is *not* incremented by forced powers, so
    the natural check below can still fire once this step.]
   Then, while `heat ≥ HEAT_THRESHOLD` **and** `powersThisStep < POWERS_PER_STEP_CAP`
   **and** `powersThisSequence < POWERS_PER_SEQUENCE_CAP`:
   (a) compute the **legal-target set** `L ⊆ {BLADE, HAMMER, SHIELD}` (§ 7.1);
   (b) if `L = ∅`: emit `POWER_NO_TARGET`, `heat -= HEAT_THRESHOLD`,
       `powersThisSequence += 1`, `powersThisStep += 1` (no RNG draw);
   (c) else: **one** `POWER_SELECT` draw over `POWER_WEIGHTS` restricted to `L`,
       apply that power's board edit (§ 7–8), `heat -= HEAT_THRESHOLD`,
       `powersThisSequence += 1`, `powersThisStep += 1`.
   Power board-edits happen **after** removal (step 6), **before** gravity (step 8).
8. **Gravity** (normative). Process each column `col` independently. **Locked cells are
   immovable dividers** — they keep their `row` and split the column into contiguous
   *segments* of non-locked rows. For each segment: collect its non-`EMPTY` contents in
   bottom-to-top order, place them back from the segment's bottom row upward; the
   remaining upper rows of the segment become `EMPTY`. Nothing moves between segments.
   A segment below a floating locked cell may hold `EMPTY` rows that refill in step 9 —
   intended and well-defined.
9. **Refill.** Fill every `EMPTY` non-locked cell in the § 0 draw order (`col 0→W-1`,
   `row H-1→0`, skipping non-empty/locked). Each refilled cell immediately runs the
   **Shard spawn roll** (§ 9.2) before the next cell's symbol draw.
10. **Decrement Shield locks** (§ 8.4); expire those reaching 0.
11. **Board settle (S1)** — resolve Shard merges (§ 10) to fixpoint / `MERGE_PASS_CAP`.
12. Loop back to step 1.

### 4.3 Sequence end

When the loop exits: `pressureTier → COLD` (reset), evaluate `CORE` count for bonus
(§ 11), then **clear** all Shards, Wilds, locks, and Cores from the board. Heat resets
to 0 (base game). Nothing about Shards/Heat/Pressure survives to the next spin.

### 4.4 Determinism guarantees

- Cluster detection is a pure function of the board.
- All ordering rules are total orders (pay desc → row-major anchor).
- Every random draw is consumed in the § 15 order with a purpose tag.
- No floating-point comparison decides cluster membership (integers only). Pay
  arithmetic uses fixed-point (integer micro-units, `1x = 1_000_000 µ`) to guarantee
  cross-platform identical sums.

### 4.5 Runaway protection

- `CASCADE_DEPTH_HARD_CAP` (§ 17): if reached, the sequence force-terminates after
  paying the current cascade; emit `CASCADE_CAP_HIT` diagnostic. Set high enough that
  legitimate play effectively never hits it; its purpose is to bound worst-case
  compute and to catch a design error in simulation, not to shape the game.
- A cascade that removes 0 cells is impossible (a paid cluster is ≥5 cells) so the
  loop strictly progresses or exits.

### 4.6 Cluster detection incl. wilds (deterministic, normative)

Goal: reproduce the frozen F1 notion — a cluster is a **maximal orthogonally-connected
region of one paying symbol where wilds substitute for that symbol** — while assigning
each wild to exactly one cluster when wilds sit between different symbols.

Definitions:
- **Non-wild component**: a maximal orthogonally-connected set of cells all holding the
  same paying symbol `s` (no wilds). Each has a symbol `s` and an *anchor* = its
  row-major-smallest cell.
- **Wild-reachable**: cell `w` (a wild) is wild-reachable from component `K` if there
  is a path `w = w_0, w_1, …, w_m` (m ≥ 0) of wild cells, each orthogonally adjacent to
  the next, with `w_0` orthogonally adjacent to some cell of `K`.

Algorithm:

1. Compute all non-wild components.
2. Compute all **wild blobs**: maximal orthogonally-connected sets of `WILD` cells.
3. For each candidate paying symbol `s` present on the board, build the **s-supergraph**:
   nodes = non-wild components of symbol `s` **plus** every wild blob that is
   orthogonally adjacent to at least one `s`-component. Edges connect two nodes if they
   are orthogonally adjacent. Take each connected sub-graph: it defines a *candidate
   s-cluster* whose cell set = (all `s` cells in it) ∪ (all wild cells in its wild
   blobs). Its size = that cell count. This is what "bridging" means: two `s`
   components joined only through a shared wild blob are ONE candidate `s`-cluster.
4. A wild blob may appear in candidate clusters for several symbols. **Resolve each
   contested wild blob to exactly one symbol**, processing contested blobs in
   **row-major order of the blob's smallest cell**. For blob `B`, among the symbols
   whose candidate cluster currently contains `B`:
   a. compute, for each such symbol `s`, the pay the `s`-candidate-cluster would have
      **with `B` included** minus the pay **with `B` removed** (and its `s`-components
      re-split if removing `B` disconnects them, each re-checked against the ≥5
      threshold). This delta is `gain(s, B)`.
   b. assign `B` to the symbol with the largest `gain`; tie → larger resulting total
      cluster size; tie → lower symbol index (`L1<…<H4`); tie → cluster with the
      row-major-smallest anchor.
   c. remove `B` from every other symbol's candidate cluster (re-splitting as in (a)).
5. After all contested blobs are resolved, every wild blob belongs to at most one
   symbol. Recompute final clusters: for each symbol `s`, its `s`-cells plus its
   assigned wild blobs, re-connected; each connected group of size ≥ 5 is a **paying
   cluster** paying `pay(s, size)`.
6. Wild cells not assigned to any paying cluster (their blob lost every contest, or the
   winning cluster ended up < 5) remain on the board and pay nothing.
7. Paying clusters are then ordered and paid per § 4.2 step 4. Wild cells in a paying
   cluster are removed with it (unless locked, § 8.2).

Properties: deterministic (every choice has a documented total tie-break), O(cells²)
worst case (trivial at ≤ 64 cells), and it never partitions a genuinely connected
single-symbol+wild region (satisfies F1). Property tests in § 16 / R21 / R12 cover the
contested-blob and chain-bridge cases.

`[CLARIFICATION]` A wild blob of ≥ 5 cells adjacent to **no** paying symbol forms no
cluster and pays nothing (there is no symbol to pay as). It stays on the board.

---

## 5. Heat

### 5.1 Purpose

Heat is the *within-spin* resource that triggers Forge Powers. It is intentionally
decoupled from Pressure (which is a cascade-depth state, § 6).

### 5.2 Heat generation — `HEAT_*` (TUNABLE_V1)

Per winning cluster in a cascade (all arithmetic in integer centi-units, `1.0 Heat =
100`; the rational factors below are applied as integer `num/den` with round-half-to-
even, once, at the end):

```
effClassW(cluster) = ( Σ_{c ∈ cluster.cells} cellW(c) ) / n
    where cellW(c) = HEAT_CLASS_LOW   (1.00) if c holds a LOW symbol
                     HEAT_CLASS_HIGH  (1.80) if c holds a HIGH symbol
                     HEAT_CLASS_WILD  (0.50) if c holds a WILD

heatGain(cluster) = (n - 4) * effClassW(cluster)
                            * HEAT_DEPTH_FACTOR(d) * heatMult(pressureTier)
```

- `n` = cluster size (paying cells + wild cells), so a minimum cluster (5) contributes
  `1 * effClassW * factors`.
- `effClassW` is the **per-cell average** class weight (not a "mostly wild" branch):
  a cluster that is half wilds gets a blended weight, damping the Hammer→Heat loop
  (R7) smoothly.
- `HEAT_DEPTH_FACTOR(d)` = `1.00` for d≤2, `1.15` (=23/20) for d=3, `1.30` (=13/10)
  for d=4, `1.50` (=3/2) for d≥5. `d` = the depth at which the cluster is paid.
- `heatMult(pressureTier)` from the § 6.2 table (`1.00 … 1.20`), applied here (this is
  the only place Pressure touches Heat).

`heat` accumulates additively across all clusters and all cascades of the spin.

### 5.3 Forge Power trigger

`HEAT_THRESHOLD_V1 = 1200` centi-units (= 12.0 Heat).

Trigger check runs in step 7 of the cascade loop. Each trigger consumes exactly
`HEAT_THRESHOLD` (carry the remainder forward — no waste, no free rollover beyond
what was earned). Caps:

- `POWERS_PER_STEP_CAP_V1 = 1` — at most one power per cascade iteration.
- `POWERS_PER_SEQUENCE_CAP_V1 = 4` — at most four powers per spin (7 in Awakened,
  § 12).

Rationale for `POWERS_PER_STEP_CAP = 1`: prevents a single huge cascade from dumping
multiple powers at once, which is the main Heat feedback risk (R2). If a step earns
≥ 2 thresholds of Heat, the surplus stays and can trigger a power next step *if a next
step exists* — tying power frequency to cascade continuation, which is self-limiting.

### 5.4 Expected behaviour (analytical estimate, to be checked)

Rough: a "typical" paying spin has ~2–3 cascades and total cluster size ~18–24 with a
LOW:HIGH mix ~2:1 ⇒ heat ≈ (14–20)·(1.0–1.3 blended) ≈ 15–26 ⇒ ~1 power on a
paying spin, ~2 on a good one. Non-paying spins: 0 Heat, 0 powers. This should put
Forge Power frequency near the hit frequency scaled by ~0.6–0.9. **To be measured.**

---

## 6. Forge Pressure

### 6.1 State from cascade depth

| Tier | `cascadeDepth` (base) | `cascadeDepth` (Awakened, § 12) |
|---|---|---|
| COLD | 0–1 | 0–1 |
| WARM | 2 | 2 |
| HOT | 3 | 3 |
| OVERHEAT | 4 | *(none — folds into CRITICAL)* |
| CRITICAL | ≥ 5 | ≥ 4 |

`[CLARIFICATION]` Depth 0 (pre-first-cascade) is COLD. Pressure never decreases within
a sequence (depth is monotone); it only resets at sequence end. In Awakened mode there
is no OVERHEAT band: `d = 4` is already CRITICAL, and CRITICAL's § 6.2 effect row
applies from `d = 4` onward. Each `d` maps to exactly one tier (no overlap).

### 6.2 Effects (the ONLY things Pressure touches) — `PRESSURE_*` (TUNABLE_V1)

Pressure is **not** a win multiplier. It modulates three probabilities:

| Tier | `p_shardSpawn` (§ 9.2) | `heatMult` on `heatGain` | Merge "column pull" (§ 10.4) |
|---|---|---|---|
| COLD | 0.020 | 1.00 | off |
| WARM | 0.035 | 1.00 | off |
| HOT | 0.055 | 1.05 | off |
| OVERHEAT | 0.080 | 1.10 | on |
| CRITICAL | 0.110 | 1.20 | on |

- `heatMult` is applied *in addition to* `HEAT_DEPTH_FACTOR` (they are both functions
  of depth; keeping them separate lets us tune "Pressure feel" vs "raw depth" apart).
  Combined depth multiplier at d≥5 = `1.5 * 1.20 = 1.8`. **Watch this in sim (R6).**
- "Column pull" lets two equal Shards in the same column but not adjacent merge
  (§ 10.4) — a rare, exciting OVERHEAT+ event, bounded by the Shard board cap.

### 6.3 Why this is controllable

Each effect has a hard ceiling: `p_shardSpawn ≤ 0.11`, Shard board count ≤
`SHARD_BOARD_CAP` (§ 9.5), `heatMult ≤ 1.20`, and powers are capped per sequence. No
Pressure effect compounds on itself.

---

## 7. Forge Power selection & Blade

### 7.1 Selection

Base weights `POWER_WEIGHTS_V1` (TUNABLE_V1):

| Blade | Hammer | Shield |
|---|---|---|
| 40 | 35 | 25 |

**Legal-target set `L`** is computed *before* any RNG draw (cascade-loop step 7a):

- `BLADE ∈ L` iff there exists at least one line (row or column, either orientation)
  with `≥ BLADE_MIN_LOW_TO_FIRE` removable (non-locked) LOW symbols.
- `HAMMER ∈ L` iff there exists at least one on-grid 3×3 window containing `≥ 1`
  non-locked destructible cell (a LOW/HIGH/WILD/SHARD cell; `CORE` and locked cells
  don't count). In practice almost always true.
- `SHIELD ∈ L` iff there is at least one **valuable cell** (a non-locked `SHARD` or
  non-locked `WILD`) and `count(locked) < SHIELD_MAX_ACTIVE`.

The `POWER_SELECT` draw (step 7c) is a single `drawWeighted` over the base weights
**restricted to `L`** (weights of powers not in `L` set to 0, remainder renormalised
by the integer method of § 15.4). If `L = ∅` the trigger is wasted with no draw
(step 7b): `POWER_NO_TARGET`, Heat still consumed, counts toward
`POWERS_PER_SEQUENCE_CAP`. Expected rare; measured in sim (R24). Deferred alternative:
convert the wasted Heat into an EV-neutral refund (OQ3).

### 7.2 BLADE — CUT

1. One `POWER_BLADE_ORIENT` draw: `U() < BLADE_ORIENT_P (0.5)` → rows, else columns.
2. Among the `W` lines of the chosen orientation, take the line with the **most
   non-locked LOW symbols**; tie → lowest index. If that count is
   `< BLADE_MIN_LOW_TO_FIRE`, switch to the **other** orientation and take its best
   line (guaranteed `≥ BLADE_MIN_LOW_TO_FIRE` because `BLADE ∈ L`, § 7.1). The
   orientation draw is still consumed — this keeps RNG order fixed.
3. Remove every non-locked LOW symbol on that line. HIGH, WILD, CORE, SHARD untouched.
4. Blade adds **no Heat** and creates nothing.
5. Gravity + refill + settle proceed (cascade loop step 8+).

EV character: Blade converts low-value board area into fresh draws mid-sequence,
extending cascades and giving HIGH symbols / Wilds room. Its value is almost entirely
*indirect* (via the extra cascade it enables). Contribution is attributed to `BLADE`
for every pay in cascades that follow a Blade edit until the sequence ends or another
power fires (§ 14 attribution rule).

`BLADE_MIN_LOW_TO_FIRE_V1 = 3`: if the best line has < 3 removable LOW symbols, Blade
is treated as no-target (§ 7.1). Prevents near-useless Blades from inflating its
frequency while deflating its per-event EV.

### 7.3 Interaction notes

- Blade never removes Shards → cannot destroy accumulated multiplier value (player-
  friendly, and removes a Shield/Blade interaction question).
- Blade on a column vs row is purely geometric; no EV asymmetry expected — verify.

---

## 8. Hammer & Shield

### 8.1 HAMMER — SMASH

1. Choose a centre cell. `HAMMER_TARGET_V1 = "max_low_density"`: pick the 3×3 window
   (clamped fully on-grid) maximising count of LOW symbols; tie → window whose centre
   is top-left-most. Alternative `"uniform_center"` deferred.
2. Destroy all non-locked cells in the window **except `CORE`** (Cores are immovable
   and indestructible, § 3.3). Shards in the window **are** destroyed unless locked —
   see R4; `HAMMER_DESTROYS_SHARDS_V1 = true` (documented trade-off).
3. Create `HAMMER_WILDS_V1` Forged Wilds inside the window at the emptied cells chosen
   in row-major order; if fewer empty cells than wilds, create as many as fit.
   `HAMMER_WILDS_V1 = 2` (base), `3` (Awakened).
4. Gravity + refill + Shard spawn proceed.
5. Hammer adds **no Heat** directly; the Wilds it makes generate reduced Heat
   (`HEAT_CLASS_WILD`, § 5.2) when they later win.

EV character: Hammer both clears (like a mini-Blade but symbol-agnostic) and plants
Wilds that seed the next cluster. Higher variance contribution than Blade.

### 8.2 SHIELD — LOCK

Purpose: preserve value through subsequent cascades.

1. Identify **valuable cells**: any `SHARD` (weight by `shardValue`), any `WILD`
   (weight `SHIELD_WILD_WEIGHT_V1 = 6`), and the highest-value *not-yet-paid* cluster's
   anchor region is **not** eligible (clusters pay in step 4, before the power check in
   step 7, so there is never an unpaid cluster at Shield time — Shield's job is
   protecting Shards/Wilds for the *next* cascade).
2. Select up to `SHIELD_CELLS_V1 = 3` (`4` Awakened) valuable cells, highest weight
   first; tie → row-major.
3. Set `locked = true` and `lockTtl = SHIELD_TTL_V1 = 2` cascades (`3` Awakened) on
   each.
4. Locked semantics:
   - not removed by cluster wins, Blade, Hammer, or sequence-internal clears;
   - hold their (row,col) during gravity; other cells move around them;
   - a locked `SHARD` **does not merge** while locked (prevents Shield+Merge stacking,
     R5) and is **not consumed** when it multiplies a cluster — it multiplies adjacent
     winning clusters for the duration of the lock, at most once per cascade step;
   - a locked `WILD` behaves as a normal Wild for cluster formation but is not removed
     when its cluster is paid (it persists until lock expiry).
5. On `lockTtl` reaching 0 (decremented each cascade step, step 10): `locked = false`,
   normal behaviour resumes (a now-unlocked Shard becomes merge-eligible again; a
   now-unlocked Wild is removed at the next cluster it joins).

`SHIELD_MAX_ACTIVE_V1 = 4`: total locked cells on the board cannot exceed 4; a Shield
trigger fills up to the remaining slots. Prevents board ossification.

### 8.3 Shield EV character & risk

A locked non-consumed Shard is a strong positive-EV object (it can multiply 2 clusters
over 2 steps). This is the single most dangerous Shield interaction — see R5. V1
controls: `SHIELD_TTL = 2`, `SHIELD_CELLS = 3`, "once per step", no merge while
locked, and the per-round Shard multiplier cap (§ 9.6).

### 8.4 Lock lifecycle summary

`lockTtl` set on trigger → decremented at cascade-loop step 10 → expire at 0.
Locks always expire at sequence end regardless of remaining TTL.

---

## 9. Forge Shards

### 9.1 What a Shard is

A board object occupying one cell, `shardLevel ∈ {1..6}`, `shardValue = 2^level`
(2,4,8,16,32,64). It is not a paying symbol, not wild, not cluster-forming. It falls
with gravity. It multiplies **orthogonally adjacent winning clusters** and then is
consumed (unless locked). It can merge with an equal-value adjacent Shard (§ 10).

### 9.2 Spawn — where and when

Shards spawn **only on refill during an active cascade sequence** (never on the initial
board, never at rest). In cascade-loop step 9 (and in the local refill after each merge
in step 11), each refilled cell, after its symbol is drawn, rolls:

```
if activeCascade and shardCountOnBoard < SHARD_BOARD_CAP:
    if U() < p_shardSpawn(pressureTier):        # § 6.2 table
        replace the just-drawn symbol with a SHARD, shardLevel = 1   # always 2x on spawn
```

- Spawned Shards are always level 1 (`2x`). Higher levels exist only via merge — this
  makes the merge mechanic the *sole* path to large multipliers and keeps spawn EV
  linear and easy to tune.
- Spawn is a *replacement*, not an addition: it does not change board occupancy, only
  what occupies the refilled cell. No gravity re-trigger.
- `p_shardSpawn` in Awakened mode is multiplied by `AWAKENED_SHARD_MULT_V1 = 1.5`
  (capped at 0.16).

### 9.3 Spawn location constraints

A Shard may spawn in any refilled cell — top rows only, by construction (refills happen
at the top after gravity). It then falls to its resting position with the next gravity
pass. There is no adjacency requirement for *spawning*; adjacency matters only for
*merging* (§ 10).

### 9.4 How Shards affect wins

When a cluster is paid (cascade-loop step 4):

1. Collect the set `S` of Shards orthogonally adjacent to **any** cell of the cluster.
   A Shard adjacent to multiple simultaneously-paying clusters is assigned to the
   **highest base-pay** cluster; tie → row-major anchor.
2. `shardMultiplier = max(1, Σ_{s∈S} shardValue(s))`.
   - Sum, not product: a lone `2x` gives ×2; `2x`+`4x` adjacent gives ×6 (not ×8);
     two `2x` give ×4. **Sum is chosen deliberately** to keep the multiplier
     sub-exponential in the number of adjacent Shards (R3, R6).
3. `clusterPay = pay(sym, n) * shardMultiplier`, then clamp by § 9.6.
4. Non-locked Shards in `S` are **consumed** (removed in step 6). Locked Shards in `S`
   are **not** consumed (§ 8.2) and are flagged "used this step" so they cannot
   multiply a second cluster in the same cascade.

`[CLARIFICATION]` A Shard adjacent to a winning cluster **and** part of a pending
merge: the board settle (step 11 of the previous iteration, or the pre-loop settle)
resolves all merges *before* this iteration's detection and payout (step 4), so the
merged (higher) Shard is what multiplies. See § 10.

### 9.5 Board cap

`SHARD_BOARD_CAP_V1 = 5` (`7` Awakened). While at cap, spawn rolls are skipped. Merges
reduce the count (2→1) and can re-open spawn capacity. This cap is the primary
structural bound on Shard-driven variance.

### 9.6 Multiplier caps

- Per cluster: `shardMultiplier` clamped to `SHARD_MULT_CLUSTER_CAP_V1 = 64`.
- Per cascade step (sum over all clusters' effective multiplier contribution):
  `SHARD_MULT_STEP_CAP_V1 = 128`.
- Per round: the running total of *incremental* Shard value paid
  (`Σ (clusterPay - pay(sym,n))`) is tracked as `shardContribRound`; if it would
  exceed `SHARD_MULT_ROUND_CAP_V1 = 5000 x`, the offending pay is clamped so it does
  not, and `SHARD_ROUND_CAP_HIT` is emitted. This is a backstop below the 10,000x cap.

**Clamp ordering per cluster payout (normative):** (1) compute `shardMultiplier`,
clamp to `SHARD_MULT_CLUSTER_CAP`; (2) `clusterPay = pay(sym,n) · shardMultiplier`;
(3) apply `SHARD_MULT_STEP_CAP` to the step's summed shard increment, reducing this
cluster's increment if needed; (4) apply `SHARD_MULT_ROUND_CAP` likewise; (5) emit the
`PayEvent` and run the **max-win check** (§ 13.2) on the post-(4) amount. The max-win
cap is always the last and hardest clamp.

### 9.7 Lifecycle

`spawn (level 1) → fall → [merge? → higher level] → [locked? → protected] →
adjacent to winning cluster? → multiply → consumed (if not locked) →
else persists to next cascade → sequence end: cleared`.

Shards never persist across spins, not even in the bonus (`SHARD_PERSIST_SPINS_V1 =
false`; persistence is R8).

---

## 10. Merge resolution

### 10.1 When

Merges resolve in the **board settle**: once on the freshly-FILLed initial board, and
then at **cascade-loop step 11** (end of every iteration, after gravity + refill +
lock decrement), *before* the next iteration's cluster detection (step 1) and payout
(step 4). This guarantees the board is fully static when detection runs and that a
merged (higher-level) Shard is the one that multiplies an adjacent cluster. The settle
loops to a fixpoint or `MERGE_PASS_CAP`. It is a no-op on any board with fewer than two
mergeable Shards (always true on the initial board — no Shards spawn there).

### 10.2 Trigger condition

Two Shards merge when **all** hold:
- equal `shardLevel`, and `shardLevel < SHARD_MAX_LEVEL_V1`;
- orthogonally adjacent (or same-column "pull"-eligible, § 10.4);
- neither is locked (§ 8.2).

`SHARD_MAX_LEVEL_V1 = 6` (value 64). A pair at level 6 does **not** merge — it would
produce level 7 (128x). Emit `MERGE_BLOCKED_MAX`. Whether level 7 is ever enabled is a
simulator decision (frozen text: "must NOT be assumed safe").

### 10.3 Ordering (deterministic, total)

```
repeat up to MERGE_PASS_CAP_V1 (= 8) times:
    build list of all mergeable pairs
    if empty: break
    sort pairs by: (desc shardLevel, then row-major position of the LOWER cell,
                    then row-major position of the OTHER cell)
    take the FIRST pair; merge it:
        - result Shard placed at the LOWER cell (larger row index; tie → smaller col)
        - result shardLevel = level + 1
        - the OTHER cell becomes EMPTY
    apply a LOCAL gravity+refill for the emptied column only (draw order § 15),
        which may itself spawn a Shard (§ 9.2) — allowed, counts toward board cap
    (do NOT re-scan mid-pass; continue the repeat loop for the next pass)
```

- Processing **one pair per pass** removes all ambiguity about simultaneous merges and
  makes chain merges explicit and observable.
- **Chain merges ARE possible**: pass 1 makes a `4x` from two `2x`; if another `4x` is
  adjacent, pass 2 merges to `8x`; etc. Bounded by `MERGE_PASS_CAP` and
  `SHARD_MAX_LEVEL`.
- Highest-level-first ordering means a chain resolves upward coherently rather than
  leaving orphaned mid-level Shards.
- The local gravity+refill after each merge can, rarely, bring a new equal Shard
  adjacent — captured by the next pass. `MERGE_PASS_CAP = 8` is comfortably above any
  realistic chain given `SHARD_BOARD_CAP = 5–7`.

### 10.4 Pressure "column pull"

At OVERHEAT/CRITICAL only (§ 6.2): two equal-level unlocked Shards in the **same
column** with only paying symbols / empty between them (no other Shard, no locked cell)
are also "adjacent" for merge purposes. The lower Shard's cell receives the result;
the column collapses via local gravity. This is the only non-orthogonal merge and only
at high Pressure. `COLUMN_PULL_MAX_GAP_V1 = 5` (any gap within a column).

### 10.5 Merge and features

- **Shield:** locked Shard cannot merge (either as source or target) until unlocked.
- **Hammer:** Hammer edits happen in step 7; the settle/merge is step 11 of the same
  iteration, *after* step 7. So a Hammer that destroys a Shard removes it before it can
  merge in that step-11 settle.
- **Bonus:** identical rules; `SHARD_MAX_LEVEL` unchanged in bonus and Awakened for V1
  (raising it is a separate decision with its own sim evidence).

### 10.6 How merged Shard value reaches the win

Only through § 9.4 (adjacency to a winning cluster). Merging does not itself pay. A
`64x` Shard that never touches a winning cluster before sequence end pays nothing and
is cleared — this is intended and keeps Shard EV bounded (many spawn, few connect).

---

## 11. Forge Core & bonus trigger

### 11.1 Count and trigger

At sequence end (§ 4.3), let `C` = number of `CORE` cells on the board.

| C | Result |
|---|---|
| ≤ 2 | no bonus; Cores cleared |
| 3 | Bonus, `FS = 8` |
| 4 | Bonus, `FS = 10` + advantage A4 |
| ≥ 5 | Bonus, `FS = 12` + advantage A5(C) |

Only the **paid spin's** sequence can trigger the bonus. (Free spins retrigger
differently, § 12.4.)

### 11.2 Advantages — `ADV_*` (TUNABLE_V1)

- **A4:** free spin 1 starts with `heatCarry = HEAT_THRESHOLD * 0.5` (600); and one
  **forced Shield** is applied on free spin 1 at cascade-loop step 7 of depth 1,
  **before** that step's natural Heat-driven power check, iff Shield has a legal target
  (§ 7.1) — otherwise the forced power is skipped (not deferred).
- **A5(C):** everything in A4, plus `moltenMeter` starts at `ADV_A5_MOLTEN_START_V1 =
  4` (`+1` per Core beyond 5, cap `+3`, `ADV_A5_SCALES_V1 = true`), plus a **forced
  Hammer** on free spin 1 (applied at depth-1 step 7, after the forced Shield, before
  the natural check; skipped if no legal target).

Forced-power accounting (normative): a forced power **does not consume Heat**; counts
toward `POWERS_PER_SEQUENCE_CAP` but **not** toward `powersThisStep` (so on A5's
spin-1 depth-1 step both forced powers apply *and* one natural power may still fire);
sets `responsibleEdit` for Hammer, not for Shield, like a natural power; contributes
`+1` each to `moltenGain` (§ 15.1). `POWER_SELECT` is not drawn (identity fixed); a
forced Hammer/Shield draws nothing further; a forced Blade (not used by any V1
advantage) would draw `POWER_BLADE_ORIENT`. If the sequence cap is already reached, the
forced power is skipped.

Rationale: advantages accelerate the *existing* progression (Heat, molten meter)
rather than granting raw coins — keeps the enhancement legible and its EV attributable
to the systems it feeds.

### 11.3 Core probability target

With `W_CORE_V1 = 7` and independent draws, exact `P(≥3 CORE at sequence end)` requires
simulation because sticky Cores accumulate across cascades. Analytical lower bound
using only the initial board: `P(≥3 of 36 cells CORE)` with p≈0.00645 ≈ 0.00133
(~1/750). Cascades add more Core-landing opportunities, pushing effective frequency up.
Target ~1/180–1/220 ⇒ `W_CORE` may need to rise to ~9–12, **or** cascade exposure
alone may suffice. **Must be measured before fixing `W_CORE`.**

---

## 12. Bonus: Awaken the Titan

### 12.1 Structure

- Grid: **7×7 (49 cells)** for free spins until expansion.
- Free spins counter `FS` from § 11.1; decremented after each free spin resolves.
- Each free spin = one full spin (fill + cascade sequence) using base rules with bonus
  overrides below.
- Bonus ends when `FS = 0` (and no expansion/retrigger pending). Round finalises.

### 12.2 Bonus parameter overrides — `BONUS_*` (TUNABLE_V1)

| Parameter | Base | Bonus (7×7) | Awakened (8×8) |
|---|---|---|---|
| `W_CORE` | 7 | `BONUS_W_CORE = 5` (retrigger only) | 5 |
| `HEAT_THRESHOLD` | 1200 | 1200 | `× AWAKENED_HEAT_THR_MULT = 0.85` → 1020 |
| `POWERS_PER_SEQUENCE_CAP` | 4 | 5 | 7 |
| `SHARD_BOARD_CAP` | 5 | 6 | 7 |
| `p_shardSpawn` | table | table | `× 1.5`, cap 0.16 |
| `SHIELD_CELLS` / `SHIELD_TTL` | 3 / 2 | 3 / 2 | 4 / 3 |
| `HAMMER_WILDS` | 2 | 2 | 3 |
| Blade removes | LOW | LOW | LOW + H1 (`AWAKENED_BLADE_HITS_H1 = true`) |
| Pressure tiers | table | table | CRITICAL at d≥4 (shift) |
| heat carry between free spins | n/a | `false` | `false` |

`heatCarry` between free spins is **false** (each free spin is independent) except the
one-time A4/A5 free-spin-1 carry. Cross-spin Heat persistence is R2/R8.

### 12.3 Molten Cell / Forge progression → expansion

`moltenMeter` is an integer charge counter, persistent **for the duration of the
bonus** (not across rounds). Starts at 0 (or A5 value).

Charges awarded (`MOLTEN_*`, TUNABLE_V1):

| Event | Charges |
|---|---|
| Each Forge Power triggered during a free spin | +1 |
| Each cascade sequence that reaches CRITICAL | +1 |
| Each bonus retrigger (§ 12.4) | +2 |
| Each free spin with total win ≥ `MOLTEN_BIGWIN_X = 20x` | +1 |

Expansion threshold: `MOLTEN_EXPAND_THRESHOLD_V1 = 18` charges.

On reaching threshold (tested per § 15.1 ordering):
1. Grid expands **7×7 → 8×8**, effective at the **start of the next free spin**.
   Normative cell mapping: every existing symbol keeps its `col` and its `row` index is
   **incremented by 1** (it stays the same distance from the bottom floor); the 15 new
   cells are `{ (col, 0) : col ∈ 0..7 } ∪ { (7, row) : row ∈ 0..7 }` and are created
   `EMPTY`, then filled at that spin's initial `FILL` in the § 0 draw order. Locks /
   Shards / Wilds do not carry between spins (§ 9.7) so only symbols are remapped.
2. `AWAKENED = true` permanently for the rest of the bonus.
3. `FS += AWAKENED_BONUS_SPINS_V1 = 3` (reaching 8×8 is itself rewarded).
4. `moltenMeter` is retired (no further expansion; 8×8 is terminal).

If the bonus ends (FS hits 0) before threshold, no expansion; meter discarded.

### 12.4 Retrigger

During a free spin sequence, if `C` (`CORE` count at sequence end) ≥ 3, using
`BONUS_W_CORE`:

| C | Extra FS |
|---|---|
| 3 | +4 |
| 4 | +6 |
| ≥5 | +9 |

`RETRIGGER_*` TUNABLE_V1. No hard cap on retrigger count; the max-win cap (§ 13) and
finite per-spin EV bound total bonus length in practice. `BONUS_RETRIGGER_HARD_CAP_V1
= 30` total retriggers as a compute backstop (emit diagnostic; expected never hit).

### 12.5 Awakened mode

Awakened is **not a new feature** — it is the override column in § 12.2 plus the molten
meter retiring. All mechanics are the same; they are stronger. This satisfies the
frozen "enhances the existing mechanics rather than introducing an unrelated second
feature set".

---

## 13. Max-win handling

### 13.1 Cap scope

`MAX_WIN_X_V1 = 10000`. The cap applies at **round level**: `roundWinSoFar` is the sum
of every `PayEvent` in the paid spin and all free spins.

### 13.2 Enforcement (deterministic)

After **every** `PayEvent` (cascade-loop step 4, for each cluster):

```
if roundWinSoFar + thisPay >= MAX_WIN_X:
    thisPay      = MAX_WIN_X - roundWinSoFar     # exact truncation
    roundWinSoFar = MAX_WIN_X
    emit CAP_REACHED
    HALT the round immediately:
        - no further clusters paid this step
        - no gravity, refill, merges, Heat, powers
        - remaining free spins are forfeited (FS := 0)
        - bonus (if active) ends
    RoundResult.capped = true
    finalise RoundResult
```

The truncation is exact fixed-point; `roundWinSoFar` is guaranteed `== MAX_WIN_X`.

### 13.3 Theoretical exposure above the cap

Two run modes in the simulator (`docs/04_SIMULATION_PLAN.md`):

- **Capped mode (primary, certification):** as § 13.2. Reports `P(cap)`,
  `capFrequency`, RTP-with-cap.
- **Uncapped diagnostic mode:** a *paired* second evaluation of the **same round
  substream** (`derive(masterSeed, roundIndex)`) with cap enforcement disabled — the
  round runs to natural completion and records `uncappedWin`. Because the substream is
  identical and deterministic, the two evaluations share every draw up to the cap
  point, so `uncappedWin − cappedWin` is a valid per-round quantity. Note the uncapped
  evaluation **consumes more RNG** after the cap point; it is therefore always run as
  its own pass, never inferred from a capped `RoundResult`. Aggregate `E[uncappedWin −
  cappedWin]` = "cap cost", plus the full uncapped tail. **Not** used for certified
  RTP; it quantifies what the cap hides and confirms the uncapped tail is finite.

### 13.4 Reporting

`RoundResult` carries: `cappedWin`, `capped: bool`, and in diagnostic mode
`uncappedWin`. Simulation report includes capped RTP, uncapped RTP, cap cost, and
`P(cap)` with CI.

---

## 14. Payout source attribution

Every `PayEvent` is tagged so contributions sum to total RTP. Tags:

| Tag | Meaning |
|---|---|
| `BASE_CLUSTER` | cluster paid at cascade depth 1, no Shard, no prior power this sequence |
| `CASCADE` | cluster paid at depth ≥ 2 with no feature edit responsible |
| `BLADE` | cluster paid in a cascade whose board state was last edited by a Blade this sequence |
| `HAMMER` | ditto, Hammer |
| `SHIELD` | incremental value from a locked non-consumed Shard multiplying (the `(mult-1)` portion attributable to persistence) |
| `SHARD_MULT` | the `clusterPay - pay(sym,n)` portion from non-locked Shards |
| `BONUS_BASE` | any pay during a 7×7 free spin (further sub-tagged by the above) |
| `BONUS_AWAKENED` | any pay during an 8×8 free spin |

Attribution rules (a single `PayEvent` may carry **several** `{tag, amount}` pairs
whose amounts sum to `clusterPay`; `CascadeResult.clusters[].contrib` holds this
breakdown, replacing the single `tag` field):

1. **Responsible-edit pointer.** Per sequence, maintain `responsibleEdit ∈ {none,
   BLADE, HAMMER}`. It is set to `BLADE`/`HAMMER` in step 7 when that power fires and
   stays until the other of the two fires or the sequence ends.
   **SHIELD never sets it** (Shield edits no paying board area). At depth 1 it is
   `none`.
2. **Base pay** `pay(sym, n)` is attributed to:
   - `BASE_CLUSTER` if `d == 1` and `responsibleEdit == none`;
   - `CASCADE` if `d ≥ 2` and `responsibleEdit == none`;
   - `BLADE` / `HAMMER` if `responsibleEdit` is that power.
3. **Shard increment** `clusterPay − pay(sym, n)` (only when `shardMultiplier > 1`):
   let `M = shardMultiplier` and `S` = the collected Shards. The increment is
   `pay(sym,n)·(M − 1)`. Split it across `S` **proportionally to `shardValue`**:
   Shard `s` gets `pay(sym,n)·(M − 1)·shardValue(s) / Σ_{s'∈S} shardValue(s')`
   (integer micro-units, round-half-to-even, last shard absorbs the rounding residual
   so the split is exact). Each shard's portion is tagged `SHIELD` if that shard was
   locked, else `SHARD_MULT`.
4. **Bonus wrap.** Every pay in a free spin additionally carries `BONUS_BASE` (7×7) or
   `BONUS_AWAKENED` (8×8) as a *location* tag; the "why" tags from (2)–(3) are recorded
   under it (e.g. `BONUS_AWAKENED/HAMMER`). Location tags and why-tags are reported in
   two separate partitions, each summing to total RTP.
5. **Cap clip.** If a `PayEvent` is clipped by the max-win cap (§ 13.2) or the Shard
   round cap (§ 9.6), the clip reduction is applied **pro rata** across that event's
   `{tag, amount}` pairs so every partition still sums to `cappedWin`.

Attribution is a **reporting convention**. It never changes a payout. Both the
why-partition and the location-partition sum to `cappedWin` exactly (§ 16 invariant 1).

---

## 15. Complete state-transition ordering & RNG draw order

### 15.1 Round

```
ROUND START
  roundWinSoFar = 0 ; capped = false
  PAID SPIN  -> run SPIN (grid 6x6, base params)            # roundWinSoFar accumulates
  C := CORE count at paid-spin sequence end
  if C >= 3:                                                # bonus triggered
     FS := baseSpins(C) ; AWAKENED := false
     moltenMeter := advMoltenStart(C)                       # A5 only, else 0
     pendingExpansion := false
     gridForNextSpin := 7
     spinIndex := 0
     while FS > 0 and not capped:
        if pendingExpansion: gridForNextSpin := 8 ; AWAKENED := true ; pendingExpansion := false
        forced := (spinIndex == 0) ? advForcedPowers(C) : []   # A4: [SHIELD], A5: [SHIELD,HAMMER]
        heatCarryThisSpin := (spinIndex == 0) ? advHeatCarry(C) : 0
        run SPIN (grid gridForNextSpin, bonus or awakened params, forced, heatCarryThisSpin)
        FS -= 1 ; spinIndex += 1
        # ---- ordered post-spin resolution ----
        Cr := CORE count at this free-spin sequence end
        retriggerFS := retriggerAward(Cr)                    # 0 if Cr < 3
        moltenGain := (#ForgePowers this spin, forced included)
                    + (#sequences reaching CRITICAL this spin, i.e. 0 or 1)
                    + (spinWin >= MOLTEN_BIGWIN_X ? 1 : 0)
                    + (retriggerFS > 0 ? 2 : 0)
        if not AWAKENED and moltenMeter not retired:
            moltenMeter += moltenGain
            if moltenMeter >= MOLTEN_EXPAND_THRESHOLD:
                pendingExpansion := true
                FS += AWAKENED_BONUS_SPINS
                retire moltenMeter
        FS += retriggerFS
        if retriggerCount > BONUS_RETRIGGER_HARD_CAP: emit diagnostic ; break
  finalise RoundResult (cap already enforced inline in SPIN)
ROUND END
```

Ordering notes (normative): within one free spin's post-resolution, molten charges —
**including** those from forced powers and from a retrigger that occurred this spin —
are all summed **before** the expansion-threshold test; `retriggerFS` is added to `FS`
**after** that test. Expansion takes effect at the **start of the next** free spin
(no mid-spin grid resize). Once `moltenMeter` is retired it never accrues again (8×8
is terminal, F8).

### 15.2 Spin

```
SPIN START
  init spin-start state (§ 4.1); heat = heatCarryThisSpin
  DRAW initial FILL — for col 0..W-1, for row H-1..0:
        DRAW [FILL] symbol from W_GEN ; (no shard roll on initial fill)
  SETTLE S1: resolve merges (§ 10) — no-op on initial board (no shards)
  CASCADE LOOP (§ 4.2):
     1 detect clusters on settled board (pure, § 4.6)
     2 exit loop if no cluster size >= 5
     3 depth++ ; pressureTier := tier(depth)                         (pure)
     4 pay clusters, desc base pay / row-major:                      
          per cluster: collect shards (§ 9.4); clamp (§ 9.6);
                       emit PayEvent + contrib (§ 14);
                       max-win check (§ 13.2)  <- may HALT round     (pure)
     5 accumulate Heat (pure, § 5.2)
     6 remove winners + consumed shards (pure)
     7 powersThisStep := 0
       [A4/A5 free spin 1, depth 1 only: forced Shield then forced Hammer —
        legal-target gated, SEQUENCE cap only (not step cap), powersThisStep NOT
        incremented, NO POWER_SELECT draw, NO heat cost;
        a forced BLADE (none in V1 advantages) would DRAW [POWER_BLADE_ORIENT]]
       while heat >= HEAT_THRESHOLD and powersThisStep < cap
                                    and powersThisSequence < cap:
          L := legalTargets()                                        (pure)
          if L == {} : emit POWER_NO_TARGET ; heat -= THRESHOLD ; counters++
          else:
             DRAW [POWER_SELECT] over POWER_WEIGHTS|L
             if BLADE : DRAW [POWER_BLADE_ORIENT] ; line deterministic
             if HAMMER: window + wild placement deterministic (no draw)
             if SHIELD: target cells deterministic (no draw)
             apply edit ; heat -= THRESHOLD ; counters++
     8 gravity (pure, § 4.2 step 8 algorithm — locked cells are dividers)
     9 refill: for col 0..W-1, for row H-1..0, each EMPTY non-locked cell:
             DRAW [REFILL] symbol ; then DRAW [SHARD_ROLL]
    10 decrement Shield lockTtl; expire at 0 (pure)
    11 SETTLE: resolve merges (§ 10):
          per merge pass, for the one merged column:
             DRAW [MERGE_REFILL] symbol(s) ; then DRAW [MERGE_SHARD_ROLL] each
    12 -> loop to 1
  SEQUENCE END
  pressureTier := COLD ; C := CORE count (pure) ; clear shards/wilds/locks/cores
  return spinWin, C, per-spin diagnostics
```

### 15.3 Draw-order invariants (tested)

- Within a column, fills/refills are always bottom-to-top; columns processed left to
  right.
- The shard spawn roll for a cell is drawn **immediately after** that cell's symbol
  draw, never batched later.
- Power selection is drawn only when a trigger actually fires, and before any board
  edit for that power.
- No pure step consumes RNG. If a "pure" step ever needs RNG, that is a spec bug.
- The purpose tag stream is part of the replay artifact; a replay that produces a
  different tag sequence is a determinism failure.

### 15.4 RNG abstraction

```
interface Rng {
    nextU64(): uint64          // the only primitive
}
// derived (pure, in engine, deterministic given nextU64 stream):
nextFloat()  -> [0,1)  via 53-bit mantissa construction
nextInt(n)   -> [0,n)  via Lemire's rejection method (bias-free, documented reject draw)
drawWeighted(weights[]) -> index:
    total = Σ weights            (integers)
    r     = nextInt(total)       (integer, NOT nextFloat — cross-platform exact)
    walk cumulative sum, return first index i with r < cumsum[i]
```

All selection is done with **integer** arithmetic (`nextInt`), never floating point,
so `drawWeighted` is bit-identical on every platform. `nextFloat` is used only where a
probability threshold is compared (`U() < p`); such `p` values are specified as exact
rationals and the comparison is done as `nextInt(den) < num_scaled` to stay integer
where determinism-critical (all `p_shardSpawn`, `BLADE_ORIENT_P`, etc.).

- **Simulation Rng:** a seeded, splittable, well-tested generator (candidate:
  `xoshiro256**` or PCG64; final choice recorded in DECISIONS.md). Splitting is used
  for parallel shards: `child_k = split(master, k)` so worker `k` is reproducible
  independent of worker count. This does NOT change statistical semantics because each
  round consumes an independent substream and rounds are i.i.d.
- **Production Rng:** an adapter over the operator's certified RGS/hardware RNG,
  implementing `nextU64()` only. The engine is identical. A custom PRNG is explicitly
  **not** claimed adequate for production; it is a simulation tool only.
- **Replay:** store `{configHash, profileId, masterSeed, roundIndex}` →
  reconstruct the exact substream → re-run → assert byte-identical RoundResult and
  identical purpose-tag stream.

### 15.5 RoundResult schema (immutable)

```
RoundResult {
  configHash: string
  profileId: "RTP_96" | ...
  seedInfo: { masterSeed, roundIndex }
  totalBet: fixed
  cappedWin: fixed
  capped: bool
  uncappedWin: fixed | null           # diagnostic mode only
  spins: [ SpinResult ]               # paid spin + free spins, in order
  bonus: null | {
     triggerCoreCount, freeSpinsAwarded, retriggers, reachedAwakened,
     moltenChargesFinal, awakenedAtSpinIndex | null
  }
  contributions: { <tag>: fixed }     # sums to cappedWin
  diagnostics: {
     maxCascadeDepth, totalCascades, powersByType {blade,hammer,shield},
     shardsSpawned, mergesByLevel, maxShardLevel, capReached,
     shardRoundCapHit, powerNoTarget, cascadeCapHit
  }
  rngTags: [ PurposeTag ]             # optional, replay/debug builds
}
SpinResult {
  gridW, gridH, awakened: bool
  cascades: [ CascadeResult ]
  spinWin: fixed
}
CascadeResult {
  depth, pressureTier,
  clusters: [ {
     symbol, size, basePay, shardMultiplier, paidAmount,
     contrib: [ { tag, amount } ],        # why-partition, Σ amount == paidAmount
     location: "BASE" | "BONUS_BASE" | "BONUS_AWAKENED"
  } ],
  merges: [ { fromLevel, toLevel, atCell } ],
  powers: [ { type, forced: bool, target, wildsCreated, cellsLocked, heatConsumed } ],
  heatAfter, shardCountAfter, pressureTier
}
```
(`powers` is a list because a step can, across the cap-1 rule, still record a
`POWER_NO_TARGET`; and forced powers on A4/A5 spin 1 stack with the natural check.)

The frontend consumes `RoundResult` and replays it visually. It computes nothing.

---

## 16. Invariants (must hold for every round; tested in Phase 2)

1. `Σ contributions == cappedWin` (fixed-point exact).
2. `capped ⇒ cappedWin == MAX_WIN_X` and no `PayEvent` after `CAP_REACHED`.
3. `1 ≤ shardLevel ≤ SHARD_MAX_LEVEL` always; no level-7 Shard exists.
4. `count(locked cells) ≤ SHIELD_MAX_ACTIVE` always.
5. `count(SHARD on board) ≤ SHARD_BOARD_CAP` (current mode's value) always.
6. `powersThisSequence ≤ POWERS_PER_SEQUENCE_CAP` (current mode's value).
7. `pressureTier` monotone non-decreasing within a sequence; `COLD` at each sequence
   start.
8. No cell is ever both `locked` and `EMPTY`.
9. Cascade loop terminates: every iteration either exits or removes ≥ 5 cells;
   `cascadeDepth ≤ CASCADE_DEPTH_HARD_CAP`.
10. Replaying `RoundResult.seedInfo` reproduces it byte-for-byte, including `rngTags`.
11. No state field references the previous round (round objects are freshly
    constructed; a fuzz test runs round N then round N with a fresh engine and asserts
    equality).
12. Heat, Shards, Wilds, locks, Cores = 0 / empty at every spin start (bonus included,
    except documented A4/A5 heat carry on free spin 1).

---

## 17. TUNABLE_V1 parameter register

Every value below is a hypothesis. Columns: initial value · why chosen · RTP effect ·
volatility effect · key interactions · safe tuning direction.

### 17.1 Distribution & paytable

| Param | Init | Why | RTP↑ if | Vol effect | Interactions | Safe direction |
|---|---|---|---|---|---|---|
| `W_GEN_V1` | see §3.2 | geometric ladder, LOW~68% | more HIGH weight → RTP↑ | more HIGH weight → vol↑ | feeds every mechanic | shift ≤5% mass per iteration |
| `W_CORE_V1` | 7 | ~1/750 initial-board floor | ↑ → bonus freq↑ → RTP↑ strongly | ↑ → vol↑ | dominates bonus contribution | move in ≤1 steps; re-measure bonus freq |
| `PAYTABLE_V1` | see §2.2 | ~55–60% pre-cascade contribution | scale up → RTP↑ | top buckets → vol↑ | multiplied by Shards | tune top buckets for vol, low buckets for hit-feel |
| `bucket()` flat vs interp | flat | auditability | neutral | interp smooths shelves | win-distribution shape | switch to interp only if shelves show |

### 17.2 Heat & Pressure

| Param | Init | Why | RTP↑ if | Vol effect | Interactions | Safe direction |
|---|---|---|---|---|---|---|
| `HEAT_CLASS_LOW/HIGH/WILD` | 1.0 / 1.8 / 0.5 | HIGH clusters rarer→worth more Heat; wilds damped | ↑ → powers more often → RTP↑ | ↑ → vol↑ | R2, R7 | keep WILD ≤ 0.6 |
| `HEAT_DEPTH_FACTOR` | 1/1/1.15/1.3/1.5 | reward long cascades | ↑ → RTP↑ | strong vol↑ (tail) | R6 with `heatMult` | flatten if tail too fat |
| `HEAT_THRESHOLD_V1` | 1200 | ~1 power per paying spin (est.) | ↓ → powers↑ → RTP↑ | ↓ → vol↑ | all powers | move ±100; re-measure power freq |
| `POWERS_PER_STEP_CAP` | 1 | kills Heat dump loop (R2) | ↑ → RTP↑ sharply | ↑ → vol↑ sharply | R2 | **do not raise above 1 without R2 re-analysis** |
| `POWERS_PER_SEQUENCE_CAP` | 4 / 5 / 7 | bounds per-spin feature EV | ↑ → RTP↑ | ↑ → vol↑ | R2, molten meter | ±1 |
| `PRESSURE p_shardSpawn` | §6.2 | ≤0.11 ceiling | ↑ → Shard EV↑ → RTP↑ | ↑ → vol↑ | R3, R6, board cap | keep CRITICAL ≤ 0.14 |
| `PRESSURE heatMult` | ≤1.20 | mild long-chain excitement | ↑ → RTP↑ | vol↑ tail | R6 (stacks with depth factor) | keep ≤ 1.25 |

### 17.3 Powers

| Param | Init | Why | Notes |
|---|---|---|---|
| `POWER_WEIGHTS_V1` | 40/35/25 | Blade most frequent (lowest variance), Shield rarest (highest EV risk) | shift toward Blade to reduce vol |
| `BLADE_ORIENT_P` | 0.5 | symmetry | expect no EV effect; verify |
| `BLADE_TARGET` | max_low | maximise cascade potential | weighted alt raises variance |
| `BLADE_MIN_LOW_TO_FIRE` | 3 | avoid dead Blades | ↑ → Blade rarer, higher per-event EV |
| `HAMMER_TARGET` | max_low_density | consistent clears | uniform alt = more variance |
| `HAMMER_WILDS_V1` | 2 / 3 | seed one next cluster | ↑ → RTP↑ and vol↑; R7 |
| `HAMMER_DESTROYS_SHARDS` | true | avoids Hammer-as-Shard-farm ambiguity | flipping to false is player-friendlier but needs R4 re-analysis |
| `SHIELD_CELLS_V1` | 3 / 4 | modest protection | ↑ → Shield EV↑ fast; R5 |
| `SHIELD_TTL_V1` | 2 / 3 | short persistence | ↑ → R5 severity↑ |
| `SHIELD_MAX_ACTIVE` | 4 | prevent board ossification | keep ≤ ~30% of grid |
| `SHIELD_WILD_WEIGHT` | 6 | Shards prioritised over Wilds | tuning only |

### 17.4 Shards & merge

| Param | Init | Why | Notes |
|---|---|---|---|
| `SHARD spawn level` | always 1 (2x) | merge is sole path to big mult | do not change without R3 re-analysis |
| `SHARD_BOARD_CAP_V1` | 5 / 6 / 7 | primary structural variance bound | ↑ → vol↑ strongly; single most sensitive vol knob |
| `SHARD_MULT_CLUSTER_CAP` | 64 | one 64x Shard max per cluster | matches `SHARD_MAX_LEVEL` |
| `SHARD_MULT_STEP_CAP` | 128 | ≤ two 64x contributions | backstop |
| `SHARD_MULT_ROUND_CAP` | 5000x | half the max-win, below cap | backstop; expect rarely hit |
| `SHARD_MAX_LEVEL_V1` | 6 (64x) | frozen text: >64 not assumed safe | raising to 7 requires explicit sim sign-off + DECISIONS entry |
| `p_shard` sum vs product | **sum** | sub-exponential in #adjacent shards | product is R3/R6; do not switch |
| `MERGE_PASS_CAP` | 8 | > any realistic chain | compute backstop |
| `COLUMN_PULL_MAX_GAP` | 5 | full column | OVERHEAT+ only |

### 17.5 Core / bonus

| Param | Init | Why | Notes |
|---|---|---|---|
| `FS` 8 / 10 / 12 | frozen V1 counts | — | not tunable without human approval (frozen) |
| `ADV_A4` | heat 50% + forced Shield | accelerate existing systems | EV modest, attributable to Shield/Heat |
| `ADV_A5` | A4 + molten start 4 + forced Hammer | stronger | scales with C≥6 |
| `ADV_A5_MOLTEN_START` | 4 | ~22% of expand threshold | ↑ → faster Awakened → RTP↑ + vol↑ |
| `BONUS_W_CORE` | 5 | retrigger only, slightly rarer | ↑ → longer bonuses → RTP↑ |
| `MOLTEN_EXPAND_THRESHOLD_V1` | 18 | ~reachable in a strong 8–10 spin bonus, not a weak one | ↓ → Awakened freq↑ → RTP↑ + vol↑; single biggest bonus-vol knob |
| `MOLTEN` charge values | §12.3 | Power & CRITICAL are the "earned" signals | tuning only |
| `MOLTEN_BIGWIN_X` | 20x | rewards a good spin | ↓ → meter faster |
| `AWAKENED_BONUS_SPINS_V1` | 3 | reward reaching 8x8 | ↑ → RTP↑ |
| `RETRIGGER` +4/+6/+9 | modest | keep bonus length controlled | ↑ → RTP↑ + tail↑ |
| `BONUS_RETRIGGER_HARD_CAP` | 30 | compute backstop | not a game knob |

### 17.6 Awakened overrides

| Param | Init | Why | Notes |
|---|---|---|---|
| `AWAKENED_SHARD_MULT_V1` | 1.5 (cap 0.16) | more Shard action in the peak state | R6 |
| `AWAKENED_HEAT_THR_MULT` | 0.85 | more powers | ↑ powers → RTP↑, vol↑ |
| `AWAKENED_BLADE_HITS_H1` | true | "stronger Blade" | measurable Blade EV bump |
| `AWAKENED` Pressure shift | CRITICAL at d≥4 | "modified Pressure" | compresses tail escalation |
| `SHARD_BOARD_CAP` awakened | 7 | more merge potential | strongest Awakened vol lever |

### 17.7 Caps & safety

| Param | Init | Why | Notes |
|---|---|---|---|
| `MAX_WIN_X_V1` | 10000 | product goal | revisable on evidence; DECISIONS entry required |
| `CASCADE_DEPTH_HARD_CAP` | 40 | compute + design-error catch | not a game knob; if legitimately approached, that is a finding |
| `MERGE_PASS_CAP` | 8 | see §10.3 | — |
| fixed-point unit | 1e-6 x | cross-platform determinism | never use float for sums |

---

## 18. Known open modelling questions (do not block simulator build)

1. Flat buckets vs. interpolation — decide from win-distribution shelves.
2. Per-column `W_GEN` — only if base variance needs shaping.
3. `POWER_NO_TARGET` handling — waste vs. small Heat refund.
4. Whether A5 advantage should scale continuously with C or step at 5/6/7+.
5. Whether `SHARD_MAX_LEVEL` may rise to 7 in Awakened only.
6. Multi-wild assignment tie-break edge cases on 8×8 (large components) — property
   test coverage.

These are recorded so Phase 2 tracks them; none prevents a first simulator pass.

---

## 19. Parameter classification (complete)

Every number that appears anywhere in the math model, classified. **FROZEN** = fixed by
`01_GAME_DESIGN_FROZEN.md`, human approval required to change. **TUNABLE_V1** = a
hypothesis to be fitted by simulation (all listed in § 17 with tuning notes).
**DERIVED** = computed from other values or an implementation constant, not an
independent knob.

### 19.1 FROZEN

| Value | Where |
|---|---|
| Grid 6×6 base; 7×7 bonus start; 8×8 bonus terminal | F1, F8 |
| Minimum winning cluster size = 5 | F1 |
| Orthogonal adjacency (4-neighbourhood) | F1 |
| Symbol taxonomy: 4 LOW + 4 HIGH + 1 CORE + Shard system | F2 |
| Number of Forge Powers = 3 (Blade, Hammer, Shield) with their stated identities | F4 |
| Number of Pressure states = 5 (COLD/WARM/HOT/OVERHEAT/CRITICAL); resets at sequence end | F5 |
| Merge ladder shape: equal + equal → next level, values 2→4→8→16→32→64 | F6 |
| Bonus trigger tiers: 3 / 4 / 5+ Cores | F7 |
| Free-spin counts: 8 / 10 / 12 | F7 |
| Bonus expansion path: 7×7 → 8×8, single terminal expansion | F8 |
| Max-win **enforcement** is mandatory and deterministic | F9 |
| Max-win **target** 10,000× — frozen as a target, revisable only by explicit product decision (R9) | F9 |

### 19.2 TUNABLE_V1 (see § 17 for full tuning notes)

Distribution/paytable: `W_GEN_V1` (8 symbol weights), `W_CORE_V1`, `PAYTABLE_V1`
(8×13 matrix), size-bucket boundaries, flat-vs-interpolated pay lookup.
Heat: `HEAT_CLASS_LOW/HIGH/WILD`, `HEAT_DEPTH_FACTOR` (4 breakpoints + 4 values),
`HEAT_THRESHOLD_V1`, `POWERS_PER_STEP_CAP`, `POWERS_PER_SEQUENCE_CAP` (×3 modes).
Pressure: depth→tier thresholds (base + Awakened), `p_shardSpawn` (×5), `heatMult`
(×5), `COLUMN_PULL_MAX_GAP`, column-pull enable tiers.
Powers: `POWER_WEIGHTS_V1` (3), `BLADE_ORIENT_P`, `BLADE_TARGET` mode,
`BLADE_MIN_LOW_TO_FIRE`, `HAMMER_TARGET` mode, `HAMMER_WILDS_V1` (×2 modes),
`HAMMER_DESTROYS_SHARDS`, `SHIELD_CELLS_V1` (×2), `SHIELD_TTL_V1` (×2),
`SHIELD_MAX_ACTIVE`, `SHIELD_WILD_WEIGHT`.
Shards: `SHARD_BOARD_CAP_V1` (×3 modes), `SHARD_MULT_CLUSTER_CAP`,
`SHARD_MULT_STEP_CAP`, `SHARD_MULT_ROUND_CAP`, `SHARD_MAX_LEVEL_V1`, sum-vs-product
(fixed to sum), `MERGE_PASS_CAP`.
Core/bonus: `ADV_A4` components, `ADV_A5_MOLTEN_START`, `ADV_A5_SCALES`, `BONUS_W_CORE`,
`MOLTEN_EXPAND_THRESHOLD_V1`, the 4 molten charge values, `MOLTEN_BIGWIN_X`,
`AWAKENED_BONUS_SPINS_V1`, `RETRIGGER` awards (3), `BONUS_RETRIGGER_HARD_CAP`.
Awakened: `AWAKENED_SHARD_MULT_V1` (+cap), `AWAKENED_HEAT_THR_MULT`,
`AWAKENED_BLADE_HITS_H1`, Awakened Pressure shift, Awakened `SHARD_BOARD_CAP`.
Safety: `CASCADE_DEPTH_HARD_CAP`.
Profiles (`05_MATH_PROFILE_ARCHITECTURE.md`): `W_CORE_BASE` (per profile — this is the
per-profile value of `W_CORE_V1`), `PAYTABLE_MID_SCALE`, per-profile
`MOLTEN_EXPAND_THRESHOLD`, per-profile `BONUS_W_CORE`, all § 7 comparison tolerances.

### 19.3 DERIVED (not independent knobs)

| Value | Derivation |
|---|---|
| `shardValue = 2^shardLevel` | from `shardLevel` |
| `P(CORE per cell) ≈ 0.00645` | from `W_GEN_V1` normalisation |
| number of new cells on expansion = 15 | `8² − 7²` |
| `bucket(n)` mapping | from the bucket boundaries |
| fixed-point money unit `1x = 1_000_000 µ` | implementation constant (determinism) |
| Heat centi-unit `1.0 Heat = 100` | implementation constant |
| `heatCarry` (A4) `= HEAT_THRESHOLD × 0.5` | from `HEAT_THRESHOLD` and the `0.5` (TUNABLE via `ADV_A4`) |
| combined depth multiplier `1.8` at d≥5 | `HEAT_DEPTH_FACTOR(≥5) × heatMult(CRITICAL)` |
| `MAX_WIN_X` in µ = `10000 × 1_000_000` | from the target |
| `effClassW` | per-cell average of `HEAT_CLASS_*` |
| all CI / sample-size numbers in `04` | from measured variance (post-simulation) |

**Rule:** if a reviewer finds a number in any doc not covered by 19.1–19.3, that is a
spec defect — classify it or remove it.
