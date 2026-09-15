// Board renderer — PERSISTENT SPRITE model with a SHARED DROP animator.
//
// Layers (bottom → top):  forge frame → cell sockets → win glow → symbols → one-shot fx
//   - the cell socket layer is STATIC (cell_base / cell_molten / cell_highlight)
//   - one symbol Container per occupied cell is created once and physically MOVED
//     (fall / gravity / land) through the whole spin & cascade — never redrawn per
//     trace state. Every outcome still comes verbatim from the engine trace.
//
// ONE drop animator (`_dropColumns`) serves BOTH cases:
//   A. NEW SPIN   — `dropInBoard()` clears the old board then drops the whole grid
//   B. CASCADE    — `refill()` drops only the freshly-spawned cells
// plus `gravity()` slides the surviving sprites down into the gaps.
import { Container, Graphics, Sprite, Text } from "pixi.js";
import { makeSymbol, cellFrame, sameSymbol, setCellWinning } from "./symbols.js";
import { tween, wait, clock, easeInQuad, easeOutBack, easeOutCubic } from "./tween.js";
import { tex } from "../assets.js";
import { shake, embers, shimmer, ringPulse, winRing, winBurst, shardLink, boardFlash } from "./fx.js";
import { FALL, CADENCE, WILD, CORE, fallDuration, shardTier } from "./presentation.js";

export class Board {
  constructor(app) {
    this.app = app;
    this.root = new Container();
    app.stage.addChild(this.root);
    this.W = 6;
    this.mode = "BASE";
    this._t = 0;
    this._specials = [];
    this._detached = []; // symbols mid dissolve / exit animation (not in this.sym)
    this._glows = [];
    this._build(6);
    this.app.ticker.add((tk) => this._idle(tk.deltaMS ?? tk.elapsedMS ?? 16));
  }

  _stagePx() {
    const s = this.app.screen;
    return Math.min(s.width, s.height);
  }

  _build(W) {
    for (const c of [...this.root.children]) if (!c.destroyed) c.destroy({ children: true });
    this.root.removeChildren();
    this.W = W;
    const stage = this._stagePx();
    this.frameInset = Math.round(stage * 0.024); // room for the procedural forge frame
    const boardPx = stage - this.frameInset * 2;
    this.cellSize = Math.floor(boardPx / W);
    const total = this.cellSize * W;
    this.root.position.set(
      Math.round((this.app.screen.width - total) / 2),
      Math.round((this.app.screen.height - total) / 2),
    );
    this.home = { x: this.root.position.x, y: this.root.position.y };

    this.forgeFrame = new Graphics();
    this.frameLayer = new Container();
    this.glowLayer = new Container();
    this.symLayer = new Container();
    this.fx = new Container();
    this.root.addChild(this.forgeFrame, this.frameLayer, this.glowLayer, this.symLayer, this.fx);
    this._drawForgeFrame(total);

    this._frameArt = this._artMode();
    this.frame = [];
    for (let i = 0; i < W * W; i++) {
      const f = cellFrame(this.cellSize, this._frameArt);
      const { x, y } = this.xy(i);
      f.position.set(x + this.cellSize / 2, y + this.cellSize / 2);
      this.frameLayer.addChild(f);
      this.frame.push(f);
    }

    this.sym = new Array(W * W).fill(null);
    this.model = new Array(W * W).fill(null);
    this._specials = [];
    this._detached = [];
    this._glows = [];
  }

  _rebuildFrames(m) {
    this._frameArt = m;
    for (let i = 0; i < this.frame.length; i++) {
      const old = this.frame[i];
      const f = cellFrame(this.cellSize, m);
      f.position.copyFrom(old.position);
      this.frameLayer.addChild(f);
      old.destroy();
      this.frame[i] = f;
    }
    this._drawForgeFrame(this.cellSize * this.W);
  }

  // The outermost machine casing is now the approved DOM sprite
  // #board-outer-frame (board_outer_frame.webp), scaled so its transparent
  // opening lands on the playable grid. The old procedural frame that lived in
  // the `frameInset` gutter is intentionally not drawn — the gutter sits behind
  // the casing art. Cell geometry (frameInset / cellSize) is UNCHANGED so
  // deterministic replay and 6×6 / 7×7 / 8×8 sizing are untouched.
  _drawForgeFrame(_total) {
    this.forgeFrame.clear();
  }

