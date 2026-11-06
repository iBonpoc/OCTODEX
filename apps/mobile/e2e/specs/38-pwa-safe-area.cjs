/**
 * PWA from the Home Screen (PR #77): the page covers the whole screen (viewport-fit=cover),
 * so the header and the tab pill must keep clear of the notch and the home indicator.
 * 820/1280 (wave 2b, docs/specs/13 §2.5): no bottom tabs — the side menu; its first and last places keep clear too.
 * Chromium has no notch: the safe-area insets are substituted (47 top / 34 bottom, an iPhone with a notch)
 * on the element react-native-safe-area-context measures env(safe-area-inset-*) with.
 */
const TOP = 47;
const BOTTOM = 34;

async function withInsets(h) {
  const { page, layout } = h;
  await page.addStyleTag({ content: `body > div[style*="z-index: -1"]{padding-top:${TOP}px!important;padding-bottom:${BOTTOM}px!important}` });
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width + 1, height: vp.height }); await page.waitForTimeout(250);
  await page.setViewportSize(vp); await page.waitForTimeout(800);
  h.expect(layout.width === vp.width, "viewport kept the layout width");
}

/** Top of the highest visible text and bottom of the lowest tab, in px from the viewport edges. */
const measure = (page) =>
  page.evaluate(() => {
    const root = document.getElementById("root");
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let top = Infinity;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of r.getClientRects()) if (b.height > 0 && b.width > 0) top = Math.min(top, b.top);
    }
    // the section tabs only (a segmented control has role="tab" too)
    const names = ["Главная", "План", "Сообщения", "Звонки", "Клиенты"];
    const tabs = [...document.querySelectorAll('[role="tab"]')].filter((e) => names.includes(e.getAttribute("aria-label"))).map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
    // the side menu (820/1280): its places and the profile at the bottom
    const nav = document.querySelector('[data-testid="side-nav"]');
    // what is on screen: the scrolling list of places (it scrolls when taller than the screen) and the profile under it
    const rect = (id) => nav?.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    const list = rect("side-scroll");
    const first = rect("side-toggle");
    const profile = rect("side-profile");
    return {
      side: !!nav,
      sideTop: first ? first.top : null,
      sideBottom: list && profile ? Math.max(list.bottom, profile.bottom) : null,
      top,
      tabTop: tabs.length ? Math.min(...tabs.map((b) => b.top)) : null,
      tabBottom: tabs.length ? Math.max(...tabs.map((b) => b.bottom)) : null,
      h: window.innerHeight,
    };
  });

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

/**
 * The manifest as Chromium itself reads it (CDP): no parse errors, standalone,
 * and an empty installability list. The run's own browser can't answer that: headless-shell
 * always returns [] and every context is incognito ("in-incognito"). So a full Chromium
 * (channel "chromium") with a real profile opens the same page. No service worker needed:
 * install from the menu doesn't require one since Chrome 108 (the auto prompt does — a separate step).
 */
async function installable(h, BASE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "octodex-pwa-"));
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chromium" });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(BASE + "/clients");
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page);
    const m = await cdp.send("Page.getAppManifest");
    h.expect(/\/manifest\.webmanifest$/.test(m.url || ""), `manifest found (${m.url})`);
    h.expect(m.errors.length === 0, `manifest parses without errors: ${JSON.stringify(m.errors)}`);
    const data = JSON.parse(m.data);
    h.expect(data.display === "standalone", "manifest display: standalone");
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    h.expect(installabilityErrors.length === 0, `Chrome can install the app: ${JSON.stringify(installabilityErrors)}`);
    // the host falls back to index.html with 200 for any missing file: check the type, not the status
    for (const i of data.icons) {
      const r = await page.request.get(new URL(i.src, BASE).href);
      h.expect(r.ok() && r.headers()["content-type"] === "image/png", `icon ${i.src} is a PNG (${r.headers()["content-type"]})`);
    }
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

exports.run = async (h, { BASE }) => {
  const { page } = h;
  await installable(h, BASE);
  await h.go("/clients");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  h.expect(/viewport-fit=cover/.test(viewport || ""), "page covers the notch (viewport-fit=cover)");
  h.expect((await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content")) === "yes", "iOS opens the Home Screen icon as an app");
  h.expect((await page.locator('link[rel="manifest"]').count()) === 1, "manifest linked");

  await withInsets(h);
  let m = await measure(page);
  h.expect(m.top >= TOP, `/clients: header below the notch (text top ${m.top} ≥ ${TOP})`);
  if (h.layout.width < 820) {
    h.expect(m.tabTop !== null, "/clients: tab bar shown");
    h.expect(m.tabTop >= TOP && m.tabBottom <= m.h - BOTTOM, `/clients: tabs clear of notch and home indicator (${m.tabTop}–${m.tabBottom}, screen ${m.h})`);
    h.expect(!m.side, "/clients: no side menu on the phone");
  } else {
    h.expect(m.tabTop === null, "/clients: no bottom tab bar on 820/1280");
    h.expect(m.side && m.sideTop !== null, "/clients: the side menu shown");
    h.expect(m.sideTop >= TOP && m.sideBottom <= m.h - BOTTOM, `/clients: side menu clear of notch and home indicator (${m.sideTop}–${m.sideBottom}, screen ${m.h})`);
  }

  // client page: an ordinary page in the client's browser, but its header still keeps clear of the notch
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.expectText(/Estimate EST-\d+/, "client page opens");
  await withInsets(h);
  m = await measure(page);
  h.expect(m.top >= TOP, `/p/: header below the notch (text top ${m.top} ≥ ${TOP})`);
};
