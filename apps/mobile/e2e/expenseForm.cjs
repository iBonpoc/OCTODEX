/**
 * #2008: «Где купили» is required and picked from a list with search (or typed): the specs that save an expense pick one.
 * `vendor` — a row of the list; `own` — a text typed in the search and taken by «Указать „…“».
 */
exports.pickVendor = async (p, { vendor = "Home Depot", own } = {}) => {
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await vis("expense-vendor-button").click();
  await vis("expense-vendor-picker").waitFor({ timeout: 5000 });
  if (own) {
    await vis("expense-vendor-picker-search").locator("input").fill(own);
    await vis("expense-vendor-picker-create").getByRole("button").first().click();
  } else {
    await vis(`expense-vendor-picker-${vendor}`).getByRole("button").first().click();
  }
  await p.getByTestId("expense-vendor-picker").locator("visible=true").waitFor({ state: "detached", timeout: 5000 });
};