  setGrid(W, mode) {
    if (mode) this.mode = mode;
    if (W !== this.W) this._build(W);
    else if (this._artMode() !== this._frameArt) this._rebuildFrames(this._artMode());
  }
  setMode(mode) {
    if (mode && mode !== this.mode) {
      this.mode = mode;
      if (this._artMode() !== this._frameArt) this._rebuildFrames(this._artMode());
    }
  }

  xy(i) {
    const c = i % this.W;
    const r = (i - c) / this.W;
    return { x: c * this.cellSize, y: r * this.cellSize };
  }
  center(i) {
    const { x, y } = this.xy(i);
    return { x: x + this.cellSize / 2, y: y + this.cellSize / 2 };
  }
  _artMode() {
    return this.mode === "AWAKENED" ? "AWAKENED" : "BASE";
  }

  // swap a cell socket to / from the supplied cell_highlight texture
  _setCellWin(i, on) {
    if (this.frame[i]) setCellWinning(this.frame[i], on);
  }
  _resetFrames() {
    for (let i = 0; i < this.frame.length; i++) this._setCellWin(i, false);
  }

  // ---- idle breathing for WILD / FORGE CORE ----------------------------
  _idle(dtMs) {
    if (!this._specials.length || clock.instant) return;
    this._t += dtMs;
    for (const i of this._specials) {
      const o = this.sym[i];
      if (!o || o.destroyed || !o.__aura || o.__aura.destroyed) continue;
      const cfg = o.__special === "WILD" ? WILD : CORE;
      const s = Math.sin((this._t / cfg.pulsePeriodMs) * Math.PI * 2);
      const base = o.__aura.__baseW || this.cellSize * cfg.auraScale;
      o.__aura.width = o.__aura.height = base * (1 + cfg.pulseAmp * s);
      if (!o.__aura.__forced) o.__aura.alpha = cfg.auraAlpha * (1 + 0.3 * s);
      if (o.__sprite && !o.__busy && !o.__sprite.destroyed) {
        o.__sprite.scale.set((o.__baseScale || o.__sprite.scale.x) * (1 + cfg.symbolPulseAmp * s));
      }
    }
  }

  _rescanSpecials() {
    this._specials = [];
    for (let i = 0; i < this.sym.length; i++) {
      const o = this.sym[i];
      if (o && o.__special) {
        this._specials.push(i);
        if (o.__aura) o.__aura.__baseW = this.cellSize * (o.__special === "WILD" ? WILD.auraScale : CORE.auraScale);
      }
    }
  }

  _place(o, i) {
    const { x, y } = this.xy(i);
    o.position.set(x, y);
    o.scale.set(1);
    o.alpha = 1;
    o.__busy = false;
  }

  _newSym(cell, i) {
    const o = makeSymbol(cell, this.cellSize, this._artMode());
    o.__data = cell;
    this._place(o, i);
    this.symLayer.addChild(o);
    this.sym[i] = o;
    return o;
  }

  _dropSym(i) {
    const o = this.sym[i];
    this.sym[i] = null;
    if (o && !o.destroyed) o.destroy({ children: true });
  }

  _clearDetached() {
    for (const o of this._detached) if (o && !o.destroyed) o.destroy({ children: true });
    this._detached = [];
  }
  _clearGlows() {
    for (const g of this._glows) if (g && !g.destroyed) g.destroy({ children: true });
    this._glows = [];
    if (this.glowLayer) this.glowLayer.removeChildren();
  }
  _clearFx() {
    if (!this.fx) return;
    for (const c of [...this.fx.children]) {
      if (c && c.__id) this.fx.removeChild(c); // pooled → back to pool by owner
      else if (c && !c.destroyed) c.destroy({ children: true });
    }
  }

  // hard reconcile: make the persistent sprites exactly match `board`, no anim.
  renderInstant(board) {
    const m = this._artMode();
    if (m !== this._frameArt) this._rebuildFrames(m);
    this._clearDetached();
    this._clearGlows();
    this._clearFx();
    this._resetFrames();
    for (let i = 0; i < this.sym.length; i++) {
      const want = board[i] && board[i].k !== "EMPTY" ? board[i] : null;
      const cur = this.sym[i];
      if (want && cur && !cur.destroyed && sameSymbol(cur.__data, want)) {
        cur.__data = want;
        this._place(cur, i);
        continue;
      }
      if (cur) this._dropSym(i);
      if (want) this._newSym(want, i);
    }
    const live = new Set(this.sym.filter(Boolean));
    for (const c of [...this.symLayer.children]) {
      if (!live.has(c) && !c.destroyed) c.destroy({ children: true });
    }
    this.model = board.map((c) => c || null);
    this._rescanSpecials();
  }

