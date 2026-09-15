// Orchestrator: run ONE deterministic RoundResult from the engine, then animate its
// ordered trace events. All numbers shown come from the engine.
import { runRound, verifyDeterministic, MICRO } from "./sim.js";
import { buildTimeline, summarize } from "./timeline.js";
import { chunkSteps } from "./bonusFlow.js";
import { Board } from "./render/board.js";
import { Hud } from "./hud.js";
import { clock, wait } from "./render/tween.js";
import { CADENCE } from "./render/presentation.js";

const countKind = (board, k) => board.reduce((n, c) => n + (c && c.k === k ? 1 : 0), 0);
const artMode = (phase) => (phase === "AWAKENED" ? "AWAKENED" : "BASE");
// shard multiplier values currently on the board (for the shards HUD panel)
const shardValues = (board) =>
  board.filter((c) => c && c.k === "SHARD").map((c) => 1 << (c.lv || 0));

export class App {
  constructor(pixiApp) {
    this.board = new Board(pixiApp);
    this.hud = new Hud();
    this.balance = 1000;
    this.bet = 1;
    this.playing = false;
    this.skip = false;
    // true while a triggered Bonus is holding for the player's next manual
    // SPIN (see pressSpin/playBonusSpin) — the round is fully resolved
    // already (deterministic), only its PRESENTATION is paced spin-by-spin.
    this.bonusPending = false;
    this._bonusChunks = null;
    this.showInfo = true;
    this.session = { seed: "20260902", round: 0 };
    this.hud.setBalance(this.balance);
    this.hud.setWin(0);
  }

  setSpeed(v) {
    if (v === 0) { clock.instant = true; clock.speed = 1; }
    else { clock.instant = false; clock.speed = v; }
    // Heat/Pressure device timing is plain CSS (transition/animation), which
    // clock.speed cannot reach on its own — rescale it explicitly here.
    this.hud.setSpeedScale(clock.speed, clock.instant);
  }

  // Render the real deterministic starting board (round 0's initial fill) with no
  // animation, so the first visible frame is never an empty grid. Uses the engine
  // trace only — no client randomness, no RNG touched.
  showIdleBoard() {
    try {
      const { result } = runRound(this.session.seed, this.session.round || 0);
      const fill = (result.trace || []).find((e) => e.t === "fill");
      if (!fill) return;
      const wasInstant = clock.instant;
      clock.instant = true;
      this.board.setGrid(fill.grid, "BASE");
      this.board.renderInstant(fill.board);
      clock.instant = wasInstant;
      this.hud.setPhase("BASE");
      this.hud.setHeat(fill.heatCenti || 0, fill.thresholdCenti || 500);
      this.hud.setCores(countKind(fill.board, "CORE"));
      this.hud.setShards(shardValues(fill.board));
    } catch (e) {
      /* keep the loader up rather than expose an empty board */
      console.error("showIdleBoard", e);
    }
  }

  requestSkip() {
    if (!this.playing) return;
    this.skip = true;
    clock.instant = true;
  }

  async spinNext() {
    const r = this.session.round;
    this.session.round += 1;
    await this.play(this.session.seed, r);
  }

  async replay(seed, round) {
    this.session.seed = String(seed);
    this.session.round = Number(round);
    await this.play(seed, Number(round));
  }

  async buyBonus() {
    const r = this.session.round;
    this.session.round += 1;
    await this.play(this.session.seed, r, { buyBonus: true });
  }

  // BUY BONUS price: always derived from the current bet, never a hardcoded
  // currency amount. §Buy Bonus (2026-09-05, see docs/DECISIONS.md).
  buyBonusCost() { return this.bet * 45; } // 2026-09-05: 50x -> 45x, see docs/DECISIONS.md

  // SPIN button / Space — routes to whichever action is actually legal right
  // now. A round's WHOLE outcome (paid spin + every Free Spin it triggers) is
  // already resolved deterministically in one resolveRound() call; this only
  // decides how much of its already-fixed trace to PRESENT next. Free Spins
  // are never auto-played — each one needs its own press.
  async pressSpin() {
    if (this.bonusPending) return this.playBonusSpin();
    return this.spinNext();
  }

