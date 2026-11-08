/**
 * e2e 187 — «Лиды и клиенты» №13, долги 3 и 5. Every view.
 * - a report's crumb is its own title: «Отчёты › Кто должен», not «Отчёты › Отчёты» (Деньги №2, 08.11);
 * - a job's own line shows the quantity the total counts: «1.23455» → «1.2346 × $10» (like shownQty of estimates, #417).
 * Test prices.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/reports/owed");
  const trail = p.getByRole("toolbar", { name: "Где вы" }).last();
  await trail.waitFor({ timeout: 8000 });
  const crumbs = await trail.innerText();
  h.expect(/Кто должен/.test(crumbs), `the last crumb is the report (${crumbs.replace(/\n/g, " ")})`);
  h.expect((crumbs.match(/Отчёты/g) || []).length === 1, `«Отчёты» once (${crumbs.replace(/\n/g, " ")})`);
  h.expect((await trail.getByRole("button", { name: "Назад: Отчёты" }).count()) === 1, "the parent crumb is the list");
  await h.shot("crumb");

  await h.go("/job/j3");
  await p.getByRole("tab", { name: "Деньги", exact: true }).locator("visible=true").click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Позиция", exact: true }).first().click();
  await p.waitForTimeout(400);
  const s = h.sheet();
  await s.getByPlaceholder("Название").fill("Sealant (test)");
  await s.getByPlaceholder("Кол-во").fill("1.23455");
  await s.getByPlaceholder("Цена").fill("10");
  await s.getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await p.waitForTimeout(600);
  await h.expectText(/1\.2346 × \$10(\.00)? /, "the line shows the counted quantity");
  h.expect(!/1\.23455 ×/.test(await h.text()), "not the raw one");
  await h.expectText(/\$12\.35/, "the total of the same quantity (1.2346 × 10, half up)");
  await h.shot("line-qty");
};
