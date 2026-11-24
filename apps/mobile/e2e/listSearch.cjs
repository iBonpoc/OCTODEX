/**
 * The search of a list is an icon (founder 07.11, docs/specs/31-list-filters.md §6 п.2а): open it by its testID and type.
 * listSearch(page, text) → the field (open, focused). An empty text leaves it open and empty; listSearchClear folds it.
 * Two kinds of lists: the FilterBar (`filter-search-toggle` / `filter-search-field` / `filter-search-clear`) and the v2 template
 * ListScreen (#2350: the header's icon `<screen>-search`, the field `<screen>-search-field`; the icon again folds an empty field).
 * The FilterBar under the header's icons (the Plan: `plan-search` opens `filter-search-field`, no ✕) is folded the same way.
 */
const vis = (loc) => loc.locator("visible=true");
const fieldOf = (p) => vis(p.locator('[data-testid="filter-search-field"], [data-testid$="-search-field"]')).first();
const toggleOf = (p) => vis(p.locator('[data-testid="filter-search-toggle"], [data-testid$="-search"]')).first();

async function typeIn(field, text) {
  // the testID sits on the input itself or on the field around it
  const tag = await field.evaluate((e) => e.tagName);
  if (tag === "INPUT" || tag === "TEXTAREA") await field.fill(text);
  else await field.locator("input").first().fill(text);
}

exports.listSearch = async (p, text) => {
  const field = fieldOf(p);
  if (!(await field.count())) {
    await toggleOf(p).click();
    await field.waitFor();
  }
  await typeIn(field, text);
  await p.waitForTimeout(300);
  return field;
};

/** ✕: empty the search and fold the field back into the icon */
exports.listSearchClear = async (p) => {
  const bar = vis(p.getByTestId("filter-search-clear"));
  if ((await vis(p.getByTestId("filter-search-toggle")).count()) || (await vis(p.getByTestId("filter-search-field")).count())) {
    if (!(await vis(p.getByTestId("filter-search-field")).count())) await vis(p.getByTestId("filter-search-toggle")).first().click();
    if (await bar.count()) await bar.first().click();
    else {
      // FilterBar «значки в шапке» (the Plan, v2): the header's magnifier opened the field — empty it, the icon folds it
      const field = fieldOf(p);
      await typeIn(field, "");
      await toggleOf(p).click();
      await field.waitFor({ state: "hidden" });
    }
  } else {
    // ListScreen: empty the field, then its icon folds it
    const field = fieldOf(p);
    if (await field.count()) {
      await typeIn(field, "");
      await toggleOf(p).click();
      await field.waitFor({ state: "hidden" });
    }
  }
  await p.waitForTimeout(300);
};