  async play(seed, roundIndex, { advanceSession = false, buyBonus = false } = {}) {
    if (this.playing || this.bonusPending) return;
    const cost = buyBonus ? this.buyBonusCost() : this.bet;
    if (this.balance < cost) { this.hud.debug(buyBonus ? "Insufficient balance for Buy Bonus." : "Insufficient demo balance."); return; }
    this.playing = true;
    this.skip = false;
    this._wasInstant = clock.instant;

    const { result } = runRound(seed, roundIndex, buyBonus ? { buyBonus: true } : {});
    const det = verifyDeterministic(seed, roundIndex, buyBonus ? { buyBonus: true } : {});
    const chunks = chunkSteps(buildTimeline(result.trace));

    this._result = result;
    this._det = det;
    this._roundIndex = roundIndex;
    this._advanceSession = advanceSession;
    this._roundWinX = 0;

    this.balance -= cost;
    this.hud.setBalance(this.balance);
    this.hud.setWin(0);
    this.hud.reset();
    if (buyBonus && !this._wasInstant) {
      // Both natural and bought Bonus converge on the SAME bonusStart-driven
      // entry FX below — this is only the purchase's own brief lead-in. No
      // text over the board (§4) — the confirmation modal already said what's
      // happening; this is just a beat before the shared entry FX takes over.
      await wait(500);
    }
    this.hud.debug(
      this.showInfo
        ? { deterministicReplay: det, ...summarize(result) }
        : `seed ${seed} · round ${roundIndex} · win ${(result.cappedWin / MICRO).toFixed(2)}x · deterministic ${det}`,
    );

    await this._presentChunk(chunks[0]);

    if (chunks.length > 1) {
      // Bonus triggered — chunk[0] ended at bonusStart (board still holds the
      // paid spin's final frame; HUD/background have already switched to
      // Bonus). Hold here for the player's own SPIN press for Free Spin #1.
      this._bonusChunks = chunks.slice(1);
      this.bonusPending = true;
      this.playing = false;
      clock.instant = this._wasInstant;
    } else {
      this._finishRound();
    }
  }

  // One manually-pressed Bonus Free Spin: presents exactly the next chunk
  // (one spinStart..spinEnd, plus its trailing molten/retrigger/expansion
  // housekeeping) and pauses again unless that was the last one.
  async playBonusSpin() {
    if (this.playing || !this.bonusPending || !this._bonusChunks || !this._bonusChunks.length) return;
    this.playing = true;
    this.bonusPending = false;
    this.skip = false;
    const chunk = this._bonusChunks.shift();
    await this._presentChunk(chunk);
    clock.instant = this._wasInstant;
    if (this._bonusChunks.length) {
      this.bonusPending = true;
      this.playing = false;
    } else {
      this._bonusChunks = null;
      this._finishRound();
    }
  }

  async _presentChunk(steps) {
    for (const step of steps) {
      if (this.skip) {
        this.fastApply(step);
        continue;
      }
      await this.applyStep(step, () => (this._roundWinX = this._winFrom(step, this._roundWinX)));
    }
  }

  // Shared tail for both a non-Bonus round and the LAST manually-played Bonus
  // Free Spin: settle balance/win, restore Base HUD + Base background, done.
  _finishRound() {
    const result = this._result;
    const finalX = result.cappedWin / MICRO;
    this.balance += finalX * this.bet;
    this.hud.setBalance(this.balance);
    this.hud.setWin(finalX * this.bet);
    if (result.bonus) this.hud.setPhase("BASE"); // also crossfades the background back to Base
    if (this.showInfo) this.hud.debug({ deterministicReplay: this._det, ...summarize(result) });

    clock.instant = this._wasInstant;
    this.playing = false;
    this.skip = false;
    this.bonusPending = false;
    if (this._advanceSession) this.session.round = this._roundIndex + 1;
    this._result = null;
  }

