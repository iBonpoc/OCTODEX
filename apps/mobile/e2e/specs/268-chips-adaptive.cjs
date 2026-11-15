/**
 * Chips of a choice never wrap (DS А2, #1095), every view:
 * - the showcase: three options — a segment, all radios on one line; six — a field with a menu, no radios;
 * - «Новый расход»: «Где купили», «Категория», «К какой работе» are fields with a menu (five options and more);
 *   a pick sets the value on the row.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/selectors");
  await vis("showcase-selectors").waitFor({ timeout: 5000 });
  const few = vis("showcase-choice-few");
  const radios = few.getByRole("radio");
  h.expect((await radios.count()) === 3, "three options: three radios");
  const ys = await radios.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  h.expect(ys.every((y) => y === ys[0]), `the segment is one line (${ys.join(",")})`);
  h.expect((await vis("showcase-choice-many").getByRole("radio").count()) === 0, "six options: no chips");
  h.expect((await vis("showcase-choice-many").getByRole("button").count()) === 1, "six options: one field");

  // under <ReadOnly> a field does not open (#1095 review: the settings only the director changes)
  const ro = vis("showcase-select-readonly");
  await ro.getByRole("button").first().click({ force: true }).catch(() => {});
  h.expect((await p.getByRole("menu").locator("visible=true").count()) === 0, "a read-only field does not open its menu");

  await h.go("/expense/new");
  for (const id of ["expense-vendor", "expense-category", "expense-job"]) {
    h.expect((await vis(`${id}-button`).count()) === 1, `${id} is a field`);
  }
  h.expect((await p.getByRole("radio").locator("visible=true").count()) === 0, "no chips on «Новый расход»");
  await vis("expense-category-button").click();
  await p.getByTestId("expense-category-fuel").locator("visible=true").last().click();
  await p.getByRole("menu").locator("visible=true").waitFor({ state: "detached", timeout: 3000 });
  await p.waitForFunction(() => /Бензин/.test(document.querySelector('[data-testid="expense-category-button"]')?.getAttribute("aria-label") ?? ""), null, { timeout: 3000 });
};
