// DOM HUD — reflects engine-provided values only, rendered with approved artwork.
// The vertical meter is ONE component: it shows HEAT in the base game and
// MOLTEN CHARGE in the bonus, driven by the matching engine value. No game logic.
import { ASSETS, url } from "./assets.js";
import { clock } from "./render/tween.js";

// Heat/Pressure device base timings (1x speed) — must match the --heat-*/
// --pressure-*-ms defaults in styles.css :root exactly.
const DEVICE_MS = { heatFill: 800, heatBurst: 820, heatFrame: 600, heatOrb: 750, pressureSurge: 780, pressureEcho: 500 };

const $ = (id) => document.getElementById(id);

const PHASE = {
  PAID: ["base", "BASE GAME"],
  BASE: ["base", "BASE GAME"],
  BONUS: ["bonus", "AWAKEN THE TITAN · FREE SPINS"],
  AWAKENED: ["awakened", "THE TITAN AWAKENS · 8×8"],
};

const SHARD_SRC = ASSETS.shards; // { 2: url, 4: url, ... 64: url }

// Explicit pixel-fraction centres of the 3 circular sockets in
// forge_cores_panel.png (445×236 art, measured on a 5%% ruler overlay).
// Each active core orb is placed at exactly its own socket centre — NOT by
// generic equal spacing. Tune per slot here.
const CORE_SLOTS = [
  { x: 0.275, y: 0.535 }, // slot 1 (left)   — socket spans x≈20–35%, y≈37–71%
  { x: 0.495, y: 0.535 }, // slot 2 (centre) — under the top diamond stud
  { x: 0.710, y: 0.535 }, // slot 3 (right)  — socket spans x≈63–78%
];

export class Hud {
  constructor() {
    this.el = {
      app: $("app"),
      bgFx: $("bg-fx"),
      bg: $("bg"), // Base<->Bonus background-video crossfade (see styles.css #bg[data-phase])
      balance: $("balance"),
      betVal: $("bet-val"),
      win: $("win"),
      winItem: document.querySelector(".w-win"),
      pill: $("win-pill"),
      pillVal: $("win-pill-val"),
      vmeter: $("vmeter"),
      vmeterFill: $("vmeter-fill"),
      vmeterCap: $("vmeter-cap"),
      vmeterVal: $("vmeter-val"),
      pressureOrb: $("pressure-orb"),
      phDevice: $("ph-device"),
      coresPanel: $("cores-panel"),
      shardSlots: [...document.querySelectorAll("#shard-slots .shard-slot")],
      fsCount: $("fscount"),
      banner: $("banner"),
      phase: $("phase"),
      dbgOut: $("dbg-out"),
    };
    this.phaseKind = "base";
    this.heat = { pct: 0, text: "0.0" };
    this.molten = { pct: 0, text: "0/0" };
    this._meterPct = 0; // last rendered fill % (for the "increased" burst)
    this._shardPeak = 0; // highest shard multiplier reached this round
    this._shardActive = new Set();
    this._seatCoreOrbs();
    this._seatShardLadder();
    this.reset();
  }

  // fix the shard artwork per rung ONCE (2x top → 64x bottom); states are classes
  _seatShardLadder() {
    for (const sl of this.el.shardSlots) {
      const v = +sl.dataset.mult;
      const u = SHARD_SRC[v];
      const img = sl.querySelector(".shard-img");
      if (u && img) img.style.backgroundImage = `url("${url(u)}")`;
    }
  }

  // place each ring orb at its exact socket centre (explicit per-slot coords)
  _seatCoreOrbs() {
    const rings = this.el.coresPanel ? [...this.el.coresPanel.querySelectorAll(".ring")] : [];
    rings.forEach((r, i) => {
      const s = CORE_SLOTS[i];
      if (!s) return;
      r.style.left = (s.x * 100).toFixed(2) + "%";
      r.style.top = (s.y * 100).toFixed(2) + "%";
    });
  }

  reset() {
    this.phaseKind = "base";
    this.heat = { pct: 0, text: "0.0" };
    this.molten = { pct: 0, text: "0/0" };
    this._meterPct = 0;
    this._shardPeak = 0;
    this._shardActive = new Set();
    this._pressureRank = 0;
    this.setPressure("COLD");
    this.setCores(0);
    this.setShards([]);
    this.setFreeSpins(null);
    this.hideBanner();
    this.setPhase("BASE");
    this.setWin(0);
    this.coreTension(0);
    this._renderMeter(true);
  }