  // Synchronous "jump to the end" — used when SKIP is pressed. Renders every board
  // snapshot the engine produced but with zero animation, so the final state is exact.
  fastApply(step) {
    const ev = step.data;
    const h = this.hud;
    if (step.kind === "spinStart") {
      this.board.setGrid(ev.grid, artMode(ev.phase));
      this.board.renderInstant(ev.board);
      h.setPhase(ev.phase || (ev.mode === "BASE" ? "BASE" : "BONUS"));
      if (ev.fsRemaining != null) h.setFreeSpins(ev.fsRemaining);
      if (ev.molten != null) h.setMolten(ev.molten, ev.moltenThreshold);
    } else if (ev.board) {
      this.board.renderInstant(ev.board);
    }
    if (step.kind === "clusterHighlight") {
      h.setPressure(ev.tier);
      h.setWin((ev.roundWinX || 0) * this.bet);
    } else if (step.kind === "heat") h.setHeat(ev.totalCenti || 0, ev.thresholdCenti || 500);
    else if (step.kind === "spinEnd") h.setCores(ev.coreCount);
    else if (step.kind === "bonusStart") {
      h.setPhase("BONUS");
      h.setFreeSpins(ev.freeSpinsAwarded);
      h.setMolten(ev.moltenStart || 0, ev.moltenThreshold || 0);
    } else if (step.kind === "molten") h.setMolten(ev.meter, ev.threshold);
    else if (step.kind === "expansion") h.setPhase("AWAKENED");
    else if (step.kind === "retrigger") h.setFreeSpins(ev.freeSpinsRemaining);
    else if (step.kind === "roundEnd") h.setWin((ev.cappedWinX || 0) * this.bet);
    if (ev.board) {
      h.setShards(shardValues(ev.board));
      if (step.kind !== "spinEnd") h.setCores(countKind(ev.board, "CORE"));
    }
  }

  _winFrom(step, cur) {
    const ev = step.data;
    if (step.kind === "clusterHighlight") return ev.roundWinX ?? cur;
    return cur;
  }

  // Presentation-only anticipation as FORGE CORES accumulate in a spin. The
  // bonus trigger itself is decided entirely by the engine — this only dresses it.
  // Bug fix 2026-09-05: the bonus-trigger banner used the SAME "already alerted"
  // flag as the emphasis pulse, so once Cores hit 3 mid-cascade (the common case,
  // via a "refill" call with atSpinEnd=false) the flag latched and the real
  // spinEnd call — the only one allowed to show the banner — always found it
  // already set and skipped it. The banner now has its own once-per-spin flag,
  // and the emphasis pulse re-triggers as the count keeps climbing (3->4->5) so
  // 4/5 Cores visibly read as MORE than 3, not identical to it.
  async _coreAnticipation(board, hud, count, atSpinEnd) {
    if (count < 2) return;
    if (count >= 3) {
      if (count > this._coresAlerted) {
        this._coresAlerted = count;
        board.emphasizeCores(true);
        hud.coreTension(3);
      }
      if (atSpinEnd && !this._bonusBannerShown) {
        this._bonusBannerShown = true;
        // No text over the board (§4) — 4/5-Core enhancement (real engine
        // meaning: extra advantage powers, more Free Spins, a Molten head
        // start) reads through a stronger reaction instead of a banner.
        const extra = count - 3;
        if (extra > 0) board.emphasizeCores(true);
        await wait(clock.instant ? 0 : 620);
      }
    } else {
      if (this._coresAlerted >= 2) return;
      this._coresAlerted = 2;
      board.emphasizeCores(false);
      hud.coreTension(2);
      if (atSpinEnd) await wait(clock.instant ? 0 : 160);
    }
  }

