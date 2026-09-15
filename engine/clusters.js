// Orthogonal cluster detection incl. WILD rules per docs/02_MATH_SPEC.md §4.6.
// Returns paying clusters: { sym, size, cells:[idx sorted], basePay(µ), anchor(min idx) }.
// WILDs never spawn in the S0->S2 slice (only Hammer/bonus create them, out of scope);
// the wild path is implemented for cluster-detection fidelity + property tests.
// Fidelity note: contested-blob resolution below does NOT re-split a group when the
// contested blob is removed (it compares whole-group pay); full §4.6 re-split is
// deferred to the Hammer stage, which is when WILDs first appear on the board.

import { neighbors } from "./grid.js";
import { payMicro } from "./config.js";

const SYMBOL_ORDER = ["L1", "L2", "L3", "L4", "H1", "H2", "H3", "H4"];

export function detectClusters(cells, W, H, config) {
  const N = W * H;
  let hasWild = false;
  for (let i = 0; i < N; i++) if (cells[i].kind === "WILD") { hasWild = true; break; }
  return hasWild
    ? detectWithWilds(cells, W, H, config)
    : detectSimple(cells, W, H, config);
}

function mkCluster(config, sym, group) {
  group.sort((a, b) => a - b);
  return {
    sym,
    size: group.length,
    cells: group,
    basePay: payMicro(config, sym, group.length),
    anchor: group[0],
  };
}

