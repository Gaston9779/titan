import test from "node:test";
import assert from "node:assert/strict";
import { parseBoard } from "./helpers.js";
import { detectClusters } from "../engine/clusters.js";
import { defaultConfig, payMicro } from "../engine/config.js";

const cfg = defaultConfig();
const det = (rows) => {
  const { cells, W, H } = parseBoard(rows);
  return detectClusters(cells, W, H, cfg);
};

test("horizontal 5 of a kind is one cluster paying B5", () => {
  const cl = det(["11111.", "......", "......", "......", "......", "......"]);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].sym, "L1");
  assert.equal(cl[0].size, 5);
  assert.equal(cl[0].basePay, payMicro(cfg, "L1", 5));
});

test("4 of a kind does not pay", () => {
  const cl = det(["1111..", "......", "......", "......", "......", "......"]);
  assert.equal(cl.length, 0);
});

test("L-shaped connected region of 6 is ONE cluster (not partitioned)", () => {
  const cl = det(["111...", "1.....", "1.....", "1.....", "......", "......"]);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].size, 6);
  assert.equal(cl[0].basePay, payMicro(cfg, "L1", 6));
});

test("two separate same-symbol regions pay twice", () => {
  const { cells, W, H } = parseBoard(["1111111", ".......", "..11111"]);
  const cl = detectClusters(cells, W, H, cfg);
  assert.equal(cl.length, 2);
  assert.equal(cl[0].size + cl[1].size, 12);
});

test("only different symbols never connect", () => {
  const cl = det(["12121.", "21212.", "12121.", "......", "......", "......"]);
  assert.equal(cl.length, 0);
});

test("WILD extends a same-symbol region to a paying size", () => {
  const { cells, W, H } = parseBoard(["bbbbW.."]);
  const cl = detectClusters(cells, W, H, cfg);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].sym, "H2");
  assert.equal(cl[0].size, 5);
});

test("WILD bridges two same-symbol components into one cluster", () => {
  const { cells, W, H } = parseBoard(["bbbWbbb"]);
  const cl = detectClusters(cells, W, H, cfg);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].sym, "H2");
  assert.equal(cl[0].size, 7);
});

test("contested WILD goes to the higher-paying symbol", () => {
  // H4 x4  |  W  |  L1 x4  -> wild joins H4 (bigger marginal pay), L1 stays size 4
  const { cells, W, H } = parseBoard(["ddddW1111"]);
  const cl = detectClusters(cells, W, H, cfg);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].sym, "H4");
  assert.equal(cl[0].size, 5);
});

test("WILD blob adjacent to no symbol pays nothing", () => {
  const { cells, W, H } = parseBoard(["WWWWW."]);
  const cl = detectClusters(cells, W, H, cfg);
  assert.equal(cl.length, 0);
});
