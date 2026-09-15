# 03 — MATH RISK REGISTER

Adversarial review of the V1 model in `docs/02_MATH_SPEC.md`. Each risk uses the
mandated format. Severity: **CRITICAL** (can break RTP validation or produce unbounded
exposure) · **HIGH** (large, hard-to-tune EV or a plausible exploit) · **MEDIUM**
(distortion or bias, tunable) · **LOW** (cosmetic / diagnostic).

"Requires frozen-rule change?" — if **YES**, the mitigation cannot be applied without a
human approval line in `docs/DECISIONS.md`.

---

## R1 — Runaway cascade loop

- **PROBLEM:** Cascade + Blade + Hammer all inject fresh symbols mid-sequence. If the
  refill distribution plus Wild creation makes `P(new winning cluster | refill)` high
  enough, a sequence may not terminate in practical time, or its length distribution
  may have no usable mean.
- **WHY IT MATTERS:** Non-terminating or extreme-length sequences make RTP integrals
  diverge in the model and make 100M-round simulation computationally infeasible; also
  a design-intent failure (the game would feel broken).
- **SEVERITY:** HIGH (mitigated by construction; must be verified).
- **RECOMMENDED SOLUTION:** (a) `CASCADE_DEPTH_HARD_CAP` (§4.5) as a compute backstop —
  but if it is *ever* approached in legitimate sim, treat as a finding, not a fix.
  (b) Keep `W_GEN` HIGH mass ≤ ~32% and `HAMMER_WILDS ≤ 3` so post-refill cluster
  probability stays well below the sub-critical branching threshold. (c) Measure the
  empirical branching factor `b = E[cells removed at depth d+1] / E[cells present]`;
  require `b < 0.6` at every depth in 10M-round runs. (d) Sticky Cores (§3.3) provide
  mild negative feedback (shrinking playable area) — keep that property.
- **REQUIRES FROZEN-RULE CHANGE?** NO (caps and weights are tunable; cascade-to-
  exhaustion stays).

---

## R2 — Heat / Forge Power positive-feedback explosion

- **PROBLEM:** Powers create board edits → edits create cascades → cascades create
  Heat → Heat creates more powers. If powers could fire multiple times per step or
  Heat carried between spins, EV could compound without bound.
- **WHY IT MATTERS:** This is the classic slot-feature blow-up. It would concentrate
  RTP into an untunable tail and defeat profile separation.
- **SEVERITY:** CRITICAL (design-defining; the controls below are load-bearing).
- **RECOMMENDED SOLUTION:** (a) `POWERS_PER_STEP_CAP = 1` — a step can trigger at most
  one power regardless of Heat surplus; surplus only matters *if another step exists*,
  tying power count to cascade continuation (self-limiting). (b)
  `POWERS_PER_SEQUENCE_CAP = 4/5/7` hard ceiling. (c) Blade/Hammer generate **no
  direct Heat**; Hammer's Wilds generate **reduced** Heat (`HEAT_CLASS_WILD = 0.5`).
  (d) Heat does **not** persist between spins (except the one-shot A4/A5 free-spin-1
  carry, which is a fixed constant, not a loop). (e) Simulation must report
  `powersByType` distribution and its correlation with `maxCascadeDepth`; a heavy
  right tail in powers-per-sequence is a red flag.
- **REQUIRES FROZEN-RULE CHANGE?** NO (Heat formula and trigger mechanism are
  explicitly not frozen; these are the designed mechanism).

---

## R3 — Shard exponential growth

- **PROBLEM:** The merge ladder is geometric (2→4→…→64). If Shards spawn fast, merge
  freely, and multipliers combined **multiplicatively**, adjacent-Shard interactions
  would be doubly exponential.
- **WHY IT MATTERS:** A single lucky board could produce a payout far above 10,000x in
  the uncapped model, making the cap the dominant RTP term and destroying tunability.
- **SEVERITY:** CRITICAL.
- **RECOMMENDED SOLUTION:** (a) Multiplier combination is **additive in value**
  (`Σ shardValue`), not multiplicative — a cluster touching four Shards of 2/4/8/16
  pays ×30, not ×1024. (b) `SHARD_BOARD_CAP = 5/6/7` bounds how many Shards can
  coexist, hence how many can merge or touch one cluster. (c) Spawns are always level 1
  — the only route to high value is repeated merges, each of which *reduces* Shard
  count by 1 (consuming board-cap headroom). (d) `SHARD_MAX_LEVEL = 6`; level 7 blocked
  pending sim. (e) Per-cluster / per-step / per-round multiplier caps (§9.6). (f)
  Simulation reports `mergesByLevel` and `maxShardLevel` histograms; `P(level 6
  reached)` and its payout attribution must be a small, stable fraction.
