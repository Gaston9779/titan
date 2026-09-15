import { Application } from "pixi.js";
import { App } from "./app.js";
import { loadGameAssets, ASSETS, url } from "./assets.js";
import { initHelp } from "./help.js";
import { shouldAutoContinue } from "./bonusFlow.js";

const $ = (id) => document.getElementById(id);
// TUNABLE_V1 (UI/config only — never touched by the engine or its RNG): the
// selectable stake ladder, up to the requested €50 ceiling.
const BET_STEPS = [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 40, 50];

// Decorative looping background video(s) (never affect gameplay/state/timing).
// Base and Bonus share ONE architecture: both elements exist from boot, both
// play continuously (silently, whichever is hidden), and CSS crossfades
// opacity on Bonus entry/exit (see #bg[data-phase] rules) — no re-fetch, no
// black flash, no recreating a video element per spin. The static PNG poster
// shows for Base until its first frame paints.
function startBackgroundVideo(id) {
  const v = document.getElementById(id);
  if (!v) return;
  v.muted = true; // required for autoplay
  const kick = () => v.play().catch(() => {});
  kick();
  // some engines only allow play() after a user gesture — retry once on first input
  window.addEventListener("pointerdown", kick, { once: true });
  window.addEventListener("keydown", kick, { once: true });
  v.addEventListener("canplay", () => v.classList.add("ready"), { once: true });
}

// ---- deliberate background composition (NOT a centred cover crop) ----------
// Source video is 1608×1288 (ratio ~1.248). On a 16:9-ish viewport `cover` locks
// width, leaving vertical slack we pan through. We frame the TOP band so the
// whole chained Titan shows (head → rock base; the foreground plaza the board
// sits over is dropped), then scale up toward the Titan so he is dominant left.
const SRC_RATIO = 1608 / 1288;
function positionBackgroundVideo() {
  const va = window.innerWidth / window.innerHeight;
  // fraction of source HEIGHT visible under `cover` before our extra scale
  const visH = va >= SRC_RATIO ? SRC_RATIO / va : 1;
  // object-position-y so the visible window starts ~1% into the source: this
  // frames the whole Titan (head → rock base) and drops the foreground plaza.
  const opyPct = visH < 1 ? Math.min(55, Math.max(0, (0.012 / (1 - visH)) * 100)) : 50;
  // zoom toward the Titan so he is DOMINANT on the left. Mild (≤1.14), origin
  // hard-left so the enlargement pushes the city/foreground out, not the Titan.
  const scale = va > 2 ? 1.18 : va > 1.55 ? 1.1 : 1.04;
  const originX = va > 1.55 ? 10 : 22;
  const originY = 24;
  const S = document.documentElement.style;
  S.setProperty("--bg-obj-pos", `50% ${opyPct.toFixed(1)}%`);
  S.setProperty("--bg-scale", scale.toFixed(3));
  S.setProperty("--bg-origin", `${originX}% ${originY}%`);
  // poster PNG approximates the same framing (only visible for a split second)
  S.setProperty("--bg-poster-pos", `${(originX * 0.7).toFixed(0)}% ${opyPct.toFixed(1)}%`);
  S.setProperty("--bg-poster-size", (scale * 100).toFixed(0) + "%");
}

