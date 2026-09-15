// Symbol + cell-frame construction from the supplied modular board pack.
//
//   cellFrame(s, kind)       -> Sprite      a STATIC per-cell socket (never moves):
//                                           cell_base / cell_molten / cell_highlight
//   setCellWinning(frame, on)-> void        swap a frame's texture to cell_highlight
//   makeSymbol(cell, s, mode)-> Container   the MOVING symbol: [aura?] [sprite] [lock?]
//
// The frame layer is separate from the symbol layer, so win_ring / cell_highlight
// sit BEHIND the symbol art and physical fall/gravity moves only the symbols.
// Optical scale + special-symbol emphasis are ALL driven by render/presentation.js.
import { Container, Sprite } from "pixi.js";
import { tex, SYMBOL_FIT, SHARD_FIT, CELL_BLEED } from "../assets.js";
import { OPTICAL, PER_SYMBOL_NUDGE, WILD, CORE } from "./presentation.js";
import { auraSprite } from "./fx.js";

const isSym = (k) => k === "SYM";

// optical scale for a symbol/shard cell — tier hierarchy + per-asset nudge
function opticalScale(cell) {
  if (isSym(cell.k)) {
    const tier = cell.s && cell.s[0] === "H" ? OPTICAL.HIGH : OPTICAL.LOW;
    return tier * (PER_SYMBOL_NUDGE[cell.s] || 1);
  }
  if (cell.k === "WILD") return OPTICAL.WILD;
  if (cell.k === "CORE") return OPTICAL.CORE;
  if (cell.k === "SHARD") return OPTICAL.SHARD;
  return 1;
}

// centre a trimmed sprite so its VISIBLE content is centred in an s×s cell,
// scaled so the visible content's longest side == box.
function fitSprite(meta, s, box, tuneScale = 1) {
  const sp = new Sprite(meta.texture);
  sp.anchor.set(0.5);
  const longest = Math.max(meta.tw, meta.th) || 1;
  const scale = (box * tuneScale) / longest;
  sp.scale.set(scale);
  const w = meta.w || meta.tw;
  const h = meta.h || meta.th;
  const dx = (meta.cx - w / 2) * scale;
  const dy = (meta.cy - h / 2) * scale;
  sp.position.set(s / 2 - dx, s / 2 - dy);
  return sp;
}

// map presentation intent -> supplied modular board cell texture
const FRAME_TEX = {
  BASE: "board:BASE", // client/public/assets/board/cell_base.png
  AWAKENED: "board:MOLTEN", // ...board/cell_molten.png
  MOLTEN: "board:MOLTEN",
  HIGHLIGHT: "board:HIGHLIGHT", // ...board/cell_highlight.png  (winning-cell state)
  LOCKED: "board:LOCKED", // ...board/cell_locked.png
};

// a STATIC grid-cell socket sprite from the supplied modular board pack.
export function cellFrame(s, kind = "BASE") {
  const id = FRAME_TEX[kind] || FRAME_TEX.BASE;
  const meta = tex(id) || tex("board:BASE");
  const sp = new Sprite(meta.texture);
  sp.anchor.set(0.5);
  sp.width = s * CELL_BLEED;
  sp.height = s * CELL_BLEED;
  sp.position.set(s / 2, s / 2);
  sp.__frameKind = kind;
  sp.__baseKind = kind === "AWAKENED" || kind === "MOLTEN" ? "AWAKENED" : "BASE";
  return sp;
}

// swap a cell socket to / from the supplied glowing "winning cell" texture.
// The frame layer sits BELOW the symbol layer, so this can never cover the art.
export function setCellWinning(frame, on) {
  if (!frame || frame.destroyed) return;
  const want = on ? FRAME_TEX.HIGHLIGHT : FRAME_TEX[frame.__baseKind || "BASE"];
  const meta = tex(want) || tex("board:BASE");
  if (meta && frame.texture !== meta.texture) {
    frame.texture = meta.texture;
    frame.__frameKind = on ? "HIGHLIGHT" : frame.__baseKind;
  }
}

