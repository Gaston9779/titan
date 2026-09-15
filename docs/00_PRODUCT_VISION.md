# 00 — PRODUCT VISION

## 1. One-line concept

A high-volatility 6×6 cluster-pays slot in which winning clusters feed a Forge that
builds **Heat**, unleashes three signature **Forge Powers** (Blade, Hammer, Shield),
grows **Forge Shards** that merge into large multipliers, and — in the *Awaken the
Titan* bonus — expands its own grid from 7×7 to 8×8 to enter an enhanced **Awakened**
state.

## 2. Product pillars

| Pillar | What it means mathematically |
|---|---|
| Strong visual identity | Mechanics map to a single coherent fantasy (a forge). The math must not require mechanics that contradict that fantasy. |
| Understandable mechanics | A player can predict, qualitatively, what each mechanic does. No hidden multipliers, no undisclosed EV sinks. |
| Deep cascade potential | Cascades are the primary engine of both base wins and feature build-up. Cascade depth distribution must have a meaningful tail without runaway loops. |
| Controlled extreme tail | The 10,000× region is reachable but rare and *bounded by construction*, not by luck. |
| Auditable | Every payout traces to a rule and a set of RNG draws. Every feature has a measured EV contribution. |
| Deterministic | Seed + config + initial state fully determines the round. |
| Headless-simulatable | The entire payout model runs with no renderer. |
| Configurable RTP | 92 / 93 / 94 / 95 / 96 as explicit math profiles, not a post-multiplier. |
| Clean separation | Math engine → immutable `RoundResult` → presentation. |

## 3. Target math identity

Primary reference: **RTP 96.00%**. Additional profiles: 92, 93, 94, 95.

Initial (exploratory, NOT frozen) targets for the 96% profile:

| Metric | Exploratory target | Status |
|---|---|---|
| Hit frequency (round pays > 0) | ~25–30% | hypothesis |
| Bonus frequency | ~1 in 180–220 paid rounds | hypothesis |
| Base-game RTP contribution | ~68–72% (of the 96) | hypothesis |
| Bonus + extreme-feature contribution | ~28–32% | hypothesis |
| Max-win design target | 10,000× total bet | target, revisable on evidence |
| Volatility class | High | intent |

These are starting points for tuning, not acceptance criteria. If simulation shows a
better, more stable game at different values, `docs/02_MATH_SPEC.md` and
`docs/DECISIONS.md` are updated with the evidence.

## 4. Volatility philosophy

We want **enough small activity to keep the session alive** (frequent 5–6 symbol
clusters, short cascades, occasional single Forge Power) layered under a **thin,
genuine tail** (long cascades → Pressure escalation → Shard merges → Awakened bonus).

The tail must be produced by *mechanic interaction under rare-but-legitimate
conditions*, never by an unbounded feedback loop. See `docs/03_MATH_RISK_REGISTER.md`.

## 5. What success looks like at the end of Phase 2

- A headless simulator that, at 100M+ rounds, reports an RTP within a tight confidence
  interval of the profile target for all five profiles.
- Full statistical battery (see `docs/04_SIMULATION_PLAN.md`) with no unexplained
  anomalies, no dead features, no feature whose EV cannot be tuned independently.
- Reproducible seeds; parallel execution that does not change statistical semantics.
- A documented, defensible max-win cap behaviour.
- A math profile architecture where each profile's differences are explicit and their
  certification implications are written down.

## 6. Explicit non-goals for V1

- No skill-based elements, no player choice affecting EV (bonus buy is out of scope
  for V1 and would be a separate math profile if ever added).
- No progressive jackpot.
- No cross-round persistent state of any kind (no "meta meter", no sticky Heat between
  paid rounds). Every round starts from a clean state.
- No jurisdiction-specific behaviour baked into the engine. Regulatory routing is an
  external deployment concern; the engine only knows math profiles.