- **REQUIRES FROZEN-RULE CHANGE?** NO (merge *ladder* is frozen; spawn rate,
  combination rule, caps and max level are not).

---

## R4 — Hammer + Shard interaction ambiguity / farming

- **PROBLEM:** Hammer destroys a 3×3 region. Does it destroy Shards? If it doesn't, a
  region can accumulate protected Shards; if it does, players "lose" multipliers to
  their own feature, which feels bad and creates a Shield/Hammer edge case.
- **WHY IT MATTERS:** Ambiguous board state (forbidden by F6) and a potential EV sink
  or farm depending on resolution.
- **SEVERITY:** MEDIUM.
- **RECOMMENDED SOLUTION:** V1 rule: `HAMMER_DESTROYS_SHARDS = true`, **except locked
  Shards** (Shield protects them — consistent with Shield's identity). This is
  unambiguous and prevents a "Hammer never touches my stack" farm. The feels-bad angle
  is limited because base Shards are only 2x and Hammer targets max-LOW-density windows
  (where high Shards are less likely to sit). Track `shardsDestroyedByHammer` in sim;
  if it materially suppresses Shard contribution, revisit (flip to false + re-run R3).
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R5 — Shield state-persistence exploit (Shield + Shard)

- **PROBLEM:** A locked Shard that is **not consumed** when it multiplies (§8.2) can
  multiply clusters on multiple cascade steps. Combined with high Shard level, long
  lock, or re-locking, this is a strong, compounding positive-EV state.
- **WHY IT MATTERS:** Shield's whole identity is "preserve value through cascades," so
  the mechanic *must* have persistence — but persistence of a multiplier is exactly
  what blows up tails.
- **SEVERITY:** HIGH.
- **RECOMMENDED SOLUTION:** (a) `SHIELD_TTL = 2` (3 Awakened) — at most 2–3 steps of
  persistence. (b) A locked Shard multiplies **at most once per cascade step**
  ("used this step" flag). (c) A locked Shard **cannot merge** while locked (no
  Shield→Merge→bigger→still-locked chain). (d) `SHIELD_MAX_ACTIVE = 4` and a cell
  cannot be re-locked to extend its TTL (a fresh Shield picks *other* valuable cells
  first; if it must re-target a locked cell, TTL is not extended — it is set to
  `max(current, new)` which for equal TTLs is a no-op). (e) Attribute the locked-Shard
  incremental value to the `SHIELD` tag so its RTP contribution is measured in
  isolation and can be tuned via `POWER_WEIGHTS` (lower Shield weight) or
  `SHIELD_CELLS`/`TTL`. (f) Sim invariant: `count(locked) ≤ SHIELD_MAX_ACTIVE` every
  step.
- **REQUIRES FROZEN-RULE CHANGE?** NO (Shield persistence is the frozen identity; its
  *magnitude* is tunable).

---

## R6 — Pressure + Shard (and Pressure + Heat) feedback

- **PROBLEM:** Higher Pressure raises Shard spawn probability **and** Heat gain. Deeper
  cascades raise Pressure. More Shards / more Heat → more powers → more cascades →
  deeper → higher Pressure. Two reinforcing paths.
- **WHY IT MATTERS:** Even without a hard loop, mild reinforcement fattens the tail in
  a way that is hard to attribute and tune per profile.
- **SEVERITY:** HIGH.
- **RECOMMENDED SOLUTION:** (a) Pressure effects are all **bounded and
  non-compounding**: `p_shardSpawn ≤ 0.11` (0.16 Awakened), `heatMult ≤ 1.20`, and
  neither feeds back into Pressure (Pressure depends *only* on cascade depth, which is
  a count, not an EV quantity). (b) `SHARD_BOARD_CAP` caps the Shard path regardless of
  spawn probability. (c) `POWERS_PER_STEP_CAP = 1` caps the Heat path. (d) Keep
  `HEAT_DEPTH_FACTOR` (max 1.5) and `heatMult` (max 1.20) as *separate* knobs so the
  combined depth multiplier (max 1.8 at d≥5) can be tuned down without touching Shard
  behaviour. (e) Simulation: plot RTP contribution vs `maxCascadeDepth` bucket; the
  curve must be concave / bounded, not convex/explosive. Define acceptance:
  contribution from depth ≥ 8 must be < ~8% of total RTP (tunable target).
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R7 — Hammer + Wild feedback

- **PROBLEM:** Hammer makes Wilds; Wilds join clusters; clusters make Heat; Heat can
  make another Hammer; more Wilds…
- **WHY IT MATTERS:** Same family as R2 but specific to the Wild-creation path, which
  also directly raises win size (Wilds enlarge clusters and enable HIGH-symbol wins).
- **SEVERITY:** MEDIUM (bounded by R2 controls, but worth its own line).
- **RECOMMENDED SOLUTION:** (a) Wilds contribute Heat at `HEAT_CLASS_WILD = 0.5`
  (a cluster made mostly of Wilds generates little Heat). (b) Hammer creates a **fixed
  small** number of Wilds (2, 3 Awakened) — not scaling with anything. (c) Wilds are
  removed when their cluster pays (not sticky) unless Shielded, so they do not
  accumulate. (d) `POWERS_PER_SEQUENCE_CAP` bounds total Hammers per spin. (e) Sim:
  track `wildsCreated` per sequence and `P(≥2 Hammers in one sequence)`.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R8 — Bonus expansion feedback & cross-spin state leakage

- **PROBLEM:** In the bonus, if Shards/Heat/Wilds persisted between free spins, or if
  molten charges were awarded by an event that expansion itself makes more frequent,
  the run to 8×8 could self-accelerate; and Awakened mode further boosts the very
  things that filled the meter.
- **WHY IT MATTERS:** Bonus contribution (~30% of RTP) would become unstable and
  profile-divergent.
- **SEVERITY:** HIGH.
- **RECOMMENDED SOLUTION:** (a) No cross-spin persistence of Shards/Heat/Wilds/locks in
  the bonus (`SHARD_PERSIST_SPINS = false`); each free spin starts clean (except the
  one-shot A4/A5 carry). (b) `moltenMeter` is the *only* bonus-persistent counter and
  it is monotone with a fixed threshold and then **retired** at 8×8 (no second
  expansion — 8×8 is terminal, per F8). (c) Awakened boosts are fixed multipliers /
  offsets, not feedback terms. (d) Molten charges come from Powers, CRITICAL, retrigger
  and big-win — all bounded per spin. (e) Sim: measure `P(reach Awakened | bonus)`,
  spins-to-Awakened distribution, and Awakened vs pre-Awakened RTP-per-spin; the ratio
  should be a stable, moderate number (target ~1.4–2.0x, tunable), not runaway.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R9 — Excessive tail concentration / max-win cap bias

- **PROBLEM:** If a large share of RTP sits above the 10,000x cap in the uncapped
  model, then (a) the cap is doing heavy lifting and small model changes cause large
  capped-RTP swings, and (b) capped simulation systematically under-observes the true
  model, biasing convergence diagnostics.
- **WHY IT MATTERS:** Certification needs the capped RTP to be *stable* and the cap to
  be a rare event, not a primary RTP regulator.
- **SEVERITY:** HIGH.
- **RECOMMENDED SOLUTION:** (a) Target `P(cap) ≲ 1 in 100,000–500,000 rounds` and
  "cap cost" (RTP removed by the cap) `≲ 0.5%` absolute. (b) Run **both** capped and
  uncapped diagnostic modes (§13.3); report cap cost with CI. (c) If cap cost > ~1%,
  that is a finding — reduce upstream tail (lower `HEAT_DEPTH_FACTOR`,
  `SHARD_BOARD_CAP`, `MOLTEN` acceleration) rather than leaning on the cap. (d) Never
  tune paytable/weights to hit target RTP *while* cap cost is large — fix the tail
  first. (e) Convergence diagnostics use the **capped** series (that is what ships) but
  are cross-checked against uncapped for tail sanity.
- **REQUIRES FROZEN-RULE CHANGE?** Possibly. If simulation shows the frozen mechanic
  interactions genuinely cannot deliver a healthy game at a 10,000x cap (e.g. cap cost
  structurally > 2%), the recommendation is to revisit `MAX_WIN_X` (the product doc
  already flags it as revisable) — that is a **product decision**, recorded in
  DECISIONS.md, not a silent change.

---

## R10 — Mathematically dead features

- **PROBLEM:** A feature (candidate: Shield, or Blade in the base game, or column-pull
  merges) may contribute so little RTP / occur so rarely that it is decorative — cost
  without value, and a certification reviewer will ask why it exists.
- **WHY IT MATTERS:** Wasted complexity, and it dilutes the "understandable mechanics"
  pillar.
- **SEVERITY:** MEDIUM.
- **RECOMMENDED SOLUTION:** Define a minimum-contribution acceptance bar per feature
  (e.g. each of Blade/Hammer/Shield ≥ 2% of total RTP and triggers in ≥ 1 in 40
  paying rounds; Shard contribution ≥ 6%). Measure at 10M rounds. If a feature is
  below bar, tune via `POWER_WEIGHTS`, `HEAT_THRESHOLD`, or the feature's own strength
  params — not by adding new sub-mechanics. Column-pull merges are explicitly allowed
  to be rare (they are flavour on an already-valuable mechanic) but must be > 0.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R11 — Features whose EV is too large to tune independently

- **PROBLEM:** If two features' EVs are strongly coupled (e.g. Shield only matters
  because Shards exist, and Shard EV depends on Pressure which depends on cascade depth
  which Blade/Hammer drive), moving one parameter moves several contributions at once,
  and no profile can be balanced without iterating the whole system.
