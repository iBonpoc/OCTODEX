/**
 * e2e 524 — #2425: a price or a cost that is already there is typed over, not added to (every view; by testID, rule 19).
 * The founder on the iPhone typed «150» into a price that stood at «0.00» and got $1.50; a cost of «190» showed a loss.
 * The money fields of an open estimate row select their text on focus: a tap + typing replaces the old number.
 * (The browser types key by key here, like a finger; the iPhone itself is checked by hand — rule 27.)
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (sel) => p.locator(sel).locator("visible=true").first();
  const field = (pre) => vis(`[data-testid^="${pre}"]`).locator("input");
  const valueIs = (pre, v, what) =>
    p
      .waitForFunction(([s, want]) => document.querySelector(`[data-testid^="${s}"] input`)?.value === want, [pre, v], { timeout: 3000 })
      .catch(() => h.expect(false, what));

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await vis('[data-testid="est-add-new"]').waitFor({ timeout: 8000 });
  await vis('[data-testid="est-add-new"]').getByRole("button").click();
  await field("est-name-").fill("Gutter");

  for (const [pre, first, typed, want] of [
    ["est-price-", "12.13", "150", "150.00"],
    ["est-cost-", "11.03", "190", "190.00"],
  ]) {
    // a number already stands in the field (as after the catalog, or a field shown as 0.00)
    await field(pre).fill(first);
    await field(pre).blur();
    await valueIs(pre, first, `${pre}: «${first}» stands`);
    // a tap and typing key by key, like a finger — the old number goes, the new one stays
    await field(pre).click();
    await field(pre).pressSequentially(typed, { delay: 30 });
    await field(pre).blur();
    await valueIs(pre, want, `${pre}: typing «${typed}» over «${first}» gives ${want}, not a number glued to the old one`);
  }
};
