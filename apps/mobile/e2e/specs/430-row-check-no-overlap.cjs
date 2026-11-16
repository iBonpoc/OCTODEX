/**
 * e2e 430 — the check of the open row in a list with the panel (1280, #1495 п.5, DS «Выделение выбранного»): on the desktop row the
 * right edge is the row's own buttons (call, wallet, map), so the check stands at the left corner and covers none of them.
 */
exports.run = async (h) => {
  const p = h.page;
  if (h.layout.width < 1280) return;
  for (const list of ["/invoice?open=i1", "/estimates?open=e6"]) {
    await h.go(list);
    await p.locator('[aria-current="true"]').locator("visible=true").first().waitFor({ timeout: 8000 });
    const r = await p.evaluate(() => {
      const row = [...document.querySelectorAll('[aria-current="true"]')].find((e) => e.offsetParent !== null);
      const chk = row.querySelector('[data-testid="selected-check"]');
      if (!chk) return { missing: true };
      const a = chk.getBoundingClientRect();
      const hits = [...row.querySelectorAll('[role="button"], button')].filter((b) => {
        const q = b.getBoundingClientRect();
        return q.width > 0 && a.left < q.right && a.right > q.left && a.top < q.bottom && a.bottom > q.top;
      }).length;
      return { hits, left: a.left - row.getBoundingClientRect().left };
    });
    h.expect(!r.missing, `${list}: the open row carries the check`);
    h.expect(r.hits === 0, `${list}: the check covers none of the row's buttons (${r.hits})`);
    h.expect(r.left < 40, `${list}: the check stands at the left corner (${Math.round(r.left)})`);
    await h.shot(list.slice(1, 5));
  }
};
