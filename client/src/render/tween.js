// Minimal promise-based tween on requestAnimationFrame. Respects a shared clock
// so "instant" / speed multipliers work. No dependency on Pixi's ticker.

export const clock = { speed: 1, instant: false };

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
// gravity-consistent acceleration: symbols start slow, speed up as they fall
export const easeInQuad = (t) => t * t;
export const easeInCubic = (t) => t * t * t;
// impact rebound (slight overshoot then settle) — for landings / entrances
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

const dead = (t) => !t || t.destroyed === true;

export function tween(target, props, ms, ease = easeOutCubic) {
  const dur = clock.instant ? 0 : Math.max(1, ms / clock.speed);
  return new Promise((resolve) => {
    if (dead(target)) return resolve();
    const from = {};
    for (const k of Object.keys(props)) from[k] = target[k];
    if (dur <= 1) {
      for (const k of Object.keys(props)) target[k] = props[k];
      return resolve();
    }
    const t0 = performance.now();
    const frame = (now) => {
      if (dead(target)) return resolve();
      // SKIP / speed change pressed after this tween started → snap to final now
      if (clock.instant) {
        for (const k of Object.keys(props)) target[k] = props[k];
        return resolve();
      }
      const p = Math.min(1, (now - t0) / dur);
      const e = ease(p);
      for (const k of Object.keys(props)) target[k] = from[k] + (props[k] - from[k]) * e;
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

export function wait(ms) {
  if (clock.instant) return Promise.resolve(); // microtask only — not subject to bg-tab clamping
  return new Promise((r) => setTimeout(r, ms / clock.speed));
}