- **WHY IT MATTERS:** Profile architecture (§05) needs *mostly independent* levers.
- **SEVERITY:** HIGH.
- **RECOMMENDED SOLUTION:** (a) Establish a **lever map** (in `05_MATH_PROFILE_
  ARCHITECTURE.md`): each profile-tuning parameter is assigned a *primary* contribution
  it moves and its *cross-effects* are documented and measured (Jacobian estimate from
  small sim sweeps). (b) Prefer levers with localised effect: `W_CORE` (bonus freq),
  `PAYTABLE` low buckets (base hit RTP), `MOLTEN_EXPAND_THRESHOLD` (Awakened freq).
  (c) Avoid using `HEAT_DEPTH_FACTOR` / `p_shardSpawn` as primary profile levers —
  they have wide cross-effects; keep them fixed across profiles where possible so the
  volatility identity is preserved (product requirement). (d) Sim tooling: a
  "parameter sensitivity" report that perturbs each lever ±10% and reports the delta
  on every contribution tag.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R12 — Ambiguous merge resolution

- **PROBLEM:** Multiple simultaneous mergeable pairs; chain merges; a merge that frees
  a cell whose refill creates a new mergeable pair; column-pull vs orthogonal
  priority. Any non-total ordering ⇒ non-deterministic board (violates F6).