function overlaySprite(id, s) {
  const meta = tex(id) || tex("board:BASE");
  const sp = new Sprite(meta.texture);
  sp.anchor.set(0.5);
  sp.width = s * CELL_BLEED;
  sp.height = s * CELL_BLEED;
  sp.position.set(s / 2, s / 2);
  return sp;
}

function symbolContentSprite(cell, s) {
  const sc = opticalScale(cell);
  if (isSym(cell.k)) {
    const meta = tex(`sym:${cell.s}`);
    return meta ? fitSprite(meta, s, s * SYMBOL_FIT, sc) : null;
  }
  if (cell.k === "WILD") {
    const meta = tex("sym:WILD");
    return meta ? fitSprite(meta, s, s * SYMBOL_FIT, sc) : null;
  }
  if (cell.k === "CORE") {
    const meta = tex("sym:CORE");
    return meta ? fitSprite(meta, s, s * SYMBOL_FIT, sc) : null;
  }
  if (cell.k === "SHARD") {
    const v = 1 << (cell.lv || 0);
    const meta = tex(`shard:${v}`) || tex("shard:2");
    return meta ? fitSprite(meta, s, s * SHARD_FIT, sc) : null;
  }
  return null;
}

// two cells are "the same symbol" if swapping their sprite would be invisible
export function sameSymbol(a, b) {
  if (!a || !b) return false;
  if (a.k !== b.k) return false;
  if (a.k === "SYM") return a.s === b.s && !!(a.locked || a.lk) === !!(b.locked || b.lk);
  if (a.k === "SHARD") return (a.lv || 0) === (b.lv || 0) && !!(a.locked || a.lk) === !!(b.locked || b.lk);
  return !!(a.locked || a.lk) === !!(b.locked || b.lk);
}

// Build ONE persistent symbol object for a non-empty cell. Origin = cell top-left;
// the object is positioned by the board renderer at xy(i) and moved as one unit.
export function makeSymbol(cell, s, mode = "BASE") {
  const c = new Container();
  c.__data = cell;
  c.__special = null;
  c.__aura = null;
  c.__sprite = null;
  c.__baseScale = 1;

  if (cell.k === "WILD" || cell.k === "CORE") {
    const cfg = cell.k === "WILD" ? WILD : CORE;
    if (cell.k === "CORE") {
      const inner = auraSprite(CORE.auraColorInner, Math.min(1, cfg.auraAlpha * 0.85));
      inner.width = inner.height = s * cfg.auraScale * 0.58;
      inner.position.set(s / 2, s / 2);
      inner.__inner = true;
      c.addChild(inner);
    }
    const aura = auraSprite(cfg.auraColor, cfg.auraAlpha);
    aura.width = aura.height = s * cfg.auraScale;
    aura.__baseW = s * cfg.auraScale;
    aura.position.set(s / 2, s / 2);
    c.addChild(aura);
    c.__special = cell.k;
    c.__aura = aura;
  }

  // NO frame inside the symbol — the socket lives in the board's static frame
  // layer. This symbol container holds only the moving artwork.
  const sprite = symbolContentSprite(cell, s);
  if (sprite) {
    if (cell.locked || cell.lk) sprite.alpha = 0.92;
    c.__sprite = sprite;
    c.__baseScale = sprite.scale.x;
    c.addChild(sprite);
  }

  if (cell.locked || cell.lk) {
    const lock = overlaySprite("board:LOCKED", s);
    lock.alpha = 0.62;
    c.addChild(lock);
  }
  return c;
}

// soft win-feedback halo — lives BEHIND the symbol layer, additive, translucent:
// it can never hide the winning artwork.
export function winGlowSprite(s) {
  const sp = overlaySprite("board:HIGHLIGHT", s);
  sp.blendMode = "add";
  sp.alpha = 0;
  return sp;
}
