/** The web engine of the photographer (#2360): one fresh context per shot on the long-lived Chrome, the same fixed inputs as e2e/visual/visual.cjs. */
const path = require("node:path");
const E2E = path.join(__dirname, "..", "..", "apps", "mobile", "e2e");
const { settle, appReady } = require(path.join(E2E, "settle.cjs"));
const { heightFor } = require("./args.cjs");

/** the fixed moment of every shot (Thursday 20.11.2026, 12:00 in Los Angeles) — the demo is seeded from «today» */
const VISUAL_NOW = "2026-11-20T20:00:00Z";
const NO_MOTION_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
const LARGE_ZOOM = 1.35; // web has no Dynamic Type: the page is zoomed like the largest «Aa» step (fontScale 1.35, statTile); the iPhone engine is the authority

const HINTS = ["today", "company", "clients", "estimate-builder", "inbox", "triage", "money", "jobs", "team", "catalog", "plan", "visits"];

class ShotError extends Error {}

async function nearestTestIds(page, wanted) {
  const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")))]);
  const w = wanted.toLowerCase();
  const score = (id) => { const s = id.toLowerCase(); if (s.includes(w) || w.includes(s)) return 0; const parts = w.split(/[-_.:/]/).filter((x) => x.length > 2); return 10 - parts.filter((p) => s.includes(p)).length * 3 + Math.abs(s.length - w.length) / 50; };
  return ids.sort((a, b) => score(a) - score(b)).slice(0, 8);
}

async function locate(page, testId, what) {
  const loc = page.locator(`[data-testid="${testId.replace(/"/g, '\\"')}"]`).first();
  try { await loc.waitFor({ state: "attached", timeout: 3000 }); return loc; }
  catch {
    const near = await nearestTestIds(page, testId);
    throw new ShotError(`${what}: testID «${testId}» не найден на ${new URL(page.url()).pathname}. Ближайшие: ${near.length ? near.join(", ") : "(на странице нет ни одного testID — страница пустая или маршрут не открылся)"}`);
  }
}

async function runActions(page, ctx, actions) {
  for (const a of actions) {
    if (a.type === "click") { const l = await locate(page, a.arg, "click"); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click({ timeout: 5000 }).catch((e) => { throw new ShotError(`click: «${a.arg}» найден, но нажать нельзя за 5 с: ${String(e.message).split("\n").filter((x) => /intercepts|not visible|not enabled|detached/.test(x))[0]?.trim() || String(e.message).split("\n")[0]}`); }); await settle(page, { quietMs: 250, maxMs: 2500 }); }
    else if (a.type === "clicktext") { await page.getByText(a.arg, { exact: true }).last().click({ timeout: 3000 }).catch(() => { throw new ShotError(`clicktext: текст «${a.arg}» не найден`); }); await settle(page, { quietMs: 250, maxMs: 2500 }); }
    else if (a.type === "hover") { await (await locate(page, a.arg, "hover")).hover(); await settle(page, { quietMs: 150, maxMs: 1500 }); }
    else if (a.type === "fill") { const l = await locate(page, a.arg, "fill"); await l.click(); await l.fill(a.value); await settle(page, { quietMs: 250, maxMs: 2500 }); }
    else if (a.type === "type") { await page.keyboard.type(a.arg); await settle(page, { quietMs: 150, maxMs: 1500 }); }
    else if (a.type === "key") { await page.keyboard.press(a.arg); await settle(page, { quietMs: 250, maxMs: 2500 }); }
    else if (a.type === "wait") await page.clock.runFor(Number(a.arg));
    else if (a.type === "scroll") await scrollTo(page, /^\d+$/.test(a.arg) ? Number(a.arg) : a.arg);
    else if (a.type === "expect") await locate(page, a.arg, "expect");
    else if (a.type === "offline") await ctx.setOffline(true);
    else if (a.type === "online") await ctx.setOffline(false);
    else if (a.type === "goto") { await page.goto(new URL(a.arg, page.url()).href); await appReady(page); await settle(page); }
  }
}

async function scrollTo(page, target) {
  const vp = page.viewportSize();
  if (typeof target === "number") {
    // a person's scroll (the wheel), so the header folds as under a finger
    await page.mouse.move(vp.width / 2, vp.height / 2);
    if (target > 0) await page.mouse.wheel(0, target);
  } else {
    const l = await locate(page, target, "scroll");
    await l.scrollIntoViewIfNeeded();
  }
  await settle(page, { quietMs: 400 });
}

/** returns [{ png: Buffer, frame }] */
async function shootWeb(browser, base, o, log) {
  const vp = { width: o.width, height: heightFor(o.width) };
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: "en-US", timezoneId: "America/Los_Angeles", reducedMotion: o.reduceMotion ? "reduce" : "no-preference", colorScheme: o.theme });
  try {
    await ctx.clock.install({ time: Date.parse(VISUAL_NOW) });
    // the network is muted: only the local build answers, so nothing changes between two shots
    await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && u.protocol.startsWith("http"), (r) => r.abort());
    await ctx.addInitScript((s) => {
      if (localStorage.getItem("octo.lang.v1")) return;
      const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
      set("octo.lang.v1", s.lang); set("octo.role.v1", s.role); set("octo.theme.v1", s.theme); set("octo.planMode.v1", "day"); set("octo.hints.v1", s.hints);
    }, { lang: o.lang, role: o.role, theme: o.theme, hints: HINTS });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + o.route);
    await appReady(page);
    if (o.frames <= 1) await page.addStyleTag({ content: NO_MOTION_CSS });
    if (o.font === "large") await page.addStyleTag({ content: `body{zoom:${LARGE_ZOOM}}` });
    await page.evaluate(() => document.fonts.ready);
    await settle(page, { quietMs: 300 });
    if (o.offline) await ctx.setOffline(true);
    await runActions(page, ctx, o.actions);
    if (o.scroll != null) await scrollTo(page, o.scroll);
    if (errors.length) throw new ShotError(`ошибки страницы на ${o.route}: ${errors.slice(0, 3).join(" | ")}`);
    if (await page.locator('[data-testid="page-not-found"]').count()) throw new ShotError(`маршрута ${o.route} в приложении нет (экран «Страницы нет»). Проверь путь по apps/mobile/src/app/ — например /client/c1, /visit/v4, /estimate/new?id=e6`);
    if (!(await page.evaluate(() => document.body.innerText.trim().length))) throw new ShotError(`страница ${o.route} пустая — маршрут не существует или экран не отрисовался`);
    const target = o.crop ? await locate(page, o.crop, "crop") : null;
    const shots = [];
    for (let i = 1; i <= o.frames; i++) {
      if (i > 1) await page.clock.runFor(o.every);
      const png = target ? await target.screenshot({ animations: o.frames > 1 ? "allow" : "disabled", caret: "hide" }) : await page.screenshot({ animations: o.frames > 1 ? "allow" : "disabled", caret: "hide" });
      shots.push({ png, frame: o.frames > 1 ? i : 0 });
    }
    return shots;
  } finally { await ctx.close(); }
}

module.exports = { shootWeb, ShotError, VISUAL_NOW, LARGE_ZOOM };
