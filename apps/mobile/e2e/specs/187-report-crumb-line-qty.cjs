/**
 * e2e 187 — «Лиды и клиенты» №13, долги 3 и 5. Every view.
 * - a report's crumb is its own title: «Отчёты › Кто должен», not «Отчёты › Отчёты» (Деньги №2, 08.11);
 * - a job's own line shows the quantity the total counts: «1.23455» → «1.2346 × $10» (like shownQty of estimates, #417).
 * Test prices.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/reports/owed");
  // v2 (#2350): a phone — the header is the crumb (the title is the report, «‹» goes back to the list of reports); 820/1280 —
  // the trail «Где вы» over it, its last crumb the report
  await p.getByTestId("screen-title").locator("visible=true").first().waitFor({ timeout: 8000 });
  const trail = p.getByRole("toolbar", { name: "Где вы" }).locator("visible=true");
  const head = (await trail.count()) ? trail.first() : p.getByTestId("screen-head").locator("visible=true").first();
  const title = (await p.getByTestId("screen-title").locator("visible=true").first().innerText()).trim();
  h.expect(title === "Кто должен", `the title is the report (${title})`);
  const words = await head.innerText();
  h.expect(/Кто должен/.test(words) || title === "Кто должен", `the last crumb is the report (${words.replace(/\n/g, " ")})`);
  h.expect((words.match(/Отчёты/g) || []).length === 1, `«Отчёты» once (${words.replace(/\n/g, " ")})`);
  h.expect((await p.getByRole("button", { name: "Назад: Отчёты", exact: true }).locator("visible=true").count()) === 1, "the parent is the list of reports");
  await h.shot("crumb");

  await h.go("/job/j3");
  await p.getByTestId("job-screen-sections-overview").locator("visible=true").click();
  await p.waitForTimeout(300);
  await p.getByTestId("job-lines-add").locator("visible=true").first().click();
  await p.waitForTimeout(400);
  const s = h.sheet();
  await s.getByPlaceholder("Название").fill("Sealant (test)");
  await s.getByPlaceholder("Кол-во").fill("1.23455");
  await s.getByPlaceholder("Цена").fill("10");
  await s.getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await p.waitForTimeout(600);
  await h.expectText(/1\.2346 × \$10(\.00)? /, "the line shows the counted quantity");
  h.expect(!/1\.23455 ×/.test(await h.text()), "not the raw one");
  const total = await p.getByTestId("job-lines-total").locator("visible=true").first().innerText();
  h.expect(/\$12\.35/.test(total), `the total of the same quantity (1.2346 × 10, half up): ${total.replace(/\n/g, " ")}`);
  await h.shot("line-qty");
};
