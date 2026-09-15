// ============================================================================
// CENTRAL ASSET MANIFEST
// Maps semantic game identifiers -> approved artwork under client/public/assets/.
// Nothing else in the client hardcodes an asset path.
// Also the single home for per-asset display tuning (fit / scale / anchor).
// ============================================================================
import { Assets, Texture } from "pixi.js";

const BASE = "assets"; // resolved relative to the app's base URL (see resolve())

// --- semantic id -> file (actual filenames present in the pack) ---
export const ASSETS = {
  background: {
    BASE: `${BASE}/background/background_base.png`,
  },
  branding: {
    LOGO: `${BASE}/branding/logo.png`,
  },
  board: {
    // reusable cell frames — the board is ALWAYS generated from these, never baked
    BASE: `${BASE}/board/cell_base.png`,
    MOLTEN: `${BASE}/board/cell_molten.png`,
    LOCKED: `${BASE}/board/cell_locked.png`,
    HIGHLIGHT: `${BASE}/board/cell_highlight.png`,
    // approved outermost machine casing — DOM overlay above the whole board
    // (transparent centre; 1254×1254; inner opening ≈ 116..1136 × 144..1054)
    OUTER_FRAME: `${BASE}/board/board_outer_frame.png`,
  },
  symbols: {
    L1: `${BASE}/symbols/low_1.png`,
    L2: `${BASE}/symbols/low_2.png`,
    L3: `${BASE}/symbols/low_3.png`,
    L4: `${BASE}/symbols/low_4.png`,
    H1: `${BASE}/symbols/high_1.png`,
    H2: `${BASE}/symbols/high_2.png`,
    H3: `${BASE}/symbols/high_3.png`,
    H4: `${BASE}/symbols/high_4.png`,
    WILD: `${BASE}/symbols/wild.png`,
    CORE: `${BASE}/symbols/forge_core.png`,
  },
  // shard multiplier value -> artwork (multiplier text is BAKED into the art)
  shards: {
    2: `${BASE}/shards/shard_2x.png`,
    4: `${BASE}/shards/shard_4x.png`,
    8: `${BASE}/shards/shard_8x.png`,
    16: `${BASE}/shards/shard_16x.png`,
    32: `${BASE}/shards/shard_32x.png`,
    64: `${BASE}/shards/shard_64x.png`,
  },
  powers: {
    BLADE: `${BASE}/powers/blade.png`,
    HAMMER: `${BASE}/powers/hammer.png`,
    SHIELD: `${BASE}/powers/shield.png`,
  },
  // reusable procedural-composited FX sprites (loaded once, pooled at runtime)
  fx: {
    WIN_RING: `${BASE}/fx/win_ring.png`, // normal win — behind the symbol
    WIN_BURST: `${BASE}/fx/win_burst.png`, // normal win — on removal
    ENERGY_SLASH: `${BASE}/fx/energy_slash.png`, // reserved for special presentation
    ENERGY_ARC: `${BASE}/fx/energy_arc.png`, // reserved for special presentation
    RUNE_BURST: `${BASE}/fx/rune_burst.png`, // reserved for special presentation
  },
  hud: {
    // ONE vertical meter component: HEAT (base) / MOLTEN CHARGE (bonus)
    VMETER_FRAME: `${BASE}/hud/meter_vertical_frame.png`,
    VMETER_FILL: `${BASE}/hud/meter_vertical_fill.png`,
    CORES_PANEL: `${BASE}/hud/forge_cores_panel.png`,
    SHARDS_PANEL: `${BASE}/hud/shards_panel.png`,
    PRESSURE: {
      COLD: `${BASE}/hud/pressure_cold.png`,
      WARM: `${BASE}/hud/pressure_warm.png`,
      HOT: `${BASE}/hud/pressure_hot.png`,
      OVERHEAT: `${BASE}/hud/pressure_overheat.png`,
      CRITICAL: `${BASE}/hud/pressure_critical.png`,
    },
  },
  controls: {
    // approved forged plaque that IS the controls bar (2170×725; usable dark
    // interior ≈ inset 26% 8% 29% 8%)
    BAR_FRAME: `${BASE}/controls/controls_bar_frame.png`,
    SPIN: `${BASE}/controls/spin.png`,
    MINUS: `${BASE}/controls/minus.png`,
    PLUS: `${BASE}/controls/plus.png`,
    BET: `${BASE}/controls/bet.png`,
    AUTOPLAY: `${BASE}/controls/autoplay.png`,
    TURBO: `${BASE}/controls/turbo.png`,
    MENU: `${BASE}/controls/menu.png`,
    SOUND: `${BASE}/controls/sound.png`,
    FULLSCREEN: `${BASE}/controls/fullscreen.png`,
  },
};

