// Small VFX helpers. Procedural (Graphics) + a pooled sprite layer for the two
// supplied raster win FX (win_ring / win_burst). Textures are loaded once by
// assets.js and only referenced here — never re-decoded per win.
import { Graphics, Sprite, Texture } from "pixi.js";
import { tween, clock } from "./tween.js";
import { tex } from "../assets.js";

// ---- pooled FX sprites (reused; never created per cascade after warm-up) ----
const _pool = {};
function fxSprite(id) {
  const meta = tex(id);
  if (!meta) return null;
  const p = (_pool[id] = _pool[id] || []);
  const sp = p.pop() || new Sprite(meta.texture);
  sp.texture = meta.texture;
  sp.anchor.set(0.5);
  sp.alpha = 1;
  sp.rotation = 0;
  sp.scale.set(1);
  sp.visible = true;
  sp.blendMode = "add";
  sp.__id = id;
  return sp;
}
function releaseFx(sp) {
  if (!sp || sp.destroyed) return;
  sp.visible = false;
  if (sp.parent) sp.parent.removeChild(sp);
  const p = (_pool[sp.__id] = _pool[sp.__id] || []);
  if (p.length < 24) p.push(sp);
  else sp.destroy();
}

// win_ring — sits BEHIND the winning symbol, snaps in then expands + fades.
export function winRing(layer, cx, cy, size, speed = 1) {
  if (clock.instant) return;
  const sp = fxSprite("fx:WIN_RING");
  if (!sp) return;
  const s = size * 1.02;
  sp.width = sp.height = s * 0.62;
  sp.position.set(cx, cy);
  sp.alpha = 0;
  layer.addChild(sp);
  const d = 260 / speed;
  tween(sp, { alpha: 0.95 }, 70 / speed)
    .then(() =>
      Promise.all([
        tween(sp, { width: s * 1.28, height: s * 1.28 }, d),
        tween(sp, { alpha: 0 }, d),
      ]),
    )
    .then(() => releaseFx(sp));
}

// win_burst — fires as the winning symbol is removed.
export function winBurst(layer, cx, cy, size, speed = 1) {
  if (clock.instant) return;
  const sp = fxSprite("fx:WIN_BURST");
  if (!sp) return;
  const s = size * 1.15;
  sp.width = sp.height = s * 0.5;
  sp.position.set(cx, cy);
  sp.rotation = Math.random() * 0.6 - 0.3;
  sp.alpha = 0.95;
  layer.addChild(sp);
  const d = 300 / speed;
  Promise.all([
    tween(sp, { width: s * 1.35, height: s * 1.35 }, d),
    tween(sp, { alpha: 0 }, d),
  ]).then(() => releaseFx(sp));
}

// ---- cached radial-glow texture (one decode, reused + tinted per instance) ----
// A soft white radial disc rendered ONCE to a canvas; every aura is a tinted
// Sprite over this single texture, so no filter and no per-frame allocation.
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const S = 160;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.42, "rgba(255,255,255,0.55)");
  g.addColorStop(0.72, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _glowTex = Texture.from(cv);
  return _glowTex;
}

// A reusable aura sprite (anchored centre). Caller positions + drives the pulse.
export function auraSprite(color, alpha = 0.4) {
  const sp = new Sprite(glowTexture());
  sp.anchor.set(0.5);
  sp.tint = color;
  sp.alpha = alpha;
  sp.blendMode = "add";
  return sp;
}

// One-shot rune shimmer: a bright band that sweeps across a cell then fades.
export function shimmer(layer, cx, cy, size, color = 0xbfefff, ms = 460) {
  if (clock.instant) return;
  const g = new Graphics();
  const w = size * 0.34;
  g.rect(-w / 2, -size * 0.62, w, size * 1.24).fill({ color });
  g.rotation = -0.5;
  g.position.set(cx - size * 0.7, cy);
  g.alpha = 0;
  g.blendMode = "add";
  layer.addChild(g);
  tween(g, { alpha: 0.85 }, ms * 0.3)
    .then(() => Promise.all([tween(g, { x: cx + size * 0.7 }, ms * 0.7), tween(g, { alpha: 0 }, ms * 0.7)]))
    .then(() => g.destroy());
}

