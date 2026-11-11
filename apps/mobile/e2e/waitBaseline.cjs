/**
 * The count of fixed sleeps in e2e (#1034, #906 п.4): one function for the guard test (test/e2eWaitGuard.test.ts) and for this
 * command, so they cannot disagree.
 *   node e2e/waitBaseline.cjs           show what differs from e2e/waitForTimeoutBaseline.json
 *   node e2e/waitBaseline.cjs --write   rewrite the baseline from the files (run it after you removed sleeps; a NEW sleep is
 *                                       not a reason to run it — wait for a sign instead: e2e/settle.cjs, waitForFunction)
 * A sleep is a page.waitForTimeout call or a promise that waits on setTimeout, in any .cjs/.mjs/.js under e2e/ (nested folders too).
 */
const fs = require("node:fs");
const path = require("node:path");

const E2E = __dirname;
const ROOT = path.join(E2E, "..");
const BASELINE = path.join(E2E, "waitForTimeoutBaseline.json");

function files(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    if (f === "out" || f === "node_modules") continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) files(p, out);
    else if (/\.(cjs|mjs|js)$/.test(f)) out.push(p);
  }
  return out;
}

const sleepsIn = (src) => (src.match(/waitForTimeout\(/g) || []).length + (src.match(/new Promise\([\s\S]{0,80}?setTimeout\(/g) || []).length;
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

/** { "e2e/specs/12-tech-day.cjs": 5, … } — only files that have a sleep */
function counts() {
  const out = {};
  for (const p of files(E2E)) {
    const n = sleepsIn(fs.readFileSync(p, "utf8"));
    if (n) out[rel(p)] = n;
  }
  return Object.fromEntries(Object.entries(out).sort());
}

const readBaseline = () => JSON.parse(fs.readFileSync(BASELINE, "utf8"));

/** what differs: { more: [...], fewer: [...] } as text lines */
function diff(now = counts(), base = readBaseline()) {
  const more = Object.entries(now).filter(([f, n]) => n > (base[f] ?? 0)).map(([f, n]) => `${f}: ${n} > ${base[f] ?? 0}`);
  const fewer = Object.entries(base).filter(([f, n]) => (now[f] ?? 0) < n).map(([f, n]) => `${f}: baseline ${n}, now ${now[f] ?? 0}`);
  return { more, fewer };
}

const COMMAND = "cd apps/mobile && node e2e/waitBaseline.cjs --write";

module.exports = { sleepsIn, counts, diff, readBaseline, files, rel, COMMAND, BASELINE };

if (require.main === module) {
  if (process.argv.includes("--write")) {
    const now = counts();
    fs.writeFileSync(BASELINE, JSON.stringify(now, null, 1) + "\n");
    console.log(`baseline written: ${Object.keys(now).length} files, ${Object.values(now).reduce((a, b) => a + b, 0)} sleeps`);
  } else {
    const { more, fewer } = diff();
    if (!more.length && !fewer.length) console.log("baseline is exact");
    else {
      if (more.length) console.log(`NEW sleeps (wait for a sign instead — do not raise the baseline):\n${more.join("\n")}`);
      if (fewer.length) console.log(`FEWER sleeps (lower the baseline: ${COMMAND}):\n${fewer.join("\n")}`);
      process.exit(1);
    }
  }
}