- **WHY IT MATTERS:** Determinism and replay are mandatory.
- **SEVERITY:** CRITICAL (for correctness, not for EV).
- **RECOMMENDED SOLUTION:** §10.3 defines a **total order**: one pair per pass, sorted
  by (desc level, row-major lower cell, row-major other cell); local gravity+refill
  after each merge; repeat up to `MERGE_PASS_CAP`. Orthogonal and column-pull pairs
  are in the same sorted list (orthogonal is just gap = adjacent). Property tests:
  (i) permuting internal data-structure order does not change the result; (ii) a
  hand-built board with 3 simultaneous pairs resolves to the spec-predicted state;
  (iii) chain-merge board resolves upward; (iv) no infinite pass loop.
- **REQUIRES FROZEN-RULE CHANGE?** NO (adds precision under the frozen merge mechanic).

---

## R13 — Impossible board states

- **PROBLEM:** Locked + EMPTY, Shard level 0 or 7, Wild adjacent to nothing but still
  "in" a cluster, Core inside a cluster, more locked cells than `SHIELD_MAX_ACTIVE`,
  Shard count over cap after a spawn-during-merge, negative Heat.
- **WHY IT MATTERS:** Any of these breaks invariants and likely RTP accounting.
- **SEVERITY:** HIGH.
- **RECOMMENDED SOLUTION:** Enforce the §16 invariants as runtime assertions in
  simulation builds (compiled out in production if needed for speed, but run in every
  CI sim). Add a "board validator" called after every cascade-loop step that checks
  all invariants; any violation aborts the run with the seed for repro. Spawn-during-
  merge respects the board cap check (§10.3 note).
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R14 — Simulation bias

- **PROBLEM:** Sources: (a) capped-only sampling (R9); (b) early-termination of "boring"
  rounds skipping RNG draws and desynchronising substreams; (c) importance-sampling or
  "bonus-forcing" test modes leaking into headline RTP; (d) using `float` sums so
  platform rounding differs; (e) discarding rounds that hit a compute backstop.