function detectSimple(cells, W, H, config) {
  const N = W * H;
  const seen = new Uint8Array(N);
  const out = [];
  for (let i = 0; i < N; i++) {
    if (seen[i] || cells[i].kind !== "SYM") continue;
    const sym = cells[i].sym;
    const stack = [i];
    seen[i] = 1;
    const group = [];
    while (stack.length) {
      const j = stack.pop();
      group.push(j);
      for (const nb of neighbors(j, W, H)) {
        if (!seen[nb] && cells[nb].kind === "SYM" && cells[nb].sym === sym) {
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
    if (group.length >= config.minCluster) out.push(mkCluster(config, sym, group));
  }
  return out;
}

function connectedGroups(cellSet, W, H, config, sym) {
  // reconnect a set of indices (Set) via 4-neighbourhood; groups >= minCluster pay
  const seen = new Set();
  const out = [];
  for (const start of cellSet) {
    if (seen.has(start)) continue;
    const stack = [start];
    seen.add(start);
    const group = [];
    while (stack.length) {
      const j = stack.pop();
      group.push(j);
      for (const nb of neighbors(j, W, H)) {
        if (cellSet.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    if (group.length >= config.minCluster) out.push(mkCluster(config, sym, group));
  }
  return out;
}

function detectWithWilds(cells, W, H, config) {
  const N = W * H;
  const isWild = (i) => cells[i].kind === "WILD";
  const isSym = (i) => cells[i].kind === "SYM";

  // 1. non-wild same-symbol components
  const compId = new Int32Array(N).fill(-1);
  const comps = []; // { sym, cells:[] }
  for (let i = 0; i < N; i++) {
    if (!isSym(i) || compId[i] >= 0) continue;
    const sym = cells[i].sym;
    const id = comps.length;
    const stack = [i];
    compId[i] = id;
    const cs = [];
    while (stack.length) {
      const j = stack.pop();
      cs.push(j);
      for (const nb of neighbors(j, W, H)) {
        if (isSym(nb) && cells[nb].sym === sym && compId[nb] < 0) {
          compId[nb] = id;
          stack.push(nb);
        }
      }
    }
    comps.push({ sym, cells: cs });
  }

  // 2. wild blobs
  const blobId = new Int32Array(N).fill(-1);
  const blobs = []; // { cells:[], minIdx }
  for (let i = 0; i < N; i++) {
    if (!isWild(i) || blobId[i] >= 0) continue;
    const id = blobs.length;
    const stack = [i];
    blobId[i] = id;
    const cs = [];
    while (stack.length) {
      const j = stack.pop();
      cs.push(j);
      for (const nb of neighbors(j, W, H)) {
        if (isWild(nb) && blobId[nb] < 0) {
          blobId[nb] = id;
          stack.push(nb);
        }
      }
    }
    cs.sort((a, b) => a - b);
    blobs.push({ cells: cs, minIdx: cs[0] });
  }

  // 3. comp <-> blob adjacency
  const compBlobs = comps.map(() => new Set());
  const blobComps = blobs.map(() => new Set());
  for (let b = 0; b < blobs.length; b++) {
    for (const j of blobs[b].cells) {
      for (const nb of neighbors(j, W, H)) {
        if (isSym(nb)) {
          compBlobs[compId[nb]].add(b);
          blobComps[b].add(compId[nb]);
        }
      }
    }
  }

  // 4. per symbol: bipartite connected groups of (comps of sym) + adjacent blobs
  const groups = []; // { sym, comps:Set<compId>, blobs:Set<blobId> }
  const blobGroups = blobs.map(() => []); // groups referencing this blob
  const symsPresent = [...new Set(comps.map((c) => c.sym))];
  for (const s of symsPresent) {
    const sComps = comps.map((_, i) => i).filter((i) => comps[i].sym === s);
    const gseen = new Set();
    for (const c0 of sComps) {
      if (gseen.has(c0)) continue;
      const gc = new Set();
      const gb = new Set();
      const stack = [["c", c0]];
      gseen.add(c0);
      while (stack.length) {
        const [t, x] = stack.pop();
        if (t === "c") {
          gc.add(x);
          for (const b of compBlobs[x]) if (!gb.has(b)) { gb.add(b); stack.push(["b", b]); }
        } else {
          for (const c of blobComps[x]) {
            if (comps[c].sym === s && !gc.has(c)) {
              gseen.add(c);
              gc.add(c);
              stack.push(["c", c]);
            }
          }
        }
      }
      const g = { sym: s, comps: gc, blobs: gb };
      const gi = groups.length;
      groups.push(g);
      for (const b of gb) blobGroups[b].push(gi);
    }
  }

  // 5. resolve contested blobs (in >1 group), row-major by blob.minIdx
  const blobAssign = new Int32Array(blobs.length).fill(-1); // -1 = unassigned/none
  const cellsOfGroup = (g, includeBlob) => {
    const set = new Set();
    for (const c of g.comps) for (const j of comps[c].cells) set.add(j);
    for (const b of g.blobs) {
      if (b === includeBlob) { for (const j of blobs[b].cells) set.add(j); continue; }
      if (blobGroups[b].length === 1 || blobAssign[b] === groups.indexOf(g)) {
        for (const j of blobs[b].cells) set.add(j);
      }
    }
    return set;
  };
  const contested = blobs
    .map((_, b) => b)
    .filter((b) => blobGroups[b].length > 1)
    .sort((a, b) => blobs[a].minIdx - blobs[b].minIdx);

  for (const b of contested) {
    let best = -1;
    let bestGain = -Infinity;
    let bestSize = -1;
    let bestSymRank = 99;
    let bestAnchor = Infinity;
    for (const gi of blobGroups[b]) {
      const g = groups[gi];
      const withSet = cellsOfGroup(g, b);
      const sizeWith = withSet.size;
      const payWith = payMicro(config, g.sym, sizeWith);
      const sizeWithout = sizeWith - blobs[b].cells.length;
      const payWithout = payMicro(config, g.sym, sizeWithout);
      const gain = payWith - payWithout;
      const symRank = SYMBOL_ORDER.indexOf(g.sym);
      const anchor = Math.min(...[...g.comps].flatMap((c) => comps[c].cells));
      const better =
        gain > bestGain ||
        (gain === bestGain && sizeWith > bestSize) ||
        (gain === bestGain && sizeWith === bestSize && symRank < bestSymRank) ||
        (gain === bestGain && sizeWith === bestSize && symRank === bestSymRank && anchor < bestAnchor);
      if (better) {
        best = gi;
        bestGain = gain;
        bestSize = sizeWith;
        bestSymRank = symRank;
        bestAnchor = anchor;
      }
    }
    blobAssign[b] = best;
  }

  // 6. final clusters per group
  const out = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const set = new Set();
    for (const c of g.comps) for (const j of comps[c].cells) set.add(j);
    for (const b of g.blobs) {
      const owned = blobGroups[b].length === 1 || blobAssign[b] === gi;
      if (owned) for (const j of blobs[b].cells) set.add(j);
    }
    for (const cl of connectedGroups(set, W, H, config, g.sym)) out.push(cl);
  }
  return out;
}