  // soft reconcile — keep untouched survivors, animate away what vanished, pop in
  // anything that appeared (Hammer wilds). Used mid-cascade. `boost` (>1 from the
  // HAMMER power path) makes a freshly-appeared special's entrance read as more
  // dramatic than a normal cascade pop-in, so a Hammer-made WILD visibly reads as
  // Hammer-made rather than identical to any other appearance.
  _reconcile(board, boost = 1) {
    for (let i = 0; i < this.sym.length; i++) {
      const want = board[i] && board[i].k !== "EMPTY" ? board[i] : null;
      const cur = this.sym[i];
      if (want && cur && !cur.destroyed && sameSymbol(cur.__data, want)) {
        cur.__data = want;
        if (!cur.__busy) this._place(cur, i);
        continue;
      }
      if (cur && !cur.destroyed) {
        this.sym[i] = null;
        if (clock.instant) {
          cur.destroy({ children: true });
        } else {
          this._detached.push(cur);
          tween(cur, { alpha: 0 }, 120)
            .then(() => tween(cur.scale, { x: 0.2, y: 0.2 }, 80))
            .then(() => {
              const k = this._detached.indexOf(cur);
              if (k >= 0) this._detached.splice(k, 1);
              if (!cur.destroyed) cur.destroy({ children: true });
            });
        }
      }
      if (want && (!this.sym[i] || this.sym[i].destroyed)) {
        const o = this._newSym(want, i);
        if (!clock.instant) {
          o.scale.set(0.3);
          tween(o.scale, { x: 1, y: 1 }, 200, easeOutBack);
          if (o.__special) this._specialEntrance(i, boost);
        }
      }
    }
    // sweep sprites orphaned by an interrupted fall (not in this.sym, not detached)
    const keep = new Set([...this.sym.filter(Boolean), ...this._detached]);
    for (const c of [...this.symLayer.children]) {
      if (!keep.has(c) && !c.destroyed) c.destroy({ children: true });
    }
    this.model = board.map((c) => c || null);
    this._rescanSpecials();
  }

  // ===================================================================
  //  SHARED DROP ANIMATOR
  //  Drop `cells` (indices) of `board` into place: symbols spawn ABOVE the
  //  board and fall vertically, per-column as a loose stack, staggered by
  //  column + row, ease-in acceleration, landing squash + rebound.
  // ===================================================================
  async _dropColumns(board, cells, { shardSpawns = [], spawnRows = FALL.refillSpawnRows, durRange = FALL.cascade } = {}) {
    if (clock.instant) {
      this._reconcile(board);
      this._rescanSpecials();
      return;
    }
    const shardSet = new Set((shardSpawns || []).map((s) => s.cell));
    const shardLevelByCell = new Map((shardSpawns || []).map((s) => [s.cell, s.level]));
    const byCol = new Map();
    for (const i of cells) {
      const c = i % this.W;
      if (!byCol.has(c)) byCol.set(c, []);
      byCol.get(c).push(i);
    }
    const anims = [];
    for (const [c, list] of byCol) {
      list.sort((a, b) => a - b); // ascending row order (top → bottom)
      const bottom = list[list.length - 1];
      // the whole column starts as a strip shifted up by `offset`; the LOWEST
      // cell releases first so the column stacks up bottom-to-top on landing
      const offset = this.xy(bottom).y + this.cellSize * spawnRows;
      const dur = fallDuration(offset / this.cellSize, durRange);
      const colDelay = c * FALL.columnStaggerMs;
      list.forEach((i, k) => {
        if (this.sym[i] && !this.sym[i].destroyed) this._dropSym(i);
        const o = this._newSym(board[i], i);
        o.__busy = true;
        const homeY = this.xy(i).y;
        o.position.y = homeY - offset;
        const isShard = shardSet.has(i);
        if (isShard) o.scale.set(0.62);
        const rowDelay = (list.length - 1 - k) * FALL.rowStaggerMs; // bottom first
        anims.push(
          (async () => {
            await wait(colDelay + rowDelay);
            await tween(o, { y: homeY }, dur, easeInQuad);
            if (isShard) {
              // stronger-than-normal landing impact + a brief molten flash so a
              // spawning Shard never reads as an ordinary symbol appearing.
              // Escalates with level (2x/4x subtle -> 32x/64x strongest).
              const tier = shardTier(shardLevelByCell.get(i));
              const ctr = this.center(i);
              embers(this.fx, ctr.x, ctr.y, Math.round(7 * tier.emberMult), this.cellSize * 0.75, [0xffb060, 0xff7a2f, 0xffe3a0]);
              if (tier.flash) boardFlash(this.fx, this.cellSize * this.W, this.cellSize * this.W, 0xffcf8a, 200, tier.shake ? 0.26 : 0.16);
              const punch = 1.22 * (1 + (tier.pulseMult - 1) * 0.6);
              await tween(o.scale, { x: punch, y: punch }, 110, easeOutCubic);
              await tween(o.scale, { x: 1, y: 1 }, 160, easeOutBack);
            } else {
              await this._land(o, offset / this.cellSize);
            }
            o.__busy = false;
            if (o.__special) this._specialEntrance(i);
          })(),
        );
      });
    }
    await Promise.all(anims);
    this._reconcile(board);
    this._rescanSpecials();
  }

