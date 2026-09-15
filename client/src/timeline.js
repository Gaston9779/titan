// Presentation adapter:  RoundResult.trace  ->  ordered PresentationStep[]
//
// This layer performs NO game logic. It only:
//   - renames engine trace events to presentation step kinds
//   - attaches a nominal animation duration per kind
//   - carries a few already-decided values forward for convenient display
// Every outcome (symbols, wins, cascades, powers, shards, bonus, payout) is taken
// verbatim from the engine trace. If a field isn't in the trace, it isn't invented.

const BASE_DURATION = {
  spinStart: 260,
  clusterHighlight: 620,
  heat: 220,
  remove: 240,
  power: 560,
  gravity: 300,
  refill: 300,
  merge: 420,
  spinEnd: 200,
  bonusStart: 1100,
  expansion: 1300,
  molten: 260,
  retrigger: 900,
  bonusEnd: 900,
  maxWin: 1600,
  roundEnd: 120,
};

const RENAME = {
  fill: "spinStart",
  cascade: "clusterHighlight",
  heat: "heat",
  remove: "remove",
  power: "power",
  gravity: "gravity",
  refill: "refill",
  merge: "merge",
  spinEnd: "spinEnd",
  bonusStart: "bonusStart",
  expansion: "expansion",
  molten: "molten",
  retrigger: "retrigger",
  bonusEnd: "bonusEnd",
  maxWin: "maxWin",
  roundEnd: "roundEnd",
};

export function buildTimeline(trace) {
  if (!Array.isArray(trace)) throw new Error("buildTimeline: RoundResult has no trace");
  const steps = [];
  for (const ev of trace) {
    const kind = RENAME[ev.t];
    if (!kind) continue; // unknown event type -> ignored, never guessed
    const step = { kind, duration: BASE_DURATION[kind] ?? 200, data: ev };
    if (kind === "spinStart") {
      step.grid = ev.grid;
      step.mode = ev.mode;
      step.phase = ev.phase || (ev.mode === "BASE" ? "PAID" : "BONUS");
    }
    steps.push(step);
  }
  return steps;
}

// A compact, display-only summary of the RoundResult for the debug pane.
export function summarize(result) {
  const d = result.diagnostics;
  return {
    seed: result.seedInfo,
    configHash: result.configHash,
    cappedWinX: result.cappedWin / 1_000_000,
    capped: result.capped,
    contributionsX: mapX(result.contributions),
    byLocationX: mapX(result.contribByLocation),
    bonus: result.bonus,
    diagnostics: {
      maxCascadeDepth: d.maxCascadeDepth,
      powersByType: d.powersByType,
      shardsSpawned: d.shardsSpawned,
      merges: d.merges,
      maxShardLevel: d.maxShardLevel,
      maxPressureTier: d.maxPressureTier,
      coreCount: d.coreCount,
      capReached: d.capReached,
      rngDraws: d.rngDraws,
    },
    traceEvents: result.trace ? result.trace.length : 0,
  };
}

const mapX = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / 1_000_000).toFixed(4)]));
