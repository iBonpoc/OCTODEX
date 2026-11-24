/**
 * e2e 419 — the toast does not cover the end of the page (DS §15.2, #1701), every view, by testID:
 * - from 820 the toast stands at the bottom centre and the scroll keeps the toast lane below the page: scrolled to the end,
 *   the last block of the page stands above the toast (was: the screen's bottom reserve = the toast's own place, and on 820
 *   «Фото добавлено · Отменить» lay on the visit's main button);
 * - a phone: as before — the toast stands above the tab bar.
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const frames = () => p.waitForFunction(() => new Promise((r) => { let n = 0; const f = () => (++n > 12 ? r(true) : requestAnimationFrame(f)); f(); }), null, { timeout: 5000 });

  await h.go("/settings/design-system/notices");
  await tid("showcase-note-undo").waitFor({ timeout: 8000 });
  // the page scrolled to its very end
  await p.evaluate(() => {
    let e = document.querySelector('[data-testid="showcase-note-undo"]');
    while (e && !(e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible")) e = e.parentElement;
    if (e) e.scrollTop = e.scrollHeight;
  });
  await frames();
  await tid("showcase-note-undo").getByRole("button").click();
  await tid("toast-text").waitFor({ timeout: 3000 });
  // the click scrolled the demo's button into view (it is not on the page's last screen in v2): the page to its very end again,
  // with the toast up
  await p.evaluate(() => {
    let e = document.querySelector('[data-testid="showcase-note-undo"]');
    while (e && !(e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible")) e = e.parentElement;
    if (e) e.scrollTop = e.scrollHeight;
  });
  await frames();
  const m = await p.evaluate(() => {
    const text = [...document.querySelectorAll('[data-testid="toast-text"]')].find((e) => e.offsetParent !== null);
    // the pill: the nearest box around the text at least as tall as a hit zone
    let pill = text;
    while (pill && pill.getBoundingClientRect().height < 43) pill = pill.parentElement;
    const toast = pill.getBoundingClientRect();
    // the scroll and the last block in its content
    let sc = document.querySelector('[data-testid="showcase-note-undo"]');
    while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && getComputedStyle(sc).overflowY !== "visible")) sc = sc.parentElement;
    let last = null;
    if (sc) {
      // a leaf cut off by an overflow-hidden parent (a demo's clipped stage) is no block of the page
      const clipped = (e) => {
        const r = e.getBoundingClientRect();
        for (let n = e.parentElement; n && n !== sc; n = n.parentElement) {
          if (getComputedStyle(n).overflowY !== "visible" && r.top >= n.getBoundingClientRect().bottom - 1) return true;
        }
        return false;
      };
      const blocks = [...sc.querySelectorAll("*")].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0 && e.children.length === 0 && !clipped(e));
      last = Math.max(...blocks.map((e) => e.getBoundingClientRect().bottom));
    }
    const tab = [...document.querySelectorAll('[data-testid="tab-bar"]')].find((e) => e.offsetParent !== null);
    return { top: toast.top, bottom: toast.bottom, last, scrolls: !!sc, tabTop: tab ? tab.getBoundingClientRect().top : null, vh: window.innerHeight };
  });
  await h.shot("toast-end-of-page");
  if (wide) {
    h.expect(m.scrolls, "the showcase page scrolls (the check needs the end of a long page)");
    h.expect(m.last <= m.top + 1, `from 820 the last block of the page stands above the toast (last ${Math.round(m.last)}, toast top ${Math.round(m.top)})`);
    h.expect(m.bottom <= m.vh, "the toast is inside the window");
  } else if (m.tabTop !== null) {
    h.expect(m.bottom <= m.tabTop + 1, `a phone: the toast stands above the tab bar (${Math.round(m.bottom)} ≤ ${Math.round(m.tabTop)})`);
  }
};
