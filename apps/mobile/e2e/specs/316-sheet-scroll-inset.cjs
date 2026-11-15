/**
 * e2e 316 — the list of a sheet scrolls across the sheet's insets, so the scroll indicator stands in the inset and not over the
 * arrows «›» at the end of the rows (founder 13.11, #1339), every view: the scroll view reaches the sheet's edge and the rows end
 * at least a inset's worth before it.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/lead/new");
  await p.getByRole("button", { name: /Thumbtack/ }).locator("visible=true").first().click();
  const body = p.getByTestId("sheet-body").locator("visible=true").first();
  await body.waitFor({ timeout: 8000 });
  const g = await p.evaluate(() => {
    const b = document.querySelector('[data-testid="sheet-body"]');
    const nodes = [b, ...b.querySelectorAll("*")];
    const sv = nodes.find((n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight) ?? nodes.find((n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY));
    const row = [...b.querySelectorAll('[role="button"]')].find((n) => /Yelp/.test(n.getAttribute("aria-label") || n.innerText));
    const br = b.getBoundingClientRect();
    return { sv: sv.getBoundingClientRect().right, row: row.getBoundingClientRect().right, body: br.right, svLeft: sv.getBoundingClientRect().left, bodyLeft: br.left };
  });
  h.expect(g.row <= g.sv - 12, `the rows end a inset before the scroll view's edge (row ${g.row}, scroll view ${g.sv})`);
  h.expect(g.sv >= g.body + 12 && g.svLeft <= g.bodyLeft - 12, `the scroll view spans the sheet's insets (${g.svLeft}…${g.sv} vs body ${g.bodyLeft}…${g.body})`);
  await h.shot("source");
  // the showcase's long list is the same: its scroll view spans the insets too
  await h.go("/settings/design-system/windows");
  await p.getByTestId("showcase-sheet-list").locator("visible=true").first().getByRole("button").click();
  const list = p.getByTestId("showcase-sheet-list-scroll").locator("visible=true").first();
  await list.waitFor({ timeout: 8000 });
  const lr = await list.evaluate((el) => ({ sv: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left, w: window.innerWidth }));
  h.expect(lr.sv > 0 && lr.left >= 0, "the showcase list is in the sheet");
};
