import test from "node:test";
import assert from "node:assert/strict";
import { parseBoard } from "./helpers.js";
import { gravity, refill, fillBoard, neighbors, countKind, idx } from "../engine/grid.js";
import { deriveRoundRng } from "../engine/rng.js";
import { defaultConfig, bucketIndex } from "../engine/config.js";

test("neighbors are orthogonal only and clamped to grid", () => {
  assert.deepEqual(neighbors(0, 3, 3).sort((a, b) => a - b), [1, 3]);
  assert.deepEqual(neighbors(4, 3, 3).sort((a, b) => a - b), [1, 3, 5, 7]);
});

test("gravity compacts a column bottom-anchored, top cells become EMPTY", () => {
  const { cells, W, H } = parseBoard(["1..", "...", "2..", "..."]);
  gravity(cells, W, H);
  assert.equal(cells[idx(0, 3, W)].sym, "L2");
  assert.equal(cells[idx(0, 2, W)].sym, "L1");
  assert.equal(cells[idx(0, 1, W)].kind, "EMPTY");
  assert.equal(cells[idx(0, 0, W)].kind, "EMPTY");
});

test("refill leaves no EMPTY cell", () => {
  const cfg = defaultConfig();
  const rng = deriveRoundRng(1n, 0);
  const { cells, W, H } = parseBoard(["...", "1..", "...", "22."]);
  gravity(cells, W, H);
  refill(cells, W, H, rng, cfg);
  assert.equal(countKind(cells, "EMPTY"), 0);
});

test("fillBoard produces a full board of valid cells", () => {
  const cfg = defaultConfig();
  const rng = deriveRoundRng(9n, 9);
  const cells = new Array(cfg.gridW * cfg.gridH);
  fillBoard(cells, cfg.gridW, cfg.gridH, rng, cfg);
  assert.equal(countKind(cells, "EMPTY"), 0);
  for (const c of cells) assert.ok(c.kind === "SYM" || c.kind === "CORE");
});

test("bucketIndex boundaries", () => {
  assert.equal(bucketIndex(4), -1);
  assert.equal(bucketIndex(5), 0);
  assert.equal(bucketIndex(9), 4);
  assert.equal(bucketIndex(10), 5);
  assert.equal(bucketIndex(11), 5);
  assert.equal(bucketIndex(12), 6);
  assert.equal(bucketIndex(35), 10);
  assert.equal(bucketIndex(36), 11);
  assert.equal(bucketIndex(49), 12);
  assert.equal(bucketIndex(64), 12);
});