  // A. NEW SPIN — clear the current board (quick fall-out) then drop the whole
  //    grid in from above. First spin included: no hidden init, real transition.
  async dropInBoard(board) {
    this._clearDetached(); // drop anything left mid-animation by a prior round
    this._clearGlows();
    this._clearFx();
    this._resetFrames();

    // clear whatever is on the board — a quick staggered fall-out downward
    const exiting = [];
    for (let i = 0; i < this.sym.length; i++) {
      const o = this.sym[i];
      this.sym[i] = null;
      if (!o || o.destroyed) continue;
      if (clock.instant) {
        o.destroy({ children: true });
        continue;
      }
      this._detached.push(o);
      const c = i % this.W;
      exiting.push(
        (async () => {
          await wait(c * 6);
          await tween(o, { y: o.position.y + this.cellSize * 1.7, alpha: 0 }, 190, easeInQuad);
          const k = this._detached.indexOf(o);
          if (k >= 0) this._detached.splice(k, 1);
          if (!o.destroyed) o.destroy({ children: true });
        })(),
      );
    }
    this._specials = [];
    if (clock.instant) {
      this._reconcile(board);
      this._rescanSpecials();
      return;
    }
    await wait(85); // the incoming drop overlaps the tail of the fall-out

    const occupied = [];
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].k !== "EMPTY") occupied.push(i);
    }
    await this._dropColumns(board, occupied, { spawnRows: FALL.newSpinSpawnRows, durRange: FALL.spin });
  }

  async _land(o, rows) {
    if (clock.instant || !o || o.destroyed) return;
    const q = Math.min(FALL.landSquash, 0.05 + Math.abs(rows) * 0.02);
    o.scale.set(1);
    await tween(o.scale, { x: 1 + q * 0.6, y: 1 - q }, FALL.landReboundMs * 0.42, easeOutCubic);
    await tween(o.scale, { x: 1, y: 1 }, FALL.landReboundMs * 0.58, easeOutBack);
  }

  // ---- WIN HIGHLIGHT — cell_highlight socket + win_ring, both BEHIND the symbol
  async showClusters(clusters) {
    const sp = clock.speed || 1;
    const labels = [];
    for (const cl of clusters) {
      for (const i of cl.cells) {
        this._setCellWin(i, true); // supplied cell_highlight — frame layer is below symbols
        const o = this.sym[i];
        if (o && !o.destroyed) {
          o.__busy = true;
          o.scale.set(1);
          tween(o.scale, { x: 1.09, y: 1.09 }, 150).then(() => tween(o.scale, { x: 1, y: 1 }, 220, easeOutBack));
        }
        const ctr = this.center(i);
        winRing(this.glowLayer, ctr.x, ctr.y, this.cellSize, sp);
      }
      const anchor = this.center(cl.cells[0]);
      const shards = cl.shards || [];
      // highest-tier contributing Shard drives how strong the whole win-linkup
      // reads (a 32x/64x contribution must feel bigger than a 2x one).
      let topTier = shardTier(1);
      for (const sh of shards) {
        const tier = shardTier(sh.level);
        if (tier.pulseMult > topTier.pulseMult) topTier = tier;
        const o = this.sym[sh.cell];
        if (o && !o.destroyed) {
          const p = 1.12 * tier.pulseMult; // "pulse strongly" — stronger than the normal win pulse (1.09), escalating with level
          tween(o.scale, { x: p, y: p }, 140).then(() => tween(o.scale, { x: 1, y: 1 }, 200, easeOutBack));
        }
        // energy link: a Shard's contribution visibly travels FROM it TO the win —
        // never implied out of thin air (§F Shard -> win interaction).
        const sc = this.center(sh.cell);
        shardLink(this.fx, sc.x, sc.y, anchor.x, anchor.y, sh.locked ? 0x9fe0ff : 0xffb060, 200);
        if (tier.emberMult > 1) embers(this.fx, sc.x, sc.y, Math.round(6 * tier.emberMult), this.cellSize * 0.7, [0xffb060, 0xff7a2f, 0xffe3a0]);
      }
      if (shards.length && topTier.flash) {
        boardFlash(this.fx, this.cellSize * this.W, this.cellSize * this.W, 0xffcf8a, 220, topTier.shake ? 0.24 : 0.15);
        if (topTier.shake) shake(this.root, this.cellSize * 0.06, 200);
      }

      const style = {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: Math.round(this.cellSize * 0.3),
        fontWeight: "700",
        fill: 0xffd98a,
        stroke: { color: 0x2a0d00, width: Math.max(3, this.cellSize * 0.04) },
        align: "center",
      };
      let label;
      if (shards.length) {
        // Compact 3-line payout readout, all real engine values, shown together
        // (not guessed/animated-in piecemeal): CLUSTER base win, exactly how the
        // touching Shards combine (additive, per the engine — never implied as
        // multiplication), and the final resolved payout.
        const terms = shards.map((s) => 1 << s.level);
        const shardLine = terms.length === 1 ? `SHARD +${terms[0]}×` : `SHARD ${terms.join(" + ")}× = ${cl.mult}×`;
        label = new Text({
          text: `CLUSTER ${fmt(cl.baseX)}×\n${shardLine}\nWIN ${fmt(cl.payX)}×`,
          style: { ...style, fontSize: Math.round(this.cellSize * 0.22), lineHeight: Math.round(this.cellSize * 0.26) },
        });
        label.scale.set(0.7);
        tween(label.scale, { x: 1, y: 1 }, 160, easeOutBack);
      } else {
        label = new Text({ text: `+${fmt(cl.payX)}×`, style });
      }
      label.anchor.set(0.5);
      label.position.set(anchor.x, anchor.y);
      this.fx.addChild(label);
      labels.push(label);
      tween(label, { y: anchor.y - this.cellSize * 0.55 }, 520);
    }
    await wait(CADENCE.clusterHold);
    for (const l of labels) if (!l.destroyed) l.destroy();
    for (const i of clusters.flatMap((c) => c.cells)) {
      this._setCellWin(i, false); // revert survivors (removed cells revert in removeCells)
      const o = this.sym[i];
      if (o && !o.destroyed) o.__busy = false;
    }
  }

  // ---- REMOVAL — burst + dissolve; gravity begins immediately (overlaps) ----
  async removeCells(afterBoard, removed = [], shardsConsumed = []) {
    const sp = clock.speed || 1;
    const targets = [...new Set([...(removed || []), ...(shardsConsumed || [])])];
    for (const i of targets) {
      this._setCellWin(i, false);
      const o = this.sym[i];
      this.sym[i] = null; // logically gone immediately — gravity must not see it
      if (!o || o.destroyed) continue;
      o.__busy = true;
      this._detached.push(o);
      const ctr = this.center(i);
      winBurst(this.fx, ctr.x, ctr.y, this.cellSize, sp);
      embers(this.fx, ctr.x, ctr.y, 6, this.cellSize * 0.6, [0xff9a3c, 0xffd66a, 0x9a2f12]);
      tween(o.scale, { x: 1.14, y: 1.14 }, 55)
        .then(() => Promise.all([tween(o, { alpha: 0 }, 120), tween(o.scale, { x: 0.1, y: 0.1 }, 120)]))
        .then(() => {
          const k = this._detached.indexOf(o);
          if (k >= 0) this._detached.splice(k, 1);
          if (!o.destroyed) o.destroy({ children: true });
        });
    }
    this._rescanSpecials();
    if (clock.instant) {
      this._clearDetached();
      return;
    }
    await wait(40); // minimal — the fall starts while winners are still shrinking
  }

  // ---- GRAVITY — physically slide the surviving sprites down --------------
  async gravity(afterBoard) {
    if (clock.instant) {
      this._reconcile(afterBoard);
      return;
    }
    const newSym = new Array(this.W * this.W).fill(null);
    const moves = [];
    for (let c = 0; c < this.W; c++) {
      const src = [];
      const dst = [];
      for (let r = 0; r < this.W; r++) {
        const i = r * this.W + c;
        if (this.sym[i] && !this.sym[i].destroyed) src.push(i);
        if (afterBoard[i] && afterBoard[i].k !== "EMPTY") dst.push(i);
      }
      const n = Math.min(src.length, dst.length);
      for (let j = 0; j < n; j++) {
        const s = src[src.length - n + j];
        const d = dst[dst.length - n + j];
        const o = this.sym[s];
        newSym[d] = o;
        if (!o) continue;
        o.__data = afterBoard[d];
        if (s !== d) moves.push({ o, col: c, order: n - 1 - j, toY: this.xy(d).y, rows: (d - s) / this.W });
      }
      for (let j = 0; j < src.length - n; j++) newSym[src[j]] = this.sym[src[j]];
    }
    this.sym = newSym;
    await Promise.all(
      moves.map(async (mv) => {
        mv.o.__busy = true;
        const delay = mv.col * FALL.columnStaggerMs + mv.order * FALL.rowStaggerMs;
        if (delay) await wait(delay);
        await tween(mv.o, { y: mv.toY }, fallDuration(mv.rows, FALL.cascade), easeInQuad);
        await this._land(mv.o, mv.rows);
        mv.o.__busy = false;
      }),
    );
    this._reconcile(afterBoard);
  }

  // ---- REFILL — cascade case: only the freshly-spawned cells drop in -------
  async refill(afterBoard, newCells = [], shardSpawns = []) {
    await this._dropColumns(afterBoard, newCells || [], { shardSpawns });
  }

  _specialEntrance(i, boost = 1) {
    const o = this.sym[i];
    if (!o || o.destroyed || !o.__special) return;
    const cfg = o.__special === "WILD" ? WILD : CORE;
    const ctr = this.center(i);
    if (o.__sprite && !o.__sprite.destroyed) {
      const base = o.__baseScale || o.__sprite.scale.x;
      const overshoot = base * (1 + (cfg.landScale - 1) * boost);
      o.__sprite.scale.set(overshoot);
      tween(o.__sprite.scale, { x: base, y: base }, 280, easeOutBack);
    }
    if (o.__aura && !o.__aura.destroyed) {
      o.__aura.__forced = true;
      o.__aura.alpha = Math.min(1, cfg.auraAlpha * 2.6 * boost);
      tween(o.__aura, { alpha: cfg.auraAlpha }, 460).then(() => o.__aura && (o.__aura.__forced = false));
    }
    if (o.__special === "WILD") {
      shimmer(this.fx, ctr.x, ctr.y, this.cellSize, cfg.auraColor, cfg.shimmerMs);
      embers(this.fx, ctr.x, ctr.y, Math.round(8 * boost), this.cellSize * 0.8, [0xffb060, 0xff7a2f, 0xffe3a0]);
    } else {
      ringPulse(this.fx, ctr.x, ctr.y, this.cellSize, cfg.auraColor, cfg.ringMs);
      embers(this.fx, ctr.x, ctr.y, Math.round(cfg.burstParticles * boost), this.cellSize * 1.15, [0xff7a2f, 0xffd66a, 0xffe3a0]);
    }
  }

  emphasizeCores(strong = false) {
    if (clock.instant) return;
    for (let i = 0; i < this.sym.length; i++) {
      const o = this.sym[i];
      if (!o || o.destroyed || o.__special !== "CORE") continue;
      const ctr = this.center(i);
      ringPulse(this.fx, ctr.x, ctr.y, this.cellSize, CORE.auraColor, strong ? 620 : 460);
      if (o.__aura && !o.__aura.destroyed) {
        o.__aura.__forced = true;
        o.__aura.alpha = Math.min(1, CORE.auraAlpha * (strong ? 3 : 2));
        tween(o.__aura, { alpha: CORE.auraAlpha }, strong ? 560 : 420).then(() => o.__aura && (o.__aura.__forced = false));
      }
      if (strong) embers(this.fx, ctr.x, ctr.y, 12, this.cellSize * 0.9, [0xff7a2f, 0xffd66a]);
    }
    if (strong) shake(this.root, this.cellSize * 0.12, 260);
  }

  // ---- BONUS EXPERIENCE INTEGRATION (2026-09-06) ---------------------------
  // A brief "machine transformation" energy pulse fired right before a
  // grid-size change (6x6->7x7 Bonus entry, 7x7->8x8 Awakened) rebuilds the
  // board — procedural FX only, no new artwork, current frame/cell assets
  // unchanged. The actual reveal is still the existing dropInBoard() gravity
  // system called right after this by app.js.
  async transformPulse() {
    if (clock.instant) return;
    const total = this.cellSize * this.W;
    const ctr = { x: total / 2, y: total / 2 };
    ringPulse(this.fx, ctr.x, ctr.y, this.cellSize, 0xffb060, 380);
    embers(this.fx, ctr.x, ctr.y, 14, total * 0.5, [0xff9a3c, 0xffd66a, 0xffe3a0]);
    await shake(this.root, this.cellSize * 0.07, 200);
  }

  // Bonus-entry FX (§4): frame/particle/lighting only — NO text. `strong`
  // escalates the Awakened (8x8) reveal above a regular Bonus entry. Reuses
  // the same procedural helpers as everywhere else on the board (no new art,
  // no filters kept permanently on). ~0.8-1s of this method's own time; the
  // caller (app.js) pads the surrounding beats to the target 1.5-2.5s total.
  async bonusEntryFX(strong = false) {
    if (clock.instant) return;
    const total = this.cellSize * this.W;
    const ctr = { x: total / 2, y: total / 2 };
    ringPulse(this.fx, ctr.x, ctr.y, this.cellSize, 0xff9a3c, strong ? 700 : 520);
    embers(this.fx, ctr.x, ctr.y, strong ? 26 : 16, total * 0.55, [0xff7a2f, 0xffd66a, 0xffe3a0]);
    await wait(strong ? 260 : 200);
    boardFlash(this.fx, total, total, 0xffcf8a, strong ? 280 : 220, strong ? 0.26 : 0.16);
    await shake(this.root, this.cellSize * (strong ? 0.16 : 0.09), strong ? 320 : 240);
    ringPulse(this.fx, ctr.x, ctr.y, this.cellSize, 0xff6a1f, strong ? 620 : 460);
    embers(this.fx, ctr.x, ctr.y, strong ? 18 : 10, total * 0.7, [0xff9a3c, 0xffb060]);
    await wait(strong ? 320 : 220);
  }

  // Shard merge (§G Shard merge presentation): source Shards pulse -> pull
  // together and fade -> impact -> result pops in -> result glows -> ladder
  // reacts (via app.js hud.setShards() right after this resolves). Persistent
  // sprites throughout — never an instant texture replacement. Escalates with
  // the RESULTING level (2x/4x subtle -> 32x/64x strongest). ~250-400ms total.
  async merge(afterBoard, from, to, level) {
    if (clock.instant) {
      this._reconcile(afterBoard);
      return;
    }
    const tier = shardTier(level);
    const a = this.sym[from]; // "other" — consumed, travels into the target cell
    const b = this.sym[to]; // the OLD lower-level Shard sitting at the target cell
    this.sym[from] = null;
    this.sym[to] = null;
    const target = this.xy(to);
    const ctr = this.center(to);

    // 1. both source Shards pulse before they move
    const prePulse = (o) =>
      o && !o.destroyed ? tween(o.scale, { x: 1.15, y: 1.15 }, 60, easeOutBack).then(() => tween(o.scale, { x: 1, y: 1 }, 60)) : null;
    await Promise.all([prePulse(a), prePulse(b)]);

    // 2. pull/converge toward the target cell, fading out — both sources, not just one
    const converge = [];
    if (a && !a.destroyed) {
      this._detached.push(a);
      converge.push(
        tween(a, { x: target.x, y: target.y, alpha: 0.1 }, 100, easeOutCubic).then(() => {
          const k = this._detached.indexOf(a);
          if (k >= 0) this._detached.splice(k, 1);
          if (!a.destroyed) a.destroy({ children: true });
        }),
      );
    }
    if (b && !b.destroyed) {
      this._detached.push(b);
      converge.push(
        Promise.all([tween(b.scale, { x: 0.15, y: 0.15 }, 100, easeOutCubic), tween(b, { alpha: 0.1 }, 100)]).then(() => {
          const k = this._detached.indexOf(b);
          if (k >= 0) this._detached.splice(k, 1);
          if (!b.destroyed) b.destroy({ children: true });
        }),
      );
    }
    await Promise.all(converge);

    // 3. quick molten impact
    embers(this.fx, ctr.x, ctr.y, Math.round(10 * tier.emberMult), this.cellSize * 0.7, [0xe23b2b, 0xff9a3c, 0xffd66a]);
    if (tier.flash) boardFlash(this.fx, this.cellSize * this.W, this.cellSize * this.W, 0xffcf8a, 200, tier.shake ? 0.24 : 0.14);

    // 4. resulting Shard appears with a scale punch
    const o = this._newSym(afterBoard[to], to);
    o.scale.set(0.4);
    await tween(o.scale, { x: 1.14 * tier.pulseMult, y: 1.14 * tier.pulseMult }, 90, easeOutCubic);
    await tween(o.scale, { x: 1, y: 1 }, 90, easeOutBack);

    // 5. resulting multiplier glows (fire-and-forget — doesn't extend the hold)
    ringPulse(this.fx, ctr.x, ctr.y, this.cellSize, 0xffb060, 380 * tier.pulseMult);
    if (tier.shake) shake(this.root, this.cellSize * 0.05, 180);

    this._reconcile(afterBoard);
  }

  async power(kind, detail, afterBoard) {
    const total = this.cellSize * this.W;
    const meta = tex(`power:${kind}`);
    const icon = meta ? new Sprite(meta.texture) : null;
    if (icon) {
      icon.anchor.set(0.5);
      const t = this.cellSize * 2.1;
      icon.scale.set(t / Math.max(meta.tw, meta.th));
      icon.position.set(total / 2, total / 2);
      icon.alpha = 0;
      icon.rotation = kind === "BLADE" ? -0.5 : 0;
      this.fx.addChild(icon);
    }
    const g = new Graphics();
    this.fx.addChild(g);

    if (kind === "BLADE") {
      const isRow = detail && detail.orientation === "row";
      const line = detail ? detail.line : 0;
      if (icon) {
        icon.position.set(
          isRow ? -this.cellSize : total / 2,
          isRow ? line * this.cellSize + this.cellSize / 2 : -this.cellSize,
        );
        await Promise.all([
          tween(icon, { alpha: 1 }, 110),
          tween(icon, isRow ? { x: total + this.cellSize } : { y: total + this.cellSize }, 360),
        ]);
      }
    } else if (kind === "HAMMER") {
      const [tr, tc] = (detail && detail.window) || [0, 0];
      g.roundRect(tc * this.cellSize, tr * this.cellSize, this.cellSize * 3, this.cellSize * 3, 8).fill({
        color: 0xffd23c,
        alpha: 0,
      });
      if (icon) {
        icon.position.set((tc + 1.5) * this.cellSize, (tr + 1.5) * this.cellSize - this.cellSize);
        icon.scale.set((this.cellSize * 2.6) / Math.max(meta.tw, meta.th));
        await tween(icon, { alpha: 1, y: (tr + 1.5) * this.cellSize }, 200);
      }
      await Promise.all([
        tween(g, { alpha: 0.5 }, 60).then(() => tween(g, { alpha: 0 }, 300)),
        shake(this.root, this.cellSize * 0.22, 340),
        embers(this.fx, (tc + 1.5) * this.cellSize, (tr + 1.5) * this.cellSize, 20, this.cellSize * 1.6),
      ]);
      if (icon) await tween(icon, { alpha: 0 }, 160);
    } else if (kind === "SHIELD") {
      for (const i of (detail && detail.cells) || []) {
        const { x, y } = this.xy(i);
        const ring = new Graphics();
        ring.roundRect(x + 2, y + 2, this.cellSize - 4, this.cellSize - 4, 8).stroke({ color: 0x9fe0ff, width: 6 });
        ring.alpha = 0;
        this.fx.addChild(ring);
        tween(ring, { alpha: 0.9 }, 120).then(() => tween(ring, { alpha: 0 }, 380).then(() => ring.destroy()));
      }
      if (icon) {
        await tween(icon, { alpha: 1 }, 150);
        await tween(icon, { alpha: 0 }, 420);
      }
    }

    await tween(g, { alpha: 0 }, 160);
    g.destroy();
    if (icon && !icon.destroyed) {
      await tween(icon, { alpha: 0 }, 140);
      icon.destroy();
    }
    // HAMMER's own WILDs get a stronger entrance than a normal cascade pop-in,
    // so the player reads "Hammer made this WILD" (§ Feature presentation pass).
    this._reconcile(afterBoard, kind === "HAMMER" ? 1.6 : 1);
  }
}

const fmt = (x) => (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
