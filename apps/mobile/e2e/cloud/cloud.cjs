/**
 * Cloud scenarios in a real browser against a LOCAL Supabase (`supabase start`) — docs/specs/21 §4:
 *   node e2e/cloud/cloud.cjs <seed.json> [--no-build] [spec ...]
 * seed.json — scripts/cloud-seed.mjs. Builds the web app with EXPO_PUBLIC_SUPABASE_URL/KEY of that stack into
 * dist-cloud/ (the demo build in dist/ is not touched), serves it and runs e2e/cloud/specs/*.cjs.
 * One view, 390 dark (the director's exception from «all 6 views», 07.11): widths and themes are the demo runs' job,
 * here the server is under test. Like e2e/run.cjs: a fresh context per spec, any page error / console error fails,
 * screenshots in e2e/out/cloud-*.png. A spec gets (h, { seed, browser, BASE, mailpit, admin }).
 * Env: SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY) for `admin` (checking rows the app wrote); MAILPIT_URL
 * (default http://127.0.0.1:54324) for the sign-in code.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { serveDist } = require("../serve.cjs");
const { helpers } = require("../h.cjs");

const APP = path.join(__dirname, "..", "..");
const DIST = path.join(APP, "dist-cloud");
const OUT = path.join(__dirname, "..", "out");
const args = process.argv.slice(2);
const seedFile = args.find((a) => !a.startsWith("--"));
if (!seedFile) {
  console.error("usage: node e2e/cloud/cloud.cjs <seed.json> [--no-build] [spec ...]");
  process.exit(2);
}
const only = args.filter((a) => !a.startsWith("--") && a !== seedFile);
const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(seed.url)) {
  console.error(`cloud.cjs: only a local Supabase, not ${seed.url}`);
  process.exit(2);
}
const LAYOUT = { width: 390, theme: "dark" };

if (!args.includes("--no-build"))
  execSync(`npx expo export --platform web --output-dir dist-cloud`, {
    cwd: APP,
    stdio: "inherit",
    env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: seed.url, EXPO_PUBLIC_SUPABASE_KEY: seed.anonKey },
  });
// the build must point at the local stack, never at the hosted project
const bundle = fs.readdirSync(path.join(DIST, "_expo/static/js/web")).map((f) => fs.readFileSync(path.join(DIST, "_expo/static/js/web", f), "utf8")).join("\n");
if (!bundle.includes(seed.url) || bundle.includes("kgiaxygsjkyiquhjbxdg.supabase.co")) {
  console.error(`cloud.cjs: dist-cloud is not built for ${seed.url} (rebuild without --no-build)`);
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

/** the newest mail to `to` in Mailpit (the local stack catches every mail) → its text */
async function mailpit(to, { after = 0, timeout = 20000 } = {}) {
  const base = process.env.MAILPIT_URL || "http://127.0.0.1:54324";
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=5`).then((x) => x.json()).catch(() => null);
    const m = (r?.messages ?? []).find((x) => Date.parse(x.Created) >= after);
    if (m) {
      const full = await fetch(`${base}/api/v1/message/${m.ID}`).then((x) => x.json());
      return `${full.Subject}\n${full.Text || full.HTML || ""}`;
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`no mail to ${to} in Mailpit (${base}) within ${timeout} ms`);
}

/** service-role REST read (rows the app wrote): admin("invoices?select=*&company_id=eq.<id>") */
async function admin(query) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!key) throw new Error("admin(): set SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${seed.url}/rest/v1/${query}`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`admin ${query}: ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  const server = await serveDist(DIST);
  const BASE = server.base;
  const browser = await chromium.launch();
  const dir = path.join(__dirname, "specs");
  const specs = fs.readdirSync(dir).filter((f) => f.endsWith(".cjs") && (!only.length || only.some((o) => f.includes(o)))).sort();
  let failed = 0;
  for (const file of specs) {
    const spec = require(path.join(dir, file));
    const t0 = Date.now();
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: LAYOUT.width, height: 844 }, locale: "en-US" });
    await ctx.addInitScript((o) => {
      if (localStorage.getItem("octo.lang.v1")) return;
      localStorage.setItem("octo.lang.v1", JSON.stringify(o.lang));
      localStorage.setItem("octo.theme.v1", JSON.stringify(o.theme));
    }, { lang: "ru", theme: LAYOUT.theme, ...(spec.init || {}) });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    // a refused request the spec asked for (offline, a 401 it expects) is the spec's to check, not a page error
    page.on("console", (m) => m.type() === "error" && !(spec.allowConsole || []).some((re) => re.test(m.text())) && errors.push(`console: ${m.text()}`));
    const h = helpers(page, BASE, OUT, `cloud-${file.replace(/\.cjs$/, "")}`);
    h.layout = LAYOUT;
    try {
      await spec.run(h, { seed, browser, BASE, mailpit, admin, ctx });
      if (errors.length) throw new Error(errors.join("\n"));
      console.log(`✓ ${file} @cloud 390 dark (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failed++;
      await page.screenshot({ path: path.join(OUT, `cloud-${file}-FAIL.png`) }).catch(() => {});
      console.log(`✗ ${file} @cloud\n  ${String(e.message || e).split("\n").slice(0, 8).join("\n  ")}`);
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  if (!specs.length) {
    console.error("no cloud spec ran — check the filter");
    process.exit(2);
  }
  console.log(failed ? `\n${failed} of ${specs.length} cloud specs FAILED` : `\nALL ${specs.length} CLOUD SPECS PASSED (390 dark, ${seed.url})`);
  process.exit(failed ? 1 : 0);
})();