// Resolve a manifest path against the Vite base URL so it works in dev + build.
export const url = (p) => {
  const b = (import.meta.env && import.meta.env.BASE_URL) || "/";
  return (b.endsWith("/") ? b : b + "/") + p;
};

// --- display fit -----------------------------------------------------------
// Symbols/shards are fitted so their *visible* content (alpha-trimmed, measured
// at load) occupies `FIT` of the cell's inner area. Per-symbol optical scale and
// the special-symbol hierarchy live in render/presentation.js (single source).
export const SYMBOL_FIT = 0.82; // visible longest side / cell inner opening (base tier = LOW)
export const SHARD_FIT = 0.86;
export const CELL_BLEED = 1.01; // frame drawn slightly proud so seams disappear

// --- loader + alpha-trim analysis -----------------------------------------
// CACHE[id] = { texture, tw, th, cx, cy }  (trim size + visible-content centre, px)
let CACHE = null;

const pixiEntries = () => {
  const out = [];
  for (const [k, v] of Object.entries(ASSETS.board)) out.push([`board:${k}`, v]);
  for (const [k, v] of Object.entries(ASSETS.symbols)) out.push([`sym:${k}`, v]);
  for (const [k, v] of Object.entries(ASSETS.shards)) out.push([`shard:${k}`, v]);
  for (const [k, v] of Object.entries(ASSETS.powers)) out.push([`power:${k}`, v]);
  for (const [k, v] of Object.entries(ASSETS.fx)) out.push([`fx:${k}`, v]);
  return out;
};

// The board cannot be shown without these textures. Effects and power icons are
// deliberately not part of the first paint: waiting for purely decorative art
// used to keep the full-page FORGING overlay up on slow/mobile connections.
const essentialEntries = () =>
  pixiEntries().filter(([id]) => id.startsWith("board:") || id.startsWith("sym:") || id.startsWith("shard:"));
const deferredEntries = () => pixiEntries().filter(([id]) => id.startsWith("power:") || id.startsWith("fx:"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadEntries(entries, { deadline = 5000 } = {}) {
  const srcs = [...new Set(entries.map(([, s]) => url(s)))];
  // Load independently. A single corrupt/missing CDN object must never turn
  // into a permanently blocked game shell.
  const jobs = srcs.map((src) => Assets.load(src).catch((error) => {
    console.warn("Asset unavailable:", src, error);
    return null;
  }));
  const complete = Promise.allSettled(jobs);
  const outcome = await Promise.race([complete.then(() => "complete"), sleep(deadline).then(() => "timeout")]);
  if (outcome === "timeout") console.warn(`Asset warm-up exceeded ${deadline}ms; continuing with available textures.`);

  for (const [id, source] of entries) {
    // WHITE is an intentional safe visual fallback. It lets the game become
    // interactive even during a transient asset/CDN failure; successful late
    // loads are still cached by Pixi for the next board rebuild.
    const texture = Assets.get(url(source)) || Texture.WHITE;
    const trim = id.startsWith("sym:") || id.startsWith("shard:") ? measureTrim(texture) : fullBounds(texture);
    CACHE[id] = { texture, w: texWidth(texture), h: texHeight(texture), ...trim };
  }
}

export async function loadGameAssets() {
  if (CACHE) return CACHE;
  CACHE = {};
  await loadEntries(essentialEntries());
  return CACHE;
}

// Best-effort warm-up after the game is already usable. Nothing awaits this.
export async function warmGameAssets() {
  if (!CACHE) await loadGameAssets();
  await loadEntries(deferredEntries(), { deadline: 12000 });
  return CACHE;
}

export const tex = (id) => (CACHE && CACHE[id] ? CACHE[id] : null);

function fullBounds(texture) {
  const w = texWidth(texture);
  const h = texHeight(texture);
  return { tw: w, th: h, cx: w / 2, cy: h / 2 };
}

function texWidth(t) {
  return t.source?.pixelWidth || t.frame?.width || t.width || 1;
}
function texHeight(t) {
  return t.source?.pixelHeight || t.frame?.height || t.height || 1;
}

// Draw to an offscreen canvas and scan the alpha channel for the visible bbox.
// Same-origin assets, so getImageData is allowed. Sampled every 2px for speed.
function measureTrim(texture) {
  const w = texWidth(texture);
  const h = texHeight(texture);
  try {
    const res = texture.source?.resource;
    if (!res) return fullBounds(texture);
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(res, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const AL = 14;
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (data[(y * w + x) * 4 + 3] > AL) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return fullBounds(texture);
    return { tw: maxX - minX + 1, th: maxY - minY + 1, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  } catch {
    return fullBounds(texture);
  }
}
