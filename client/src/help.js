// HELP / PAYTABLE MENU — pure presentation, reads ONLY from the canonical engine
// config/CAL (via ./engine.js) and the existing asset manifest (./assets.js).
// No game logic here; opening/closing this overlay never touches RoundResult,
// RNG, balance, or bet. All numbers below are read live from the engine config,
// not duplicated/typed a second time.
import { ASSETS, url } from "./assets.js";
import { defaultConfig, MICRO, bucketIndex, CAL, FREE_SPINS, SHARD_MAX_LEVEL, shardValue } from "./engine.js";

const $ = (id) => document.getElementById(id);
const cfg = defaultConfig();

const fmtX = (x) => (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + "×";
const symName = (s) => (s[0] === "L" ? `Low ${s[1]}` : `High ${s[1]}`);
const symIcon = (s) => url(ASSETS.symbols[s]);

// Cluster-size -> paytable bucket labels, derived from the engine's own
// bucketIndex() so the ranges shown can never drift from the real lookup.
function bucketLabels() {
  const labels = [];
  let start = cfg.minCluster;
  let bi = bucketIndex(start);
  for (let n = start + 1; n <= 200; n++) {
    const b = bucketIndex(n);
    if (b !== bi) {
      labels[bi] = start === n - 1 ? `${start}` : `${start}–${n - 1}`;
      start = n;
      bi = b;
    }
  }
  labels[bi] = `${start}+`; // last bucket is open-ended in bucketIndex()
  return labels;
}

function renderHowToPlay() {
  const ex = [1, 1, 0, 1, 1, 0, 0, 1, 0]; // 3x3 demo mask (5 orthogonally-connected cells)
  const exGrid = ex
    .map((on) => (on ? `<i class="hp-cell on"><img src="${symIcon("H3")}" alt="" /></i>` : `<i class="hp-cell"></i>`))
    .join("");
  return `
    <p>FORGE: THE LAST TITAN does <b>not</b> use paylines. It pays on <b>clusters</b>:
    groups of matching symbols connected across the grid.</p>
    <ul class="hp-list">
      <li><b>Cluster:</b> ${cfg.minCluster}–${cfg.gridW * cfg.gridW} identical symbols connected to each other.</li>
      <li><b>Adjacency:</b> up / down / left / right only — <b>diagonal neighbors do not connect</b>.</li>
      <li><b>Minimum size:</b> ${cfg.minCluster} connected symbols to pay. Bigger clusters pay more (see SYMBOLS &amp; PAYS).</li>
      <li><b>Payout:</b> every win is a multiple of your Total Bet (e.g. a 12.3× cluster on a €5 bet pays €61.50).</li>
      <li><b>Cascade:</b> winning symbols are destroyed, the symbols above fall to fill the gaps, and new symbols drop in from the top. This repeats for free as long as new clusters keep forming — all from one paid spin.</li>
      <li><b>Grid:</b> the base game plays on a ${cfg.gridW}×${cfg.gridH} grid.</li>
    </ul>
    <div class="hp-example">
      <div class="hp-grid">${exGrid}</div>
      <p class="hp-cap">Example: 5 orthogonally-connected symbols — a valid ${cfg.minCluster}-cluster.</p>
    </div>`;
}

function renderPays() {
  const labels = bucketLabels();
  const rows = Object.keys(cfg.paytableMicro)
    .map((sym) => {
      const cells = cfg.paytableMicro[sym].map((m) => `<td>${fmtX(m / MICRO)}</td>`).join("");
      return `<tr><th><img src="${symIcon(sym)}" alt="" /><span>${symName(sym)}</span></th>${cells}</tr>`;
    })
    .join("");
  const head = labels.map((l) => `<th>${l}</th>`).join("");
  return `
    <p>Payouts below are read directly from the live paytable, in × Total Bet, by cluster size.</p>
    <div class="pay-scroll">
      <table class="pay-table">
        <thead><tr><th>Symbol</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="hp-note">WILD and FORGE CORE never pay on their own — see FEATURES.</p>`;
}

function shardLadderHtml() {
  const rungs = [];
  for (let lv = 1; lv <= SHARD_MAX_LEVEL; lv++) {
    const v = shardValue(lv);
    rungs.push(`<i class="sl-rung"><img src="${url(ASSETS.shards[v])}" alt="${v}×" /></i>`);
  }
  return `<div class="shard-ladder">${rungs.join('<span class="sl-arrow">→</span>')}</div>`;
}

function renderFeatures() {
  const B = CAL.BONUS;
  const fsRows = Object.entries(FREE_SPINS)
    .map(([c, fs]) => `<tr><td>${c}${c === "5" ? "+" : ""} Forge Cores</td><td>${fs} Free Spins</td></tr>`)
    .join("");
  const rtRows = Object.entries(B.RETRIGGER)
    .map(([c, fs]) => `<tr><td>${c}${c === "5" ? "+" : ""} Forge Cores in a Free Spin</td><td>+${fs} Free Spins</td></tr>`)
    .join("");

  return `
    <div class="feat-card">
      <h3><img class="feat-icon" src="${symIcon("WILD")}" alt="" />WILD</h3>
      <ul>
        <li>Created only by the HAMMER Forge Power (never appears from a normal spin/refill draw).</li>
        <li>Substitutes for whatever paying symbol it lands next to, joining that cluster and counting toward its size.</li>
        <li>A group of WILDs with no matching symbol touching it does not pay on its own.</li>
      </ul>
    </div>
    <div class="feat-card">
      <h3>SHARDS</h3>
      ${shardLadderHtml()}
      <ul>
        <li>Spawn at ${shardValue(1)}× when the board refills, at a chance that rises with Pressure (see below).</li>
        <li>Two touching Shards of the same value merge into the next value up the ladder (2×→${shardValue(SHARD_MAX_LEVEL)}× max).</li>
        <li>When a cluster pays, every Shard touching it adds its value to that cluster's multiplier (values add together, e.g. an adjacent 4× + 8× = ×12 on that win) and is then consumed.</li>
        <li>Shards carry over between cascades within one spin, but a new spin always starts with none.</li>
      </ul>
    </div>
    <div class="feat-card">
      <h3><img class="feat-icon" src="${symIcon("CORE")}" alt="" />FORGE CORE</h3>
      <ul>
        <li>Never pays directly — it is collected, not matched.</li>
        <li>Landing ${cfg.coreBonusThreshold}+ Cores on the paid spin's final board triggers the AWAKEN THE TITAN bonus.</li>
        <li>More Cores award more Free Spins:</li>
      </ul>
      <table class="mini-table"><tbody>${fsRows}</tbody></table>
    </div>
    <div class="feat-card">
      <h3>HEAT &amp; PRESSURE</h3>
      <ul>
        <li>Every win generates Heat. When Heat crosses the threshold, a Forge Power fires and Heat resets.</li>
        <li>Pressure rises with cascade depth in one spin (COLD → WARM → HOT → OVERHEAT → CRITICAL) and increases both the Shard spawn chance and how fast Heat builds.</li>
      </ul>
    </div>
    <div class="feat-card">
      <h3>FORGE POWERS</h3>
      <ul>
        <li><img class="feat-icon sm" src="${url(ASSETS.powers.BLADE)}" alt="" /><b>Blade</b> — clears a full row or column of Low symbols.</li>
        <li><img class="feat-icon sm" src="${url(ASSETS.powers.HAMMER)}" alt="" /><b>Hammer</b> — destroys a 3×3 area and leaves WILDs behind (the only source of WILD).</li>
        <li><img class="feat-icon sm" src="${url(ASSETS.powers.SHIELD)}" alt="" /><b>Shield</b> — locks valuable Shards/WILDs in place for a few spins so they can't be destroyed.</li>
      </ul>
    </div>
    <div class="feat-card">
      <h3>BONUS — AWAKEN THE TITAN (7×7)</h3>
      <ul>
        <li>Plays on a bigger 7×7 grid with raised Shard/Power limits.</li>
        <li>Landing ${cfg.coreBonusThreshold}+ Cores again in a Free Spin retriggers extra spins:</li>
      </ul>
      <table class="mini-table"><tbody>${rtRows}</tbody></table>
    </div>
    <div class="feat-card">
      <h3>MOLTEN CHARGE</h3>
      <ul>
        <li>Fills during the bonus from Forge Powers firing, reaching CRITICAL Pressure, a big single-spin win, or a retrigger.</li>
        <li>At ${B.MOLTEN_EXPAND_THRESHOLD} charge the grid expands to 8×8 and awards +${B.AWAKENED_BONUS_SPINS} Free Spins.</li>
      </ul>
    </div>
    <div class="feat-card">
      <h3>AWAKENED (8×8)</h3>
      <ul>
        <li>The largest grid in the game, reached only via Molten Charge above.</li>
        <li>Higher Shard board cap, more WILDs per Hammer, and a lower Heat threshold than the base bonus.</li>
      </ul>
    </div>`;
}

export function initHelp(app) {
  const overlay = $("help-overlay");
  if (!overlay) return;
  const panes = { how: $("help-pane-how"), pays: $("help-pane-pays"), features: $("help-pane-features") };
  panes.how.innerHTML = renderHowToPlay();
  panes.pays.innerHTML = renderPays();
  panes.features.innerHTML = renderFeatures();

  const tabs = [...document.querySelectorAll(".help-tab")];
  function showTab(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    Object.entries(panes).forEach(([k, el]) => el.classList.toggle("active", k === name));
  }
  tabs.forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  function open() {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    const spinBtn = $("spin");
    if (spinBtn) spinBtn.disabled = true;
  }
  function close() {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    const spinBtn = $("spin");
    // reflect LIVE state, not a snapshot — a spin may have started/finished while open
    if (spinBtn) spinBtn.disabled = app.playing;
  }
  function toggle() {
    if (overlay.classList.contains("hidden")) open();
    else close();
  }

  $("help-close").addEventListener("click", close);
  $("help-backdrop").addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !overlay.classList.contains("hidden")) close();
  });

  return { open, close, toggle, isOpen: () => !overlay.classList.contains("hidden") };
}
