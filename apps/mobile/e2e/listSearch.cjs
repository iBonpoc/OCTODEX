/**
 * The search of a list is an icon (founder 07.11, docs/specs/31-list-filters.md §6 п.2а): open it by its testID and type.
 * listSearch(page, text) → the field (open, focused). An empty text leaves it open and empty; listSearchClear folds it.
 */
const vis = (loc) => loc.locator("visible=true");

exports.listSearch = async (p, text) => {
  const field = vis(p.getByTestId("filter-search-field")).first();
  if (!(await field.count())) {
    await vis(p.getByTestId("filter-search-toggle")).first().click();
    await field.waitFor();
  }
  await field.fill(text);
  await p.waitForTimeout(300);
  return field;
};

/** ✕: empty the search and fold the field back into the icon */
exports.listSearchClear = async (p) => {
  const field = vis(p.getByTestId("filter-search-field")).first();
  if (!(await field.count())) await vis(p.getByTestId("filter-search-toggle")).first().click();
  await vis(p.getByTestId("filter-search-clear")).first().click();
  await p.waitForTimeout(300);
};
