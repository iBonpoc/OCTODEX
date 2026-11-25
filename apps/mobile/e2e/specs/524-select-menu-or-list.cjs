/**
 * Choosing a value (DS §9б, #2412, council 23.11.2026), every view:
 * - short words: the field opens a menu at the field — no title, 240…280 wide, its right edge on the field's, «Ничего»
 *   its own group; a pick fills the field;
 * - long names: the arrow ›, a list (not a menu), no search under 13 items; a pick fills the field;
 * - the colour field: a sample beside the name in the field and in every row; «Без покраски» its own group first.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/selectors");
  await vis("showcase-selectors").waitFor({ timeout: 5000 });

  // short words → the menu at the field
  await vis("showcase-pick-short").scrollIntoViewIfNeeded();
  const field = vis("showcase-pick-short-button");
  h.expect((await field.getAttribute("aria-haspopup")) === "menu", "short words: the field opens a menu");
  await field.click();
  const menu = p.getByRole("menu").locator("visible=true").last();
  await menu.waitFor({ timeout: 3000 });
  const fb = await field.boundingBox();
  const mb = await menu.boundingBox();
  h.expect(mb.width <= 280 + 1 && mb.width >= 240 - 1, `the menu is as wide as its words, 240…280 (${Math.round(mb.width)})`);
  if (fb.width >= 280) h.expect(Math.abs(mb.x + mb.width - (fb.x + fb.width)) <= 2, "its right edge on the field's right edge");
  h.expect(mb.y >= fb.y + fb.height || mb.y + mb.height <= fb.y, "it does not cover the field");
  h.expect((await menu.getByText("Короткие слова", { exact: true }).count()) === 0, "no title in the value menu");
  h.expect((await p.getByTestId("menu-divider").locator("visible=true").count()) === 1, "«Ничего» is its own group");
  await p.getByRole("menuitem", { name: "Сатин" }).locator("visible=true").first().click();
  await p.waitForFunction(() => /Сатин/.test(document.querySelector('[data-testid="showcase-pick-short"]')?.textContent ?? ""), null, { timeout: 3000 });

  // long names → a list, no search under 13
  await vis("showcase-pick-long").scrollIntoViewIfNeeded();
  h.expect((await vis("showcase-pick-long-button").getAttribute("aria-haspopup")) === "dialog", "long names: the field opens a list");
  await vis("showcase-pick-long-button").click();
  await vis("showcase-pick-long-picker").waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("showcase-pick-long-picker-search").locator("visible=true").count()) === 0, "five items: no search");
  await vis("showcase-pick-long-picker-ds.pick.l3").getByRole("button").first().click();
  await p.waitForFunction(() => /анкер/.test(document.querySelector('[data-testid="showcase-pick-long"]')?.textContent ?? ""), null, { timeout: 3000 });

  // the colour field: samples in the field and in the rows, «Без покраски» first
  await vis("showcase-pick-color").scrollIntoViewIfNeeded();
  h.expect((await vis("showcase-pick-color").getByTestId("swatch").count()) === 1, "the field shows the colour's sample");
  await vis("showcase-pick-color-button").click();
  const list = vis("showcase-pick-color-picker");
  await list.waitFor({ timeout: 3000 });
  h.expect((await list.getByTestId("swatch").count()) === 5, "a sample in every palette row");
  const first = await list.locator('[data-testid^="showcase-pick-color-picker-"]').first().getAttribute("data-testid");
  h.expect(first === "showcase-pick-color-picker-none", `«Без покраски» first (${first})`);
  await pressEscUntilClosed(p, list);
};
