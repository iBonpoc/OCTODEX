/**
 * The e2e clock (docs/ai/CHECKS.md §9 п.1). A spec does not depend on the real hour: by default every spec starts at
 * noon of the company's day (Los Angeles), the specs' Date and every browser context on the same clock; it runs on from
 * there. A spec may ask for another minute — `exports.clock = { minute: 21 * 60 + 30 }` — or for the real time —
 * `exports.clock = "real"` (then it may cross the company's midnight, and the runner waits past it). E2E_NOW=<ISO
 * moment> starts every spec at that moment instead, to check a spec at a risky hour (CHECKS §5). The cloud specs
 * (e2e/cloud) run on the real time: the server's now() cannot be moved.
 */
const { atMinute, dayKey } = require("./companyTime.cjs");

const NOON = 12 * 60;

/** the moment (ms) a spec starts at, or null for the real time; `realNow` is the real clock (ms) */
function clockFor(spec, env, realNow) {
  if (env.E2E_NOW) {
    const at = Date.parse(env.E2E_NOW);
    if (Number.isNaN(at)) throw new Error(`E2E_NOW is not a date: ${env.E2E_NOW}`);
    return at;
  }
  const want = spec && spec.clock;
  if (want === "real") return null;
  const minute = want && want.minute !== undefined ? want.minute : NOON;
  if (!Number.isInteger(minute) || minute < 0 || minute >= 24 * 60) throw new Error(`exports.clock.minute is not a minute of the day: ${minute}`);
  return Date.parse(atMinute(dayKey(realNow), minute));
}

module.exports = { clockFor, NOON };
