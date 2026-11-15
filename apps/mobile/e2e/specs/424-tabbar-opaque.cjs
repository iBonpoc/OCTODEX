/**
 * e2e 424 — the phone's tab bar hides what is under it (#1467, DS §6.4), the director, every view, by testID:
 * - the bar's panel (the nearest painted ancestor of «tab-bar») is not see-through: its colour has no alpha;
 * - scrolled to the end of a long list, the last card stands wholly above the bar.
 * From 820 the bar is the side menu: nothing to cover, only the first is skipped.
 */
exports.run = async (h) => {
  const p = h.page;
  if (h.layout.width >= 820) return;
  await h.go("/search?q=a");
  await p.getByTestId("search-hit").locator("visible=true").first().waitFor({ timeout: 8000 });
  const panel = await p.evaluate(() => {
    const bar = [...document.querySelectorAll('[data-testid="tab-bar"]')].find((e) => e.offsetParent !== null);
    for (let a = bar; a; a = a.parentElement) {
      const bg = getComputedStyle(a).backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return { bg, top: a.getBoundingClientRect().top };
    }
    return { bg: "none", top: 0 };
  });
  h.expect(/^rgb\(/.test(panel.bg), `the tab bar's panel is opaque (${panel.bg})`);
  // the end of the list
  await p.evaluate(() => {
    const s = [...document.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== "visible" && e.clientHeight > 300);
    if (s) {
      s.setAttribute("data-e2e-scroller", "1");
      s.scrollTop = s.scrollHeight;
    }
  });
  // the scroll has reached the end (no fixed sleep)
  await p.waitForFunction(() => {
    const s = document.querySelector('[data-e2e-scroller="1"]');
    return !!s && s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
  }, null, { timeout: 5000 });
  await h.shot("end");
  const last = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="search-hit"]')].filter((e) => e.offsetParent !== null);
    return cards[cards.length - 1].getBoundingClientRect().bottom;
  });
  h.expect(last <= panel.top + 1, `the last card ends above the bar (${Math.round(last)} ≤ ${Math.round(panel.top)})`);
};
