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
    BASE: `${BASE}/background/background_base.webp`,
  },
  branding: {
    LOGO: `${BASE}/branding/logo.webp`,
  },
  board: {
    // reusable cell frames — the board is ALWAYS generated from these, never baked
    BASE: `${BASE}/board/cell_base.webp`,
    MOLTEN: `${BASE}/board/cell_molten.webp`,
    LOCKED: `${BASE}/board/cell_locked.webp`,
    HIGHLIGHT: `${BASE}/board/cell_highlight.webp`,
    // approved outermost machine casing — DOM overlay above the whole board
    // (transparent centre; 1254×1254; inner opening ≈ 116..1136 × 144..1054)
    OUTER_FRAME: `${BASE}/board/board_outer_frame.webp`,
  },
  symbols: {
    L1: `${BASE}/symbols/low_1.webp`,
    L2: `${BASE}/symbols/low_2.webp`,
    L3: `${BASE}/symbols/low_3.webp`,
    L4: `${BASE}/symbols/low_4.webp`,
    H1: `${BASE}/symbols/high_1.webp`,
    H2: `${BASE}/symbols/high_2.webp`,
    H3: `${BASE}/symbols/high_3.webp`,
    H4: `${BASE}/symbols/high_4.webp`,
    WILD: `${BASE}/symbols/wild.webp`,
    CORE: `${BASE}/symbols/forge_core.webp`,
  },
  // shard multiplier value -> artwork (multiplier text is BAKED into the art)
  shards: {
    2: `${BASE}/shards/shard_2x.webp`,
    4: `${BASE}/shards/shard_4x.webp`,
    8: `${BASE}/shards/shard_8x.webp`,
    16: `${BASE}/shards/shard_16x.webp`,
    32: `${BASE}/shards/shard_32x.webp`,
    64: `${BASE}/shards/shard_64x.webp`,
  },
  powers: {
    BLADE: `${BASE}/powers/blade.webp`,
    HAMMER: `${BASE}/powers/hammer.webp`,
    SHIELD: `${BASE}/powers/shield.webp`,
  },
  // reusable procedural-composited FX sprites (loaded once, pooled at runtime)
  fx: {
    WIN_RING: `${BASE}/fx/win_ring.webp`, // normal win — behind the symbol
    WIN_BURST: `${BASE}/fx/win_burst.webp`, // normal win — on removal
    ENERGY_SLASH: `${BASE}/fx/energy_slash.webp`, // reserved for special presentation
    ENERGY_ARC: `${BASE}/fx/energy_arc.webp`, // reserved for special presentation
    RUNE_BURST: `${BASE}/fx/rune_burst.webp`, // reserved for special presentation
  },
  hud: {
    // ONE vertical meter component: HEAT (base) / MOLTEN CHARGE (bonus)
    VMETER_FRAME: `${BASE}/hud/meter_vertical_frame.webp`,
    VMETER_FILL: `${BASE}/hud/meter_vertical_fill.webp`,
    CORES_PANEL: `${BASE}/hud/forge_cores_panel.webp`,
    SHARDS_PANEL: `${BASE}/hud/shards_panel.webp`,
    PRESSURE: {
      COLD: `${BASE}/hud/pressure_cold.webp`,
      WARM: `${BASE}/hud/pressure_warm.webp`,
      HOT: `${BASE}/hud/pressure_hot.webp`,
      OVERHEAT: `${BASE}/hud/pressure_overheat.webp`,
      CRITICAL: `${BASE}/hud/pressure_critical.webp`,
    },
  },
  controls: {
    // approved forged plaque that IS the controls bar (2170×725; usable dark
    // interior ≈ inset 26% 8% 29% 8%)
    BAR_FRAME: `${BASE}/controls/controls_bar_frame.webp`,
    SPIN: `${BASE}/controls/spin.webp`,
    MINUS: `${BASE}/controls/minus.webp`,
    PLUS: `${BASE}/controls/plus.webp`,
    BET: `${BASE}/controls/bet.webp`,
    AUTOPLAY: `${BASE}/controls/autoplay.webp`,
    TURBO: `${BASE}/controls/turbo.webp`,
    MENU: `${BASE}/controls/menu.webp`,
    SOUND: `${BASE}/controls/sound.webp`,
    FULLSCREEN: `${BASE}/controls/fullscreen.webp`,
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