  // presentation-only: dress the cores panel as trigger cores accumulate
  coreTension(n) {
    const p = this.el.coresPanel;
    if (!p) return;
    p.dataset.tension = n >= 3 ? "3" : n >= 2 ? "2" : "0";
  }

  setBalance(v) { this.el.balance.textContent = money(v); }
  setBet(v) {
    if (!this.el.betVal) return;
    const s = money(v);
    this.el.betVal.textContent = s;
    this.el.betVal.classList.toggle("long", s.length > 4); // e.g. "50.00" — shrink to keep the plaque un-crowded
  }

  setWin(v) {
    const s = money(v);
    this.el.win.textContent = s;
    this.el.pillVal.textContent = s;
    this.el.pill.classList.toggle("hidden", !(v > 1e-7));
    if (this.el.winItem) this.el.winItem.classList.toggle("hot", v > 0);
  }

  setPhase(p) {
    const [cls, text] = PHASE[p] || PHASE.BASE;
    this.phaseKind = cls;
    this.el.app.dataset.phase = cls;
    if (this.el.bgFx) this.el.bgFx.dataset.phase = cls;
    if (this.el.bg) this.el.bg.dataset.phase = cls; // crossfades background_bonus.mp4 in/out
    if (this.el.phase) this.el.phase.textContent = text; // legacy strip (removed)
    this._renderMeter();
  }

  // ---- the ONE vertical meter -------------------------------------------
  setHeat(centi, thresholdCenti) {
    const pct = thresholdCenti ? Math.min(100, Math.max(0, (centi / thresholdCenti) * 100)) : 0;
    this.heat = { pct, text: (centi / 100).toFixed(1) };
    this._renderMeter();
  }

  setMolten(meter, threshold) {
    const pct = threshold ? Math.min(100, Math.max(0, (meter / threshold) * 100)) : 0;
    this.molten = { pct, text: `${meter}/${threshold || 0}` };
    this._renderMeter();
  }

  // `quiet` = no "increased" burst (used by reset())
  _renderMeter(quiet = false) {
    const m = this.el.vmeter;
    if (!m) return;
    const bonus = this.phaseKind === "bonus" || this.phaseKind === "awakened";
    const src = bonus ? this.molten : this.heat;
    this.el.vmeterCap.textContent = bonus ? "MOLTEN CHARGE" : "HEAT";
    this.el.vmeterVal.textContent = src.text;
    const pct = Math.max(0, Math.min(100, src.pct));

    // continuous fill — clip from the TOP so it rises from the bottom
    this.el.vmeterFill.style.clipPath = `inset(${(100 - pct).toFixed(1)}% 0 0 0)`;
    this.el.vmeterFill.style.setProperty("--fill", pct.toFixed(1) + "%"); // bubble travel

    // visual-only intensity zones from the REAL engine % (no gameplay thresholds)
    const level = pct >= 82 ? "full" : pct >= 58 ? "high" : pct >= 30 ? "mid" : "low";
    m.dataset.level = level;
    // the circular pressure orb above the column also reacts to heat intensity
    if (this.el.pressureOrb) this.el.pressureOrb.dataset.heat = level;

    // any real increase → decisive synced burst on the whole forge device
    // (fill rise + pulse sweep + crest flare + frame glow + orb punch + sparks),
    // with a subtle echo pulse on the Pressure orb above so they feel connected.
    if (!quiet && pct > this._meterPct + 1.5) {
      // 2026-09-06: durations match the slowed heatPump/pressureEcho CSS above
      // (was 420/400ms — too abrupt for a molten reaction).
      pulse(m, "pumped", this, "_pumpT", DEVICE_MS.heatBurst);
      pulse(this.el.phDevice, "heat-echo", this, "_echoT", DEVICE_MS.pressureEcho);
    }
    this._meterPct = pct;
  }

  setPressure(tier) {
    const src = ASSETS.hud.PRESSURE[tier] || ASSETS.hud.PRESSURE.COLD;
    this.el.pressureOrb.src = url(src);
    this.el.pressureOrb.dataset.tier = tier;
    // Pressure STEP-UP → decisive orb response + energy streak down the column.
    // (Pressure only rises within a cascade; falls are the sequence reset — quiet.)
    const rank = PRESSURE_RANK[tier] ?? 0;
    if (rank > (this._pressureRank ?? 0)) {
      pulse(this.el.phDevice, "surge", this, "_surgeT", DEVICE_MS.pressureSurge); // matches the slowed pressureSurge CSS (was 460ms)
    }
    this._pressureRank = rank;
  }

