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
  await h.go("/settings/design-system/selectors");
  await vis("showcase-selectors").waitFor({ timeout: 5000 });
  const chosen = vis("showcase-select-chosen");
  const empty = vis("showcase-select-empty");
  h.expect(/ft/.test(await chosen.innerText()), "the chosen value is on the row");
  h.expect(/Выберите/.test(await empty.innerText()), "nothing chosen: «Выберите»");
  h.expect(/Выберите единицу/.test(await vis("showcase-select-error").innerText()), "the error line is under the row");

  // the web reads the label instead of the button's text: the chosen value is in the name
  h.expect((await chosen.getByRole("button", { name: /Единица.*ft/ }).count()) === 1, "the field's name says the chosen value («Единица, ft»)");
  const rowW = (await chosen.getByRole("button").first().boundingBox()).width;
  await chosen.getByRole("button").first().click();
  const menu = p.getByRole("menu").locator("visible=true").last();
  await menu.waitFor({ timeout: 3000 });
  const menuW = (await menu.boundingBox()).width;
  h.expect(menuW >= Math.min(rowW, 380) - 1 && menuW <= 381, `the menu is not narrower than its row and not wider than the window (${menuW} vs row ${rowW})`);
  const items = menu.getByRole("menuitem");
  h.expect((await items.count()) === 6, `six choices in the menu (${await items.count()})`);
  // the mark is the check icon (react-native-web gives a menu item no aria-selected)
  const CHECK = 'svg path[d^="M5 12.5l4.5 4.5"]';
  h.expect((await menu.getByRole("menuitem", { name: "ft" }).locator(CHECK).count()) === 1, "the chosen one has the check");
  h.expect((await menu.getByRole("menuitem", { name: "m", exact: true }).locator(CHECK).count()) === 0, "the others have none");

  // Esc: closed, nothing changed
  await pressEscUntilClosed(p, menu);
  h.expect(/ft/.test(await chosen.innerText()), "Esc leaves the value as it was");
  await p.waitForFunction(() => { const r = document.querySelector('[data-testid="showcase-select-chosen"]'); return !!r && !!document.activeElement && r.contains(document.activeElement); }, null, { timeout: 3000 });

  // a pick
  await chosen.getByRole("button").first().click();
  const menu2 = p.getByRole("menu").locator("visible=true").last();
  await menu2.waitFor({ timeout: 3000 });
  await menu2.getByRole("menuitem", { name: "m", exact: true }).click();
  await p.getByRole("menu").locator("visible=true").waitFor({ state: "detached", timeout: 3000 });
  await p.waitForFunction(() => /\bm\b/.test(document.querySelector('[data-testid="showcase-select-chosen"]')?.textContent ?? ""), null, { timeout: 3000 });
  h.expect(!/ft/.test(await chosen.innerText()), "the pick replaced the value on the row");

  // the error stands until its own field is chosen; the other fields do not clear it
  const errField = vis("showcase-select-error");
  await empty.getByRole("button").first().click();
  await p.getByRole("menu").locator("visible=true").last().getByRole("menuitem", { name: "in", exact: true }).click();
  await p.getByRole("menu").locator("visible=true").waitFor({ state: "detached", timeout: 3000 });
  h.expect(/Выберите единицу/.test(await errField.innerText()), "choosing in another field does not clear the error");
  await errField.getByRole("button").first().click();
  await p.getByRole("menu").locator("visible=true").last().getByRole("menuitem", { name: "yd", exact: true }).click();
  await p.getByRole("menu").locator("visible=true").waitFor({ state: "detached", timeout: 3000 });
  h.expect(!/Выберите единицу/.test(await errField.innerText()), "choosing in the field itself clears its error");

  // twelve items on a screen 390 high (a phone on its side): the menu stays inside, scrolls, the last item can be chosen
  const vp = p.viewportSize();
  await p.setViewportSize({ width: vp.width, height: 390 });
  const long = vis("showcase-select-long");
  await long.scrollIntoViewIfNeeded();
  await long.getByRole("button").first().click();
  const lm = p.getByRole("menu").locator("visible=true").last();
  await lm.waitFor({ timeout: 3000 });
  const lb = await lm.boundingBox();
  h.expect(lb.y >= 0 && lb.y + lb.height <= 391, `the 12-item menu is inside a 390-high screen (${lb.y}..${lb.y + lb.height})`);
  const scrolls = await lm.getByTestId("menu-items").evaluate((el) => [...el.querySelectorAll("*"), el].some((e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible"));
  h.expect(scrolls, "its items scroll");
  const last = lm.getByRole("menuitem", { name: "a12", exact: true });
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await p.getByRole("menu").locator("visible=true").waitFor({ state: "detached", timeout: 3000 });
  await p.waitForFunction(() => /a12/.test(document.querySelector('[data-testid="showcase-select-long"]')?.textContent ?? ""), null, { timeout: 3000 });
  await p.setViewportSize(vp);
};
