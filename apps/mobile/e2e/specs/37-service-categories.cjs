/**
 * Direction of the business (docs/specs/11-trade.md, handoff S16): settings list (add a preset and an own one, rename,
 * archive, bring back) → direction on the lead → an estimate made from the lead takes it → changing the estimate's
 * does not touch the lead → direction on a job. Both sides of the handoff are checked in the saved data.
 */
exports.run = async (h) => {
  const p = h.page;

  // settings: demo starts with 4 presets
  await h.go("/company/trades");
  await h.expectText(/Хендимен/, "preset direction on the list");
  let db = await h.db();
  h.expect(db.serviceCategories.filter((c) => !c.archivedAt).length === 4, "4 demo directions");

  // + an own direction; a duplicate is refused
  await p.getByPlaceholder("Например, мойка под давлением").fill("Pressure washing");
  await h.click("Добавить");
  await p.getByPlaceholder("Например, мойка под давлением").fill("  pressure WASHING ");
  await h.expectText(/Такое направление уже есть/, "duplicate name warned");
  h.expect(await p.getByRole("button", { name: "Добавить", exact: true }).last().isDisabled(), "duplicate cannot be added");
  await p.getByPlaceholder("Например, мойка под давлением").fill("");
  // + a preset from the list
  await p.getByRole("radio", { name: "Кровля" }).click();
  await p.waitForTimeout(350);
  db = await h.db();
  const wash = db.serviceCategories.find((c) => c.name === "Pressure washing");
  h.expect(wash && !wash.seedKey, "own direction saved by name");
  h.expect(db.serviceCategories.some((c) => c.seedKey === "roofing" && !c.archivedAt), "preset added by key");

  // rename keeps the id
  await p.getByRole("button", { name: "Покраска" }).first().click();
  await p.waitForTimeout(300);
  await h.sheet().locator("input").first().fill("Interior painting");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(350);
  db = await h.db();
  h.expect(db.serviceCategories.find((c) => c.id === "cat-painting")?.name === "Interior painting", "renamed, same id");

  // archive, then bring back
  await p.getByRole("button", { name: "Электрика" }).first().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "В архив", exact: true }).click();
  await p.waitForTimeout(350);
  await h.expectText(/В архиве/, "archived section");
  db = await h.db();
  h.expect(!!db.serviceCategories.find((c) => c.id === "cat-electrical")?.archivedAt, "archived, not deleted");
  // B4: while an active direction has the same name, the archived card has no «Вернуть» and says why
  await p.getByPlaceholder("Например, мойка под давлением").fill("Электрика");
  await h.click("Добавить");
  const arch = p.getByTestId("dir-archived-cat-electrical").locator("visible=true");
  await arch.first().waitFor({ timeout: 5000 });
  await arch.getByText(/Такое направление уже есть/).first().waitFor({ timeout: 3000 });
  h.expect((await arch.getByRole("button", { name: "Вернуть", exact: true }).count()) === 0, "no «Вернуть» while the name is taken");
  // the twin goes to the archive: «Вернуть» is back
  db = await h.db();
  const twin = db.serviceCategories.find((c) => c.name === "Электрика" && !c.archivedAt);
  h.expect(!!twin, "the new «Электрика» is active");
  await p.getByTestId(`dir-${twin.id}`).locator("visible=true").first().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "В архив", exact: true }).click();
  await p.waitForTimeout(350);
  await arch.getByRole("button", { name: "Вернуть", exact: true }).first().waitFor({ timeout: 3000 });
  await arch.getByRole("button", { name: "Вернуть", exact: true }).first().click();
  await p.waitForTimeout(350);
  db = await h.db();
  h.expect(!db.serviceCategories.find((c) => c.id === "cat-electrical")?.archivedAt, "brought back");

  // S16, lead side: choose the direction on the lead
  await h.go("/inbox");
  await p.getByText("Kevin Brooks", { exact: true }).first().click();
  await p.waitForTimeout(700);
  await p.getByRole("button", { name: "Направление" }).first().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Pressure washing" }).click();
  await p.waitForTimeout(350);
  db = await h.db();
  const lead = db.leads.find((l) => l.name === "Kevin Brooks");
  h.expect(lead.serviceCategoryId === wash.id, "direction saved on the lead");
  await h.expectText(/Pressure washing/, "direction shown on the lead");

  // S16, estimate side: an estimate made from the lead takes it
  await h.clickText("Сметы");
  await h.click("Смета");
  await p.getByRole("button", { name: "Добавить позицию" }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByPlaceholder(/Начните писать/).fill("Wash the driveway");
  await h.sheet().getByText(/Своя позиция:/).click(); await p.waitForTimeout(250);
  await h.sheet().locator('input[inputmode="decimal"]').nth(1).fill("350");
  await h.sheet().getByRole("button", { name: "Готово" }).click(); await p.waitForTimeout(250);
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(700);
  db = await h.db();
  const est = db.estimates.find((e) => e.leadId === lead.id);
  h.expect(est && est.serviceCategoryId === wash.id, `estimate from the lead takes its direction: ${est && est.serviceCategoryId}`);

  // a job takes the direction of its estimate (demo job j1 of estimate e5); changing the job's touches nothing else
  await h.go("/job/j1");
  await p.getByRole("button", { name: "Направление" }).first().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Кровля" }).click();
  await p.waitForTimeout(350);
  db = await h.db();
  const roof = db.serviceCategories.find((c) => c.seedKey === "roofing");
  h.expect(db.jobs.find((j) => j.id === "j1")?.serviceCategoryId === roof.id, "direction saved on the job");
  h.expect(db.estimates.find((e) => e.id === "e5")?.serviceCategoryId !== roof.id, "job change does not go back to the estimate");
  h.expect(db.leads.find((l) => l.id === lead.id)?.serviceCategoryId === wash.id, "lead keeps its direction");
};