// Expanding ring pulse (Forge Core landing / bonus anticipation).
export function ringPulse(layer, cx, cy, size, color = 0xff9a3c, ms = 520) {
  if (clock.instant) return;
  const g = new Graphics();
  g.circle(0, 0, size * 0.32).stroke({ color, width: Math.max(3, size * 0.05) });
  g.position.set(cx, cy);
  g.alpha = 0.9;
  g.blendMode = "add";
  layer.addChild(g);
  Promise.all([tween(g.scale, { x: 3.1, y: 3.1 }, ms), tween(g, { alpha: 0 }, ms)]).then(() => g.destroy());
}

// Controlled full-board light flash (64x Shard escalation only) — a brief,
// additive wash over the WHOLE board, not an opaque cover, so symbols/text
// stay fully readable through it.
export function boardFlash(layer, w, h, color = 0xffcf8a, ms = 220, peakAlpha = 0.22) {
  if (clock.instant) return;
  const g = new Graphics();
  g.rect(0, 0, w, h).fill({ color });
  g.alpha = 0;
  g.blendMode = "add";
  layer.addChild(g);
  tween(g, { alpha: peakAlpha }, ms * 0.35).then(() => tween(g, { alpha: 0 }, ms * 0.65).then(() => g.destroy()));
}

// Decaying positional shake on a display object (restores original position).
export async function shake(target, amount = 14, ms = 320) {
  if (clock.instant || !target) return;
  const ox = target.position.x;
  const oy = target.position.y;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const f = 1 - i / steps;
    target.position.set(ox + (Math.random() * 2 - 1) * amount * f, oy + (Math.random() * 2 - 1) * amount * f);
    await tween({ v: 0 }, { v: 1 }, ms / steps);
  }
  target.position.set(ox, oy);
}

// Ember/debris burst from a point into `layer`.
export function embers(layer, x, y, count = 14, spread = 90, colors = [0xff7a2f, 0xffc24e, 0x9a2f12]) {
  if (clock.instant) return;
  for (let i = 0; i < count; i++) {
    const g = new Graphics();
    const r = 2 + Math.random() * 4;
    g.circle(0, 0, r).fill({ color: colors[(Math.random() * colors.length) | 0] });
    g.position.set(x, y);
    g.alpha = 0.95;
    layer.addChild(g);
    const ang = Math.random() * Math.PI * 2;
    const dist = spread * (0.4 + Math.random());
    tween(g, { x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist - 20, alpha: 0 }, 420 + Math.random() * 260).then(
      () => g.destroy(),
    );
  }
}

// Shard -> cluster energy link (SHARD win-interaction, §F): a brief beam + a
// travelling spark from a Shard's cell to the winning cluster's label anchor,
// so a multiplier contribution reads as coming FROM that Shard, not out of thin
// air. Procedural only — no new art.
export function shardLink(layer, fx, fy, tx, ty, color = 0xffb060, ms = 220) {
  if (clock.instant) return;
  const beam = new Graphics();
  beam.moveTo(fx, fy).lineTo(tx, ty).stroke({ color, width: 2.5, alpha: 0.7 });
  beam.alpha = 0;
  beam.blendMode = "add";
  layer.addChild(beam);
  const spark = new Graphics();
  spark.circle(0, 0, 5).fill({ color });
  spark.position.set(fx, fy);
  spark.blendMode = "add";
  layer.addChild(spark);
  tween(beam, { alpha: 0.85 }, ms * 0.25);
  tween(spark, { x: tx, y: ty }, ms).then(() => {
    Promise.all([tween(beam, { alpha: 0 }, ms * 0.4), tween(spark, { alpha: 0 }, ms * 0.4)]).then(() => {
      beam.destroy();
      spark.destroy();
    });
  });
}

// Bright directional streak across a rect (Blade sweep).
export function streak(layer, { x, y, w, h, vertical }) {
  const g = new Graphics();
  if (vertical) g.rect(-w / 2, -h / 2, w, h).fill({ color: 0xffd8a0 });
  else g.rect(-w / 2, -h / 2, w, h).fill({ color: 0xffd8a0 });
  g.position.set(x, y);
  g.alpha = 0;
  layer.addChild(g);
  return g;
}
