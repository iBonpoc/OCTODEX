/**
 * 3b-2 (docs/specs/17-job.md §11.1, S11/S17): a job made without an estimate gets its own line items on «Деньги»; the
 * total is the engine's (qty × price, half up) and becomes the job's total; a change that brings the total below what
 * is already invoiced is refused (db T69); «Отменить» brings a removed line back. Test prices.
 */
exports.run = async (h) => {
  const p = h.page;
  const job = async () => (await h.db()).jobs.find((j) => j.id === "j3");
  const money = async () => {
    await p.getByRole("tab", { name: "Деньги", exact: true }).locator("visible=true").click(); await p.waitForTimeout(300);
  };
  const addLine = async (name, qty, price) => {
    await p.getByRole("button", { name: "Позиция", exact: true }).first().click(); await p.waitForTimeout(400);
    const s = h.sheet();
    await s.getByPlaceholder("Название").fill(name);
    await s.getByPlaceholder("Кол-во").fill(qty);
    await s.getByPlaceholder("Цена").fill(price);
    await s.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  };

  await h.go("/job/j3");
  await money();
  await h.expectText(/Позиций нет/, "a job without an estimate offers line items");
  await addLine("Drywall patch", "2.5", "19.99");
  await addLine("Labor", "3", "45");
  await h.expectText(/Drywall patch/, "the first line shows");
  await h.expectText(/\$184\.98/, "the total: 49.98 (2.5 × 19.99, half up) + 135.00");
  h.expect((await job()).amountCents === 18498, `the job total follows (${(await job()).amountCents})`);
  const lines = (await h.db()).jobLines.filter((l) => l.jobId === "j3");
  h.expect(lines.length === 2 && lines[0].totalCents === 4998, "two lines, totals half up");
  await h.shot("lines");

  // an invoice of $150 is out: the total may not go below it
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    const base = s.db.invoices[0];
    s.db.invoices.push({ ...base, id: "i-e2e-105", number: "INV-0999", jobId: "j3", customerId: "c3", kind: "progress", totalCents: 15000, paidCents: 0 });
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/job/j3");
  await money();
  await p.getByText("Labor", { exact: true }).locator("visible=true").first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Удалить позицию" }).click(); await p.waitForTimeout(400);
  await h.expectText(/Итог не может быть меньше уже выставленных счетов/, "removing below the invoice is refused");
  h.expect((await job()).amountCents === 18498, "the total stays");
  h.expect((await h.db()).jobLines.filter((l) => l.jobId === "j3").length === 2, "both lines stay");

  // raise Labor to 4 (229.98), then removing the small line leaves 180.00 ≥ 150.00 — fine
  await p.getByText("Labor", { exact: true }).locator("visible=true").first().click(); await p.waitForTimeout(400);
  await h.sheet().getByPlaceholder("Кол-во").fill("4");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  h.expect((await job()).amountCents === 22998, `raising is fine (${(await job()).amountCents})`);
  await p.getByText("Drywall patch", { exact: true }).locator("visible=true").first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Удалить позицию" }).click(); await p.waitForTimeout(400);
  h.expect((await job()).amountCents === 18000, "180.00 ≥ 150.00: the line is removed");
  await p.getByRole("button", { name: /Отменить/ }).first().click(); await p.waitForTimeout(500);
  h.expect((await h.db()).jobLines.filter((l) => l.jobId === "j3").length === 2, "«Отменить» puts the line back");
  h.expect((await job()).amountCents === 22998, "and the total");

  // a job from an estimate: no own lines
  await h.go("/job/j1");
  await money();
  h.expect((await p.getByRole("button", { name: "Позиция", exact: true }).count()) === 0, "a job from an estimate has no «＋ Позиция»");
};
