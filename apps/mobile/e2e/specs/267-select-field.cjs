/**
 * SelectField (DS А2, #947), every view — in the showcase (Настройки → Дизайн-система → «Селекторы»):
 * - a row: the label on the left, the value on the right; nothing chosen — «Выберите»;
 * - a tap opens the menu at the row with the choices, the chosen one marked; a pick sets the value and closes it;
 * - Esc closes the menu without a change; an error line stands under the row.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system");
  await vis("showcase-selectors").waitFor({ timeout: 5000 });
  const chosen = vis("showcase-select-chosen");
  const empty = vis("showcase-select-empty");
  h.expect(/ft/.test(await chosen.innerText()), "the chosen value is on the row");
  h.expect(/Выберите/.test(await empty.innerText()), "nothing chosen: «Выберите»");
  h.expect(/Выберите единицу/.test(await vis("showcase-select-error").innerText()), "the error line is under the row");

  await chosen.getByRole("button").first().click();
  const menu = p.getByRole("menu").locator("visible=true").last();
  await menu.waitFor({ timeout: 3000 });
  const items = menu.getByRole("menuitem");
  h.expect((await items.count()) === 6, `six choices in the menu (${await items.count()})`);
  // the mark is the check icon (react-native-web gives a menu item no aria-selected)
  const CHECK = 'svg path[d^="M5 12.5l4.5 4.5"]';
  h.expect((await menu.getByRole("menuitem", { name: "ft" }).locator(CHECK).count()) === 1, "the chosen one has the check");
  h.expect((await menu.getByRole("menuitem", { name: "m", exact: true }).locator(CHECK).count()) === 0, "the others have none");

  // Esc: closed, nothing changed
  await pressEscUntilClosed(p, menu);
  h.expect(/ft/.test(await chosen.innerText()), "Esc leaves the value as it was");

  // a pick
  await chosen.getByRole("button").first().click();
  const menu2 = p.getByRole("menu").locator("visible=true").last();
  await menu2.waitFor({ timeout: 3000 });
  await menu2.getByRole("menuitem", { name: "m", exact: true }).click();
  await p.getByRole("menu").locator("visible=true").waitFor({ state: "detached", timeout: 3000 });
  await p.waitForFunction(() => document.querySelector('[data-testid="showcase-select-chosen"]')?.textContent?.includes("m"), null, { timeout: 3000 });
  h.expect(!/ft/.test(await chosen.innerText()) && /\bm\b/.test(await chosen.innerText()), `the pick is on the row (${(await chosen.innerText()).replace(/\n/g, " ")})`);
};