  async applyStep(step, tapWin) {
    const b = this.board;
    const h = this.hud;
    const ev = step.data;

    switch (step.kind) {
      case "spinStart": {
        // A grid-size change (6x6->7x7 Bonus entry, 7x7->8x8 Awakened) IS the
        // "machine transformation" moment (§10/§13) — a brief energy pulse on
        // the OLD grid right before it rebuilds, then the existing drop-in
        // below does the reveal (symbols fall via the existing gravity
        // system — no giant text, no new board artwork).
        if (ev.grid !== b.W && !clock.instant) await b.transformPulse();
        b.setGrid(ev.grid, artMode(ev.phase));
        h.setPhase(ev.phase || (ev.mode === "BASE" ? "BASE" : "BONUS"));
        h.setHeat(ev.heatCenti || 0, ev.thresholdCenti || 500);
        h.setPressure("COLD");
        this._coresSeen = countKind(ev.board, "CORE");
        this._coresAlerted = 0;
        this._bonusBannerShown = false;
        h.setCores(this._coresSeen);
        h.setShards(shardValues(ev.board));
        if (ev.fsRemaining != null) h.setFreeSpins(ev.fsRemaining);
        if (ev.molten != null) h.setMolten(ev.molten, ev.moltenThreshold);
        // Forced advantage powers (§4/§5): no text over the board — they read
        // through their own FX when applied later in this spin's trace
        // (b.power(...) already flashes/shakes/embers for Shield/Hammer).
        // the spin IS a drop — clear the current board and drop the new grid in
        await b.dropInBoard(ev.board);
        this._coreAnticipation(b, h, this._coresSeen, false);
        break;
      }
      case "clusterHighlight": {
        h.setPressure(ev.tier);
        await b.showClusters(ev.clusters || []);
        tapWin();
        h.setWin((ev.roundWinX || 0) * this.bet);
        break;
      }
      case "heat": {
        h.setHeat(ev.totalCenti || 0, ev.thresholdCenti || 500);
        await wait(CADENCE.heatHold);
        break;
      }
      case "remove": {
        await b.removeCells(ev.board, ev.removed || [], ev.shardsConsumed || []);
        h.setCores(countKind(ev.board, "CORE"));
        h.setShards(shardValues(ev.board));
        break;
      }
      case "power": {
        await b.power(ev.kind, ev.detail, ev.board);
        h.setCores(countKind(ev.board, "CORE"));
        h.setShards(shardValues(ev.board));
        break;
      }
      case "gravity": {
        await b.gravity(ev.board);
        h.setCores(countKind(ev.board, "CORE"));
        break;
      }
      case "refill": {
        await b.refill(ev.board, ev.newCells || [], ev.shardSpawns || []);
        h.setShards(shardValues(ev.board));
        const cores = countKind(ev.board, "CORE");
        if (cores > (this._coresSeen || 0)) {
          this._coresSeen = cores;
          h.setCores(cores);
          this._coreAnticipation(b, h, cores, false);
        }
        break;
      }
      case "merge": {
        await b.merge(ev.board, ev.from, ev.to, ev.level);
        h.setShards(shardValues(ev.board));
        break;
      }
      case "spinEnd": {
        b.renderInstant(ev.board);
        h.setCores(ev.coreCount);
        await this._coreAnticipation(b, h, ev.coreCount, true);
        await wait(90);
        break;
      }
      // Bonus entry (natural trigger and Buy Bonus both land here — ONE
      // shared entry path). No giant title over the grid (§3): the moment
      // reads through frame energy, Core/Pressure reaction, particles and the
      // background switch instead. ~1.5-2.5s at normal speed (§4).
      case "bonusStart": {
        b.emphasizeCores(true);
        h.coreTension(3);
        await wait(clock.instant ? 0 : 280);
        h.forgeSurge();
        await wait(clock.instant ? 0 : 220);
        h.setPhase("BONUS"); // flips HUD styling + crossfades background_bonus.mp4 in
        h.setFreeSpins(ev.freeSpinsAwarded);
        h.setMolten(ev.moltenStart || 0, ev.moltenThreshold || 0);
        await b.bonusEntryFX(false);
        await wait(clock.instant ? 0 : 300); // board settles, then control returns
        break;
      }
      case "molten": {
        h.setMolten(ev.meter, ev.threshold);
        if (ev.reached) {
          // Charge threshold reached — the SAME device (§12) surges; the
          // actual 8x8 reveal is the next "expansion" step below.
          h.forgeSurge();
          b.emphasizeCores(true);
          await wait(clock.instant ? 0 : 500);
        } else {
          await wait(60);
        }
        break;
      }
      case "expansion": {
        // Awakened escalation — stronger than a regular Bonus entry (§13),
        // still no giant board-covering text.
        b.emphasizeCores(true);
        await wait(clock.instant ? 0 : 260);
        h.forgeSurge();
        await wait(clock.instant ? 0 : 240);
        h.setPhase("AWAKENED"); // background_bonus.mp4 stays active
        await b.bonusEntryFX(true);
        await wait(clock.instant ? 0 : 320);
        break;
      }
      case "retrigger": {
        // No text over the board (§4) — the Free Spins counter itself is the
        // dedicated HUD area for this; a brief Core-energy pulse marks it.
        h.setFreeSpins(ev.freeSpinsRemaining);
        b.emphasizeCores(true);
        await wait(clock.instant ? 0 : 400);
        break;
      }
      case "bonusEnd": {
        // Short Bonus-end pulse + clean total (§15) — deliberately shorter
        // than the ~1.5-2.5s entry sequence above.
        b.emphasizeCores(false);
        h.banner(`BONUS WIN  ${fmt(ev.bonusWinX)}×`, clock.instant ? 0 : 900);
        await wait(clock.instant ? 0 : 500);
        break;
      }
      case "maxWin": {
        h.banner("★ MAX WIN — 10,000× ★", clock.instant ? 0 : 2500);
        await wait(clock.instant ? 0 : 1600);
        break;
      }
      case "roundEnd": {
        h.setWin((ev.cappedWinX || 0) * this.bet);
        break;
      }
    }
  }
}

const fmt = (x) => (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