- **WHY IT MATTERS:** A biased estimator can show 96.00% while the true model is 95.6%
  or 96.5%.
- **SEVERITY:** CRITICAL.
- **RECOMMENDED SOLUTION:** (a) Every round consumes RNG only through the specified
  ordered draws; no "skip because no win" shortcut — the loop already exits cleanly
  with zero extra draws. (b) Each round uses an **independent substream**
  (`split(master, roundIndex)`), so parallelism and per-round early exit cannot
  desync anything. (c) Test/forcing modes produce a separate report section, never the
  certified number; certified runs use the unmodified engine. (d) Fixed-point integer
  accumulation everywhere (§4.4). (e) Backstop-hit rounds are **included** at their
  actual (capped/backstopped) value and counted separately; if they are more than a
  handful per 100M, that is a finding. (f) Report the estimator, its variance, and the
  CI method explicitly (§04).
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R15 — RNG consumption-order bugs

- **PROBLEM:** If the shard-spawn roll is sometimes drawn before and sometimes after
  the symbol draw, or columns are processed in a data-dependent order, or a power
  selection is drawn even when no power fires, replay breaks and two "identical"
  configs diverge.
- **WHY IT MATTERS:** Breaks F11 and every replay/audit guarantee.
- **SEVERITY:** CRITICAL.
- **RECOMMENDED SOLUTION:** §15.2/§15.3 fix the exact order and a **purpose-tag
  stream**. Debug builds record every draw's purpose tag; a replay must reproduce the
  identical tag sequence, not just the final result (a matching result with a
  different tag stream means a latent order bug that will bite a later change).
  Property test: run a round, mutate an unrelated config field that should not affect
  this round, assert identical tag stream. CI gate on determinism across OS/arch.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R16 — Max-win cap bias in accounting

- **PROBLEM:** When the cap truncates mid-round, the "lost" theoretical value must be
  accounted somewhere or RTP-vs-model comparisons are meaningless; also, truncating to
  exactly the cap vs. "pay the full last cluster then stop" gives different capped RTP.
- **WHY IT MATTERS:** Certification compares theoretical RTP (model) to observed;
  inconsistent cap accounting makes them incomparable.
- **SEVERITY:** MEDIUM.
- **RECOMMENDED SOLUTION:** §13.2 truncates to **exactly** `MAX_WIN_X` (last pay is
  clipped). Uncapped diagnostic mode (§13.3) records the untruncated value; the
  difference is the reported "cap cost". Theoretical RTP for the model is quoted **two
  ways** (capped / uncapped) and both appear in the certification pack. Never quote
  only one.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R17 — RTP profile divergence

- **PROBLEM:** The five profiles are supposed to share a volatility identity and
  feature behaviour, differing only by explicit parameters. If the chosen levers have
  broad cross-effects (R11), the 92% profile might end up with noticeably different
  hit frequency, bonus frequency, or tail shape than the 96% — effectively a different
  game, requiring far more validation and risking player-perception / fairness
  complaints.
- **WHY IT MATTERS:** Commercial and certification cost; the product brief explicitly
  wants identity preserved across profiles "where reasonably possible".
- **SEVERITY:** HIGH.
- **RECOMMENDED SOLUTION:** See `05_MATH_PROFILE_ARCHITECTURE.md`. Principle: move RTP
  primarily through a **small set of mid-frequency levers** (bonus trigger rate via
  `W_CORE`, a modest global scale on mid paytable buckets, Awakened frequency via
  `MOLTEN_EXPAND_THRESHOLD`) and hold the extreme-tail mechanics (Shard caps, Heat
  depth factor, merge ladder) **constant** across profiles. Then measure and publish a
  profile-comparison table (hit freq, bonus freq, P(win>100x), P(cap), skew, kurtosis)
  and require them to sit within stated tolerances of the 96% reference.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R18 — State leakage between rounds

- **PROBLEM:** Any static/singleton/module-level mutable state (RNG position, cached
  board buffers, Heat, molten meter, `powersThisSequence`, object pools) carried from
  round N into round N+1.
- **WHY IT MATTERS:** Destroys determinism and makes RTP order-dependent — a
  catastrophic, hard-to-spot certification failure.
