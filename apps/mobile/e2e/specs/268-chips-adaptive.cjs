/**
 * Chips of a choice never wrap (DS А2, #1095), every view:
 * - the showcase: three options — a segment, all radios on one line; six — a field with a menu, no radios;
 * - «Новый расход»: «Где купили», «Категория», «К какой работе» are fields with a menu (five options and more);
 *   a pick sets the value on the row.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system");
  await vis("showcase-selectors").waitFor({ timeout: 5000 });
  const few = vis("showcase-choice-few");
  const radios = few.getByRole("radio");
  h.expect((await radios.count()) === 3, "three options: three radios");
  const ys = await radios.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  h.expect(ys.every((y) => y === ys[0]), `the segment is one line (${ys.join(",")})`);
  h.expect((await vis("showcase-choice-many").getByRole("radio").count()) === 0, "six options: no chips");
  h.expect((await vis("showcase-choice-many").getByRole("button").count()) === 1, "six options: one field");

  await h.go("/expense/new");
  for (const name of ["Где купили", "Категория", "К какой работе"]) {
    h.expect((await p.getByRole("button", { name, exact: true }).locator("visible=true").count()) === 1, `«${name}» is a field`);
  }
  h.expect((await p.getByRole("radio", { name: "Бензин", exact: true }).count()) === 0, "no chip «Бензин»");
  await p.getByRole("button", { name: "Категория", exact: true }).locator("visible=true").first().click();
  await p.getByRole("menuitem", { name: "Бензин", exact: true }).locator("visible=true").last().click();
  await p.getByRole("menu").locator("visible=true").waitFor({ state: "detached", timeout: 3000 });
  await p.waitForFunction(() => [...document.querySelectorAll('[aria-label="Категория"]')].some((e) => e.textContent?.includes("Бензин")), null, { timeout: 3000 });
};
