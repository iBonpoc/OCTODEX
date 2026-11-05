/**
 * PWA from the Home Screen (PR #77): the page covers the whole screen (viewport-fit=cover),
 * so the header and the tab pill must keep clear of the notch and the home indicator.
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
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
    return {
      top,
      tabTop: tabs.length ? Math.min(...tabs.map((b) => b.top)) : null,
      tabBottom: tabs.length ? Math.max(...tabs.map((b) => b.bottom)) : null,
      h: window.innerHeight,
    };
  });

exports.run = async (h) => {
  const { page } = h;
  await h.go("/clients");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  h.expect(/viewport-fit=cover/.test(viewport || ""), "page covers the notch (viewport-fit=cover)");
  h.expect((await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content")) === "yes", "iOS opens the Home Screen icon as an app");
  h.expect((await page.locator('link[rel="manifest"]').count()) === 1, "manifest linked");

  await withInsets(h);
  let m = await measure(page);
  h.expect(m.top >= TOP, `/clients: header below the notch (text top ${m.top} ≥ ${TOP})`);
  h.expect(m.tabTop !== null, "/clients: tab bar shown");
  h.expect(m.tabTop >= TOP && m.tabBottom <= m.h - BOTTOM, `/clients: tabs clear of notch and home indicator (${m.tabTop}–${m.tabBottom}, screen ${m.h})`);

  // client page: an ordinary page in the client's browser, but its header still keeps clear of the notch
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.expectText(/Estimate EST-\d+/, "client page opens");
  await withInsets(h);
  m = await measure(page);
  h.expect(m.top >= TOP, `/p/: header below the notch (text top ${m.top} ≥ ${TOP})`);
};