- **SEVERITY:** CRITICAL.
- **RECOMMENDED SOLUTION:** (a) The engine is a pure function
  `resolveRound(config, profile, rng) -> RoundResult` with **no** static mutable
  state. (b) All per-round state lives in a freshly allocated context object. (c)
  Object pools, if used for performance, are reset by explicit clear, and a debug mode
  fills freed memory with a poison value. (d) Property test: `resolveRound` for a
  fixed substream gives the same result whether it is the 1st or the 1,000,000th call
  on a reused engine instance. (e) Parallel workers each own their engine + substream.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R19 — Bonus retrigger problems

- **PROBLEM:** Unbounded retriggers; retrigger during the forced A4/A5 first spin;
  retrigger interacting with the expansion spin (grid changing size mid-award);
  retrigger Cores counted while old Cores from a prior free spin still on board
  (they should be cleared at sequence end — verify).
- **WHY IT MATTERS:** Bonus length variance and a possible slow blow-up of bonus RTP.
- **SEVERITY:** MEDIUM.
- **RECOMMENDED SOLUTION:** (a) Cores cleared at every sequence end (§4.3) — retrigger
  count is per free spin, fresh. (b) `BONUS_RETRIGGER_HARD_CAP = 30` compute backstop;
  expected never hit — if it is, finding. (c) Expansion is applied at the **start of
  the next free spin** (§12.3) so no grid resize occurs mid-spin. (d) Retrigger on the
  forced first spin is allowed and just adds FS. (e) Sim: bonus-length distribution,
  `E[FS total | bonus]`, `P(FS total ≥ 40)`, retrigger count histogram.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R20 — Computational performance at 100M+ rounds

- **PROBLEM:** Cluster flood-fill, multi-wild assignment (O(cells²)), per-cell shard
  rolls, board validation asserts, and RoundResult allocation per round. At 100M
  rounds × (avg ~3 cascades + occasional deep sequences + ~1/200 bonuses of ~10
  spins), naive code could take days and balloon memory.
- **WHY IT MATTERS:** Convergence at the tail (P(win>5000x), P(cap)) needs 100M–1B
  rounds; if a run takes a week, tuning iteration dies.
- **SEVERITY:** MEDIUM (engineering, but it blocks the statistical plan).
- **RECOMMENDED SOLUTION:** (a) Headless engine with no allocation in the hot path
  (reused buffers per worker, cleared per round). (b) `RoundResult` in full detail only
  when requested; a "counters-only" mode for large runs that accumulates the statistics
  in §04 without materialising per-round structs. (c) Embarrassingly parallel over
  `roundIndex` ranges with `split(master, k)`; near-linear scaling. (d) Board ops on
  fixed-size integer arrays / bitboards where possible (64 cells fits a `u64` per
  symbol layer). (e) Validation asserts behind a compile flag: on in CI + a 10M
  sample, off in the 100M+ certified throughput run (with a separate seeded 10M
  validated run proving the engine is clean at those seeds). (f) Target ≥ 1M
  rounds/sec/core for counters-only mode; budget and measure early.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R21 — Multi-wild cluster assignment producing non-obvious or unstable pays

- **PROBLEM:** Wild blobs sitting between different-symbol regions must be resolved to
  one symbol. On complex 8×8 boards the resolution could be hard to explain to a
  certifier or sensitive to processing order. Also: wilds *bridge* same-symbol regions
  (frozen F1) — a spec that fails to bridge under-pays; one that over-bridges (through
  a contested blob it should have lost) over-pays.
- **WHY IT MATTERS:** "Every state transition unambiguous"; certifier scrutiny; direct
  EV impact.
- **SEVERITY:** MEDIUM (was under-specified; § 4.6 rewrite of 2026-09-02 addresses it —
  see DECISIONS item A).
