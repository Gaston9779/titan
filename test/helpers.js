// Test board builder. Chars: 1-4 => L1-L4, a-d => H1-H4, W => WILD, C => CORE,
// S => SHARD level 1, . => EMPTY.
import { Rng } from "../engine/rng.js";

const MAP = {
  "1": { kind: "SYM", sym: "L1" },
  "2": { kind: "SYM", sym: "L2" },
  "3": { kind: "SYM", sym: "L3" },
  "4": { kind: "SYM", sym: "L4" },
  a: { kind: "SYM", sym: "H1" },
  b: { kind: "SYM", sym: "H2" },
  c: { kind: "SYM", sym: "H3" },
  d: { kind: "SYM", sym: "H4" },
  W: { kind: "WILD" },
  C: { kind: "CORE" },
  S: { kind: "SHARD", shardLevel: 1 },
  ".": { kind: "EMPTY" },
};

export function parseBoard(rows, mods = {}) {
  const grid = rows.map((r) => r.replace(/\s+/g, ""));
  const H = grid.length;
  const W = grid[0].length;
  const cells = new Array(W * H);
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const ch = grid[row][col];
      const t = MAP[ch];
      if (!t) throw new Error(`bad char '${ch}'`);
      cells[row * W + col] = { ...t, locked: false };
    }
  }
  for (const [i, m] of Object.entries(mods)) Object.assign(cells[Number(i)], m);
  return { cells, W, H };
}

export function setShard(cells, i, level, locked = false) {
  cells[i] = { kind: "SHARD", shardLevel: level, locked, ...(locked ? { lockTtl: 2 } : {}) };
}

// Deterministic stub: no shard spawns, stable symbol draws — isolates merge/power logic.
export function stubRng() {
  const r = new Rng(1n);
  r.nextInt = () => 500;
  r.nextU64 = () => 0n;
  return r;
}
