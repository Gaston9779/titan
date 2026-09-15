// Deterministic replay verification: same seed + config => identical results.
import crypto from "node:crypto";
import { resolveRound } from "../engine/round.js";
import { defaultConfig } from "../engine/config.js";

const cfg = defaultConfig();
const seed = BigInt(process.argv[2] || "424242");
const count = Number(process.argv[3] || 5000);

function runHash(withTags) {
  const h = crypto.createHash("sha256");
  for (let i = 0; i < count; i++) {
    h.update(JSON.stringify(resolveRound(cfg, seed, i, { logTags: withTags })));
  }
  return h.digest("hex");
}

const a = runHash(false);
const b = runHash(false);
const at = runHash(true);
const bt = runHash(true);

const ok = a === b && at === bt;
console.log(
  JSON.stringify({
    seed: String(seed),
    count,
    resultHash: a.slice(0, 32),
    resultHashRepeat: b.slice(0, 32),
    withTagsHash: at.slice(0, 32),
    withTagsHashRepeat: bt.slice(0, 32),
    deterministic: ok,
  }, null, 2),
);
process.exit(ok ? 0 : 1);