- **RECOMMENDED SOLUTION:** § 4.6 now: (1) build per-symbol super-graphs where wild
  blobs bridge same-symbol components; (2) resolve each *contested* blob (in one
  symbol's cluster for >1 symbol) in row-major blob order by largest marginal pay gain,
  with a full tie-break chain (resulting size → symbol index → anchor); (3) recompute
  final clusters. Deterministic by construction. Verification: property tests on
  hand-built contested-blob and chain-bridge boards with pay derived from the spec;
  a fuzz test that permutes internal iteration order and asserts identical clusters;
  a local-optimality check (no single contested-blob reassignment raises total pay).
- **REQUIRES FROZEN-RULE CHANGE?** NO — the rewrite conforms § 4.6 to frozen F1.

---

## R22 — Fixed-point / rounding drift

- **PROBLEM:** `shardMultiplier` and `HEAT_DEPTH_FACTOR` are non-integer; a cluster pay
  × 1.5 × 30 must be exact and identical on every platform.
- **WHY IT MATTERS:** Determinism (F11); summed over 100M rounds, tiny drift shifts
  observed RTP.
- **SEVERITY:** MEDIUM.
- **RECOMMENDED SOLUTION:** All monetary values in integer micro-units (`1x =
  1_000_000`). All multipliers expressed as integer numerator/denominator (`1.5 =
  3/2`, factors chosen from a small rational set). Pay = `basePay_micro * num / den`
  with a documented rounding rule (round half to even) applied once, at the cluster
  level. Heat in integer centi-units. No `double` anywhere in payout or Heat math.
  Property test: same inputs → identical micro-unit output across x86-64 and arm64 CI.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R23 — Core sticky accumulation making bonus frequency hard to predict / tune

- **PROBLEM:** Because Cores stick and accumulate across cascades, bonus frequency
  depends on cascade-length distribution, which depends on the paytable and every
  feature — a wide cross-effect for the single most RTP-important event.
- **WHY IT MATTERS:** `W_CORE` is the preferred profile lever (R11/R17); if its effect
  on bonus frequency is entangled with cascade behaviour, profiles diverge.
- **SEVERITY:** MEDIUM–HIGH.
- **RECOMMENDED SOLUTION:** (a) Measure the `W_CORE → bonusFreq` response curve at
  fixed everything-else, per profile, and confirm it is smooth and monotone. (b)
  Consider (Phase 2 decision, needs sim) capping Core accumulation per sequence or
  only counting Cores present on the **final** board vs. sticky — but note sticky is
  the current spec and changing it is a spec change (not frozen, so allowed, but
  record in DECISIONS). (c) Alternative lever if entanglement is bad: a direct
  post-sequence `P(bonus | C≥3)` gate parameter — explicit and localised — though it
  adds a hidden probability, which the design principles discourage; prefer (a).
- **REQUIRES FROZEN-RULE CHANGE?** NO (F7 freezes the 3/4/5+ tiers and spin counts,
  not the Core weighting or accumulation model).

---

## R24 — "Understandable mechanics" vs. hidden EV

- **PROBLEM:** Several controls (POWER_NO_TARGET waste, shard round cap, attribution
  clipping, half-to-even rounding) are invisible to the player and slightly negative
  EV. Individually tiny; collectively they could be a fraction of a percent of RTP
  that is not explainable.
- **WHY IT MATTERS:** Certifiers and some jurisdictions dislike unexplained EV sinks;
  the product pillar is "no hidden multipliers / EV sinks".
- **SEVERITY:** LOW–MEDIUM.
- **RECOMMENDED SOLUTION:** Track every one of these as its own diagnostic counter and
  its RTP impact. Require the **sum of all "invisible" adjustments** to be < 0.1% of
  RTP; if larger, redesign the offending rule (e.g. convert POWER_NO_TARGET waste into
  a Heat refund so it is EV-neutral). Document each in the certification pack.
- **REQUIRES FROZEN-RULE CHANGE?** NO.

---

## R25 — Natural base-game WILD conflicts with the frozen symbol distribution and has no in-band weight — RESOLVED 2026-09-05 (pass 3)

**Resolution:** the owner chose remedy (a) — create RTP room first (a uniform
`BASE_PAYTABLE_COMP = 0.9925` cut) — then enabled natural WILD at
`WGEN_WILD_WEIGHT = 3` (of a `WGEN_SCALE`-rescaled ~9833 total). Final,
validated state: natural-WILD occurrence 1.17%, total RTP 95.10% (both
in-band), Bonus frequency/average materially unchanged. See `DECISIONS.md`
2026-09-05 (pass 3) for full evidence. `01_GAME_DESIGN_FROZEN.md` §8's
`[CLARIFICATION]` ("never drawn from the symbol pool") is now stale relative
to shipped behavior — flagging here since this register does not edit design
docs itself. Left below as the historical record of the original finding.

- **PROBLEM:** `01_GAME_DESIGN_FROZEN.md` §8 `[CLARIFICATION]` states FORGED WILD "is
  never drawn from the symbol pool" — created only by Hammer (and bonus advantages).
  On 2026-09-05 the owner explicitly instructed (in-session, see `DECISIONS.md`) that
  WILD be added to the weighted base-game/refill draw and calibrated by Monte Carlo to
  ~96% total RTP. Empirically: the shipped no-WILD baseline already measured ~97.0–
  97.2% (top of / above the requested 95–97% band before any WILD is added — see the
  same DECISIONS.md entry for the paytable pass that produced this baseline). Since a
  WILD in the draw pool can only help or be neutral to a cluster (it substitutes into
  whichever adjacent group benefits most; it never breaks a match), its RTP
  contribution is strictly ≥ 0 for any positive weight. Measured: WILD weight 1 (of
  984, ≈0.10%/cell) → 98.35% RTP; weight 2 → 99.12%; weight 4 → 105.0%; weight 10 →
  118.7% (150–200k-round samples, seed 20260905). There is no integer weight that
  lands total RTP inside 95–97% without first freeing up RTP "room" elsewhere
  (paytable/feature-probability retune), which the same instruction explicitly placed
  out of scope for this pass.
- **WHY IT MATTERS:** Shipping any nonzero WILD weight as-is would push total RTP
  measurably above the approved band — a certification-relevant, not cosmetic, gap.
  It also means the frozen `[CLARIFICATION]` in `01_GAME_DESIGN_FROZEN.md` §8 is now
  stale relative to the mechanism (not the shipped behavior).
- **SEVERITY:** MEDIUM (mechanism implemented and unit-tested; NOT enabled in the
  shipped config — `WGEN_WILD_WEIGHT = 0` in `engine/config.js`, so live RTP is
  unaffected until an owner decision lands).
- **RECOMMENDED SOLUTION:** Either (a) lower baseline RTP headroom first — e.g. a
  measured, documented paytable/probability retune to bring the no-WILD baseline down
  to ~93–94% — THEN introduce a small WILD weight to land back at ~96%; or (b) accept
  a new target band that already includes WILD's contribution and calibrate the
  no-WILD baseline directly to leave exactly that much room; or (c) keep WILD
  Hammer-only (revert `01_GAME_DESIGN_FROZEN.md`'s clarification to matching reality)
  and decline natural WILD. Any of these needs an explicit owner decision — this is
  the STOP the 2026-09-05 instruction itself asked for if the band couldn't be hit
  without broader retuning.
- **REQUIRES FROZEN-RULE CHANGE?** YES — `01_GAME_DESIGN_FROZEN.md` §8's
  `[CLARIFICATION]` that WILD is "never drawn from the symbol pool" would need a
  matching update if natural WILD is ever enabled.

---

## Severity summary

| ID | Title | Severity | Frozen change? |
|----|-------|----------|----------------|
| R1 | Runaway cascade loop | HIGH | No |
| R2 | Heat/Power feedback explosion | CRITICAL | No |
| R3 | Shard exponential growth | CRITICAL | No |
| R4 | Hammer+Shard ambiguity/farm | MEDIUM | No |
| R5 | Shield+Shard persistence exploit | HIGH | No |
| R6 | Pressure+Shard/Heat feedback | HIGH | No |
| R7 | Hammer+Wild feedback | MEDIUM | No |
| R8 | Bonus expansion feedback / leakage | HIGH | No |
| R9 | Tail concentration / cap bias | HIGH | Maybe (MAX_WIN_X is a product decision) |
| R10 | Dead features | MEDIUM | No |
| R11 | Coupled feature EV / tunability | HIGH | No |
| R12 | Ambiguous merge resolution | CRITICAL (correctness) | No |
| R13 | Impossible board states | HIGH | No |
| R14 | Simulation bias | CRITICAL | No |
| R15 | RNG consumption-order bugs | CRITICAL | No |
| R16 | Max-win cap accounting bias | MEDIUM | No |
| R17 | RTP profile divergence | HIGH | No |
| R18 | State leakage between rounds | CRITICAL | No |
| R19 | Bonus retrigger problems | MEDIUM | No |
| R20 | Performance at 100M+ | MEDIUM | No |
| R21 | Multi-wild assignment stability | MEDIUM | No |
| R22 | Fixed-point drift | MEDIUM | No |
| R23 | Core sticky accumulation vs tuning | MEDIUM–HIGH | No |
| R24 | Hidden EV sinks | LOW–MEDIUM | No |
| R25 | Natural WILD vs. frozen distribution / RTP band | MEDIUM | RESOLVED 2026-09-05 |

No mitigation in this register requires changing a frozen rule, **except** the
contingent case in R9 where evidence may force a product-level reconsideration of the
10,000x target (explicitly flagged as revisable in `00_PRODUCT_VISION.md`), and R25
where the owner has already instructed the change in-session but enabling it for real
still needs one of the three resolutions listed there.