  // presentation-only: fire the SAME Pressure/Heat "surge" reaction on demand
  // (reuses the existing device look) — used by the Bonus-entry FX sequence.
  forgeSurge() {
    pulse(this.el.phDevice, "surge", this, "_surgeT", DEVICE_MS.pressureSurge);
  }

  // Heat/Pressure device timing is plain CSS transition/animation, which
  // clock.speed cannot reach by itself — rescale the underlying custom
  // properties here (2x/5x proportionally faster, instant collapses to ~0).
  setSpeedScale(speed, instant) {
    const s = document.documentElement.style;
    const ms = (base) => (instant ? 1 : Math.max(40, Math.round(base / (speed || 1)))) + "ms";
    s.setProperty("--heat-fill-ms", ms(DEVICE_MS.heatFill));
    s.setProperty("--heat-burst-ms", ms(DEVICE_MS.heatBurst));
    s.setProperty("--heat-frame-ms", ms(DEVICE_MS.heatFrame));
    s.setProperty("--heat-orb-ms", ms(DEVICE_MS.heatOrb));
    s.setProperty("--pressure-surge-ms", ms(DEVICE_MS.pressureSurge));
    s.setProperty("--pressure-echo-ms", ms(DEVICE_MS.pressureEcho));
  }

  setCores(n) {
    this.el.coresPanel.dataset.cores = String(Math.max(0, Math.min(5, n | 0)));
  }

  // Vertical multiplier LADDER. `arg` = the shard multiplier values currently on
  // the board (from the engine trace); a rung is ACTIVE if a shard of that value
  // is present. The highest value reached this round is the PEAK rung. A rung
  // that just turned on (or a new peak) gets a one-shot "just reached" burst.
  setShards(arg) {
    const slots = this.el.shardSlots;
    if (!slots || !slots.length) return;
    const present = new Set(
      (Array.isArray(arg) ? arg : new Array(Math.max(0, arg | 0)).fill(2)).map((v) => +v),
    );
    const peak = Math.max(0, ...present, this._shardPeak);
    this._shardPeak = peak;

    slots.forEach((sl) => {
      const v = +sl.dataset.mult;
      const active = present.has(v);
      const wasActive = this._shardActive.has(v);
      sl.classList.toggle("on", active);
      sl.classList.toggle("peak", v === peak && peak > 0);
      if ((active && !wasActive) || (v === peak && peak > this._prevPeak)) {
        sl.classList.remove("just");
        void sl.offsetWidth;
        sl.classList.add("just");
        setTimeout(() => sl.classList.remove("just"), 620);
      }
    });
    this._prevPeak = peak;
    this._shardActive = present;
  }

  setFreeSpins(n) { this.el.fsCount.textContent = n == null ? "–" : String(n); }

  banner(text, holdMs = 900) {
    this.el.banner.textContent = text;
    this.el.banner.classList.remove("hidden");
    clearTimeout(this._bt);
    if (holdMs) this._bt = setTimeout(() => this.hideBanner(), holdMs);
  }
  hideBanner() { this.el.banner.classList.add("hidden"); }

  debug(obj) {
    if (this.el.dbgOut) this.el.dbgOut.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  }
}

const money = (v) => (Number.isFinite(v) ? v.toFixed(2) : "0.00");

// Pressure tiers, low → high (F5). Only a STEP UP fires the surge animation.
const PRESSURE_RANK = { COLD: 0, WARM: 1, HOT: 2, OVERHEAT: 3, CRITICAL: 4 };

// restart a one-shot CSS animation class on `el`, auto-removed after `ms`
// (scaled by clock.speed / skipped under clock.instant — the CSS custom
// properties in setSpeedScale() control the animation's OWN duration; this
// timer only has to remove the class no sooner than that finishes).
function pulse(el, cls, owner, timerKey, ms) {
  if (!el) return;
  clearTimeout(owner[timerKey]);
  if (clock.instant) {
    el.classList.remove(cls);
    return;
  }
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(cls);
  owner[timerKey] = setTimeout(() => el.classList.remove(cls), ms / (clock.speed || 1));
}