async function boot() {
  positionBackgroundVideo();
  window.addEventListener("resize", positionBackgroundVideo);
  startBackgroundVideo("bg-video");
  startBackgroundVideo("bg-video-bonus"); // preloaded + playing (hidden) before any Bonus ever triggers
  // Fixed square canvas — CSS scales it into the board frame; cells stay square and
  // 6×6 / 7×7 / 8×8 never move the shell.
  const pixi = new Application();
  await pixi.init({
    width: 900,
    height: 900,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });

  await loadGameAssets(); // one decode per texture, cached by Pixi Assets
  $("pixi-holder").appendChild(pixi.canvas);

  const app = new App(pixi);
  window.__forge = app;

  // ---------- ONE gameplay-cluster layout ----------
  // The cluster is  LEFT HUD + gapLeft + BOARD + gapRight + RIGHT HUD.
  // THE GRID IS AUTHORITATIVE: --grid is sized first (board-relative, no viewport
  // magic numbers) exactly like before board_outer_frame.png existed. The casing
  // is then a THIN border wrapped tightly around that grid (CSS border-image —
  // real nine-slice: corners keep their native scale, only the plain rail
  // stretches). The frame never shrinks the grid to fit its own proportions.
  const stage = $("stage");
  const S = document.documentElement.style;

  // board_outer_frame.png (1254² native) slice thickness in SOURCE px, measured
  // off the transparent opening (116 left / 144 top / 118 right / 200 bottom —
  // bottom is thicker because the bottom ornament sits inside that band).
  const FB_L = 116, FB_T = 144, FB_R = 118, FB_B = 200;
  // ONE scale knob drives all four border widths (so corners stay undistorted:
  // each corner scales its native w×h by this same factor). Small = a tight hug.
  const BORDER_MIN = 18, BORDER_MAX = 30, BORDER_RATIO = 0.038; // left-border px = clamp(.., grid*ratio, ..)
  // the pixi grid fills ~94.8% of its canvas (see board.js _build) — the canvas
  // must be this much bigger than --grid so the VISIBLE cells land on --grid.
  const CANVAS_FILL = 0.948;

  const CBAR_OPAQUE = 0.9;       // fraction of the bar element #controls budgets (rest overflows up, harmlessly)
  const HUD_RATIO = 0.4;         // ≥ --st-h(0.78) · 261/564  so the Shards ladder fits the column
  const HUD_MIN = 150;
  const HUD_MAX = 250;
  const GRID_MAX = 900;          // cap the visible grid on very large viewports
  const CLUSTER_GAP = 16;        // gap between a HUD column and the FRAME (both sides)
  const CONTROLS_GAP = 10;       // gap between the casing base and the opaque bar
  const CBAR_MIN = 190;
  const CBAR_MAX = 260;
  const CBAR_RATIO = 0.34;       // controls-bar element height / --grid — restored substantial

  const hudWidth = (grid) => Math.max(HUD_MIN, Math.min(HUD_MAX, Math.round(grid * HUD_RATIO)));
  const barHeight = (grid) => Math.max(CBAR_MIN, Math.min(CBAR_MAX, Math.round(grid * CBAR_RATIO)));
  const borderL = (grid) => Math.max(BORDER_MIN, Math.min(BORDER_MAX, grid * BORDER_RATIO));

  const app$ = $("app");
  function layout() {
    // Vertical budget from the VIEWPORT minus fixed chrome — not stage.clientHeight
    // (which settles a frame late at boot and would seed a too-small board).
    const cs = getComputedStyle(app$);
    const padY =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 2 * (parseFloat(cs.rowGap) || 0);
    const headerH = $("hud-top").offsetHeight || 34;
    const viewH = window.innerHeight;
    const stageW = stage.clientWidth || window.innerWidth - 28;

    // Converge: grid ⇄ HUD width ⇄ ControlsBar height ⇄ frame border all depend
    // on each other (all board-relative). Monotonic — settles in 2–3 passes.
    let grid = Math.min(viewH * 0.66, stageW * 0.5);
    for (let k = 0; k < 7; k++) {
      const bL = borderL(grid);
      const bT = (bL * FB_T) / FB_L, bB = (bL * FB_B) / FB_L, bR = (bL * FB_R) / FB_L;
      const frameH = grid + bT + bB;
      const frameW = grid + bL + bR;
      const barBudget = barHeight(grid) * CBAR_OPAQUE; // only the opaque bar costs height
      // vertical: header + gap + bar are chrome; the casing (frameH) is the consumer
      const availH = viewH - headerH - padY - barBudget - CONTROLS_GAP - (frameH - grid);
      // horizontal: the HUD columns flank the CASING (not just the grid)
      const hud = hudWidth(grid);
      const availWFrame = stageW - 2 * hud - 2 * CLUSTER_GAP;
      grid = Math.min(availH, availWFrame - (frameW - grid), GRID_MAX);
    }
    grid = Math.max(280, Math.floor(grid));

    const bL = borderL(grid);
    const bT = Math.round((bL * FB_T) / FB_L);
    const bB = Math.round((bL * FB_B) / FB_L);
    const bR = Math.round((bL * FB_R) / FB_L);
    const canvasSize = Math.round(grid / CANVAS_FILL);
    const canvasPad = (canvasSize - grid) / 2;

    S.setProperty("--grid", grid + "px");
    S.setProperty("--fb-l", Math.round(bL) + "px");
    S.setProperty("--fb-t", bT + "px");
    S.setProperty("--fb-r", bR + "px");
    S.setProperty("--fb-b", bB + "px");
    S.setProperty("--canvas-size", canvasSize + "px");
    S.setProperty("--canvas-x", (bL - canvasPad).toFixed(1) + "px");
    S.setProperty("--canvas-y", (bT - canvasPad).toFixed(1) + "px");
    S.setProperty("--frame-s", (bL / FB_L).toFixed(4));
    S.setProperty("--hud-w", hudWidth(grid) + "px");
    S.setProperty("--cluster-gap", CLUSTER_GAP + "px");
    S.setProperty("--cbar-h", barHeight(grid) + "px");
  }
  new ResizeObserver(layout).observe(stage);
  new ResizeObserver(layout).observe(app$);
  window.addEventListener("resize", layout);
  window.addEventListener("load", layout);
  layout();
  // catch late reflow (fonts, first pixi paint, loader removal)
  requestAnimationFrame(layout);
  [60, 160, 400].forEach((t) => setTimeout(layout, t));

  // The very first visible frame must already show the real deterministic board —
  // never an empty grid. Populate round 0's initial layout, THEN drop the loader.
  app.showIdleBoard();
  const loading = $("loading");
  loading.classList.add("done");
  setTimeout(() => loading.remove(), 500);

  // ---------- bet ----------
  let betIdx = BET_STEPS.indexOf(app.bet);
  if (betIdx < 0) betIdx = 2;
  const applyBet = () => {
    app.bet = BET_STEPS[betIdx];
    app.hud.setBet(app.bet);
    const busy = app.playing || app.bonusPending; // bet + Buy Bonus are locked for the whole Bonus, not just mid-spin
    $("bet-dec").disabled = betIdx === 0 || busy;
    $("bet-inc").disabled = betIdx === BET_STEPS.length - 1 || busy;
    $("buy-bonus").disabled = busy; // cost itself only shown in the confirmation modal now (no text drawn over the artwork)
  };
  $("bet-dec").addEventListener("click", () => { if (betIdx > 0) { betIdx--; applyBet(); } });
  $("bet-inc").addEventListener("click", () => { if (betIdx < BET_STEPS.length - 1) { betIdx++; applyBet(); } });
  applyBet();

  // ---------- spin / states ----------
  // There is NO visible SKIP control in the player UI. The presentation-skip path
  // still exists for testing: Space during a spin, or the developer drawer button.
  const spinBtn = $("spin");
  const setBusy = (busy) => {
    spinBtn.disabled = busy;
    spinBtn.classList.toggle("is-spinning", busy);
    // dev "start a different round" actions stay locked for the WHOLE Bonus,
    // not just mid-spin, so a dev can't abandon a paused Bonus by accident
    $("dbg-spin").disabled = busy || app.bonusPending;
    $("dbg-replay").disabled = busy || app.bonusPending;
    const dbgSkip = $("dbg-skip");
    if (dbgSkip) dbgSkip.disabled = !busy;
    applyBet();
  };

  let auto = false;
  async function doSpin(fn) {
    if (help?.isOpen() || !$("buybonus-modal").classList.contains("hidden")) return; // a modal is open — no new spins
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      app.hud.debug("ERROR: " + (err && err.message ? err.message : String(err)));
    }
    setBusy(false);
    // Bonus Free Spins are ALWAYS manual — autoplay never auto-consumes them
    // (it simply pauses while app.bonusPending, and resumes after the Bonus
    // ends on its own, since this same check runs again after every doSpin).
    if (shouldAutoContinue({ auto, playing: app.playing, bonusPending: app.bonusPending, balance: app.balance, bet: app.bet })) {
      setTimeout(() => doSpin(() => app.pressSpin()), 350);
    }
  }

  spinBtn.addEventListener("click", () => doSpin(() => app.pressSpin()));
  $("dbg-skip")?.addEventListener("click", () => app.requestSkip());
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.tagName === "INPUT") return;
    e.preventDefault();
    if (app.playing) app.requestSkip();
    else doSpin(() => app.pressSpin());
  });

  // ---------- turbo / auto ----------
  const turboBtn = $("turbo");
  let turbo = false;
  turboBtn.addEventListener("click", () => {
    turbo = !turbo;
    turboBtn.classList.toggle("on", turbo);
    app.setSpeed(turbo ? 5 : 1);
    syncSpeedButtons(turbo ? 5 : 1);
  });
  $("auto").addEventListener("click", () => {
    auto = !auto;
    $("auto").classList.toggle("on", auto);
    // toggling autoplay on never itself fires a Bonus spin — only a manual SPIN does
    if (auto && !app.playing && !app.bonusPending) doSpin(() => app.pressSpin());
  });

  // ---------- sound / fullscreen (presentation stubs) ----------
  let muted = false;
  $("sound").addEventListener("click", () => {
    muted = !muted;
    $("sound").classList.toggle("on", !muted);
  });
  $("sound").classList.add("on");
  $("fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  });

  // ---------- help / paytable menu (player-facing top-right MENU button) ----------
  const help = initHelp(app);
  $("debug-toggle").addEventListener("click", () => help?.toggle());

  // ---------- Buy Bonus (price always derived from the current bet) ----------
  const bbModal = $("buybonus-modal");
  const openBuyBonus = () => {
    if (app.playing || app.bonusPending || help?.isOpen()) return;
    $("bb-bet").textContent = app.bet.toFixed(2);
    $("bb-total").textContent = app.buyBonusCost().toFixed(2);
    $("bb-buy").disabled = app.balance < app.buyBonusCost();
    bbModal.classList.remove("hidden");
    bbModal.setAttribute("aria-hidden", "false");
  };
  const closeBuyBonus = () => {
    bbModal.classList.add("hidden");
    bbModal.setAttribute("aria-hidden", "true");
  };
  $("buy-bonus").addEventListener("click", openBuyBonus);
  $("bb-cancel").addEventListener("click", closeBuyBonus);
  $("buybonus-backdrop").addEventListener("click", closeBuyBonus);
  $("bb-buy").addEventListener("click", () => {
    closeBuyBonus(); // explicit confirmation required — this IS that confirmation
    doSpin(() => app.buyBonus());
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !bbModal.classList.contains("hidden")) closeBuyBonus();
  });

  // ---------- developer drawer (QA/dev only — backtick to avoid a second visible button) ----------
  const drawer = $("debug");
  $("debug-close").addEventListener("click", () => drawer.classList.add("hidden"));
  window.addEventListener("keydown", (e) => {
    if (e.code === "Backquote" && e.target.tagName !== "INPUT") drawer.classList.toggle("hidden");
  });
  $("dbg-info").addEventListener("change", (e) => (app.showInfo = e.target.checked));
  $("dbg-spin").addEventListener("click", () =>
    doSpin(() => app.replay($("dbg-seed").value, parseInt($("dbg-round").value, 10) || 0)),
  );
  $("dbg-replay").addEventListener("click", () =>
    doSpin(() => app.play($("dbg-seed").value, parseInt($("dbg-round").value, 10) || 0)),
  );
  document.querySelectorAll(".preset").forEach((btn) =>
    btn.addEventListener("click", () => {
      $("dbg-seed").value = btn.dataset.seed;
      $("dbg-round").value = btn.dataset.round;
      doSpin(() => app.replay(btn.dataset.seed, parseInt(btn.dataset.round, 10)));
    }),
  );
  const spdButtons = [...document.querySelectorAll(".spd")];
  function syncSpeedButtons(v) {
    spdButtons.forEach((b) => b.classList.toggle("active", parseInt(b.dataset.speed, 10) === v));
  }
  spdButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      const v = parseInt(btn.dataset.speed, 10);
      app.setSpeed(v);
      syncSpeedButtons(v);
      turbo = v === 5;
      turboBtn.classList.toggle("on", turbo);
    }),
  );

  app.hud.debug("Ready. SPIN (or Space).");
}

boot();
