// Grid/state model per docs/02_MATH_SPEC.md §0, §1.2, §4.2.
// Coordinates: index = row*W + col. row 0 = top, row H-1 = bottom (floor).
// Cell kinds: SYM (sym: L1..H4), CORE, WILD, SHARD (shardLevel), EMPTY.
// `locked` supports the future Shield mechanic; always false in the S0->S2 slice.

export function EMPTY() {
  return { kind: "EMPTY", locked: false };
}

export function idx(col, row, W) {
  return row * W + col;
}

export function neighbors(i, W, H) {
  const col = i % W;
  const row = (i - col) / W;
  const out = [];
  if (row > 0) out.push(i - W); // up
  if (row < H - 1) out.push(i + W); // down
  if (col > 0) out.push(i - 1); // left
  if (col < W - 1) out.push(i + 1); // right
  return out;
}

// §3.1/§3.2 independent weighted per-cell draw over {L1..H4, CORE[, WILD]}.
// WILD in the pool is a 2026-09-05 addition (see docs/DECISIONS.md) — off by
// default (WGEN_WILD_WEIGHT = 0 in the shipped config; see config.js).
export function generateCell(rng, config, purpose) {
  rng.tag(purpose);
  const i = rng.drawWeighted(config.wgenWeights, config.wgenTotal);
  const s = config.wgenSymbols[i];
  if (s === "CORE") return { kind: "CORE", locked: false };
  if (s === "WILD") return { kind: "WILD", locked: false };
  return { kind: "SYM", sym: s, locked: false };
}

// Initial FILL: for col 0..W-1, for row H-1..0. §0 draw order.
export function fillBoard(cells, W, H, rng, config) {
  for (let col = 0; col < W; col++) {
    for (let row = H - 1; row >= 0; row--) {
      cells[idx(col, row, W)] = generateCell(rng, config, "FILL");
    }
  }
}

// §4.2 step 8 gravity: locked cells are immovable dividers; per-column, per-segment
// bottom-anchored compaction; nothing moves between segments.
export function columnGravity(cells, W, H, col) {
  let segBottom = H - 1;
  for (let row = H - 1; row >= -1; row--) {
    const isDivider = row < 0 || cells[idx(col, row, W)].locked;
    if (!isDivider) continue;
    const contents = [];
    for (let r = segBottom; r > row; r--) {
      const c = cells[idx(col, r, W)];
      if (c.kind !== "EMPTY") contents.push(c);
    }
    let r = segBottom;
    for (const c of contents) cells[idx(col, r--, W)] = c;
    for (; r > row; r--) cells[idx(col, r, W)] = EMPTY();
    segBottom = row - 1;
  }
}

export function gravity(cells, W, H) {
  for (let col = 0; col < W; col++) columnGravity(cells, W, H, col);
}

// §4.2 step 9 refill: fill every EMPTY non-locked cell, draw order col 0..W-1, row H-1..0.
// (Shard spawn roll is out of scope for the S0->S2 slice.)
export function refill(cells, W, H, rng, config) {
  for (let col = 0; col < W; col++) {
    for (let row = H - 1; row >= 0; row--) {
      const i = idx(col, row, W);
      if (cells[i].kind === "EMPTY" && !cells[i].locked) {
        cells[i] = generateCell(rng, config, "REFILL");
      }
    }
  }
}

export function countKind(cells, kind) {
  let n = 0;
  for (const c of cells) if (c.kind === kind) n++;
  return n;
}
