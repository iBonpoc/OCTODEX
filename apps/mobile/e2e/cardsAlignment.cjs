/**
 * Alignment guard for lists on the new list cards (docs/specs/06-list-cards.md): call it from every list spec.
 * - phone 390 / desktop 1280: every card starts and ends on the same vertical lines as the search field;
 * - tablet 820 (grid): cards of one row have the same top and the same height, gaps between columns are equal,
 *   the first column starts and the last column ends on the search field's edges.
 * Cards are found by testID "list-card"; tolerance 1 px (sub-pixel rounding).
 */
const TOL = 1;
const near = (a, b) => Math.abs(a - b) <= TOL;

exports.checkCardAlignment = async (h, { searchPlaceholder, reference, min = 2 } = {}) => {
  const p = h.page;
  // the line the cards must sit on: the search field, or another full-width element of the list (e.g. the filter row)
  const field = reference ? reference(p) : p.getByPlaceholder(searchPlaceholder).last();
  // the search field's frame (the input sits inside a padded box: use its parent row)
  const box = await field.evaluate((el) => {
    let n = el;
    for (let i = 0; i < 4 && n.parentElement; i++) {
      n = n.parentElement;
      const r = n.getBoundingClientRect();
      if (getComputedStyle(n).borderTopWidth !== "0px") return { x: r.x, w: r.width };
    }
    const r = el.getBoundingClientRect();
    return { x: r.x, w: r.width };
  });
  const cards = await p.locator('[data-testid="list-card"]').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
  );
  h.expect(cards.length >= min, `at least ${min} cards on screen (${cards.length})`);
  const right = box.x + box.w;
  if (h.layout.width !== 820) {
    for (const c of cards) {
      h.expect(near(c.x, box.x), `card left edge ${c.x.toFixed(1)} = search left ${box.x.toFixed(1)}`);
      h.expect(near(c.x + c.w, right), `card right edge ${(c.x + c.w).toFixed(1)} = search right ${right.toFixed(1)}`);
    }
    return;
  }
  // tablet grid: rows by top edge
  const rows = [];
  for (const c of [...cards].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((r) => near(r[0].y, c.y));
    row ? row.push(c) : rows.push([c]);
  }
  for (const r of rows) {
    r.sort((a, b) => a.x - b.x);
    h.expect(near(r[0].x, box.x), `first column starts on the search edge (${r[0].x.toFixed(1)} vs ${box.x.toFixed(1)})`);
    for (const c of r) {
      h.expect(near(c.y, r[0].y), `same top in a row (${c.y.toFixed(1)} vs ${r[0].y.toFixed(1)})`);
      h.expect(near(c.h, r[0].h), `same height in a row (${c.h.toFixed(1)} vs ${r[0].h.toFixed(1)})`);
      h.expect(near(c.w, r[0].w), `same column width (${c.w.toFixed(1)} vs ${r[0].w.toFixed(1)})`);
    }
    for (let i = 1; i < r.length; i++) {
      const gap = r[i].x - (r[i - 1].x + r[i - 1].w);
      const gap0 = r.length > 1 ? r[1].x - (r[0].x + r[0].w) : gap;
      h.expect(near(gap, gap0), `equal gaps between columns (${gap.toFixed(1)} vs ${gap0.toFixed(1)})`);
    }
    if (r.length > 1) h.expect(near(r[r.length - 1].x + r[r.length - 1].w, right), "last full column ends on the search edge");
  }
};
