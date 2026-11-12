/**
 * #865 (audit X-01..X-03): a contract's invoices on the phone — the tax inside each invoice, Σ = the contract's tax, never
 * more than the contract. A job of its own lines (test prices): $400 labor + $100 taxable part, 10% → contract $510 with $10
 * tax. «Счёт на этап» 50% = $255 → $250 + $5 tax; «Выставить остаток» $255 → the rest of the tax $5; then nothing left to
 * bill. Revenue (the report's subtotal) is $500, without the tax. The server splits the same (t41_invoice_contract, db T196).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/job/j3");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  h.expect(raw?.db?.jobs?.some((j) => j.id === "j3"), "demo has job j3");
  const line = (id, position, name, quantity, unitPriceCents, taxable) => ({ id, jobId: "j3", position, name, quantity, unitPriceCents, taxable, totalCents: Number(quantity) * unitPriceCents });
  raw.db.jobLines = [...(raw.db.jobLines ?? []).filter((l) => l.jobId !== "j3"), line("e2e-283-1", 0, "Labor", "2", 20000, false), line("e2e-283-2", 1, "Part", "1", 10000, true)];
  raw.db.jobs = raw.db.jobs.map((j) => (j.id === "j3" ? { ...j, amountCents: 51000, taxEnabled: true, taxRateBps: 1000, estimateId: undefined } : j));
  raw.db.invoices = raw.db.invoices.filter((i) => i.jobId !== "j3");
  await h.seed("octo.db.v5", raw);
  await h.go("/job/j3");
  await p.getByRole("tab", { name: "Деньги", exact: true }).locator("visible=true").click();
  await h.expectText(/Договор \| \$510/, "the contract with its tax");

  await p.getByRole("button", { name: "Счёт на этап" }).click();
  await h.sheet().getByRole("button", { name: "Выставить счёт" }).click();
  await h.expectText(/Выставлено \| \$255/, "a stage invoice of 50%");
  // the store writes its copy a moment after the screen shows it: wait for the invoices themselves
  const pick = async (n) => {
    let mine = [];
    for (let k = 0; k < 25; k++) {
      mine = ((await h.db())?.invoices ?? []).filter((i) => i.jobId === "j3");
      if (mine.length >= n) break;
      await p.waitForTimeout(200);
    }
    return mine;
  };
  let mine = await pick(1);
  h.expect(mine.length === 1 && mine[0].totalCents === 25500 && mine[0].taxCents === 500 && mine[0].subtotalCents === 25000, `the stage invoice: $250 + $5 tax (${JSON.stringify(mine)})`);

  await p.getByRole("button", { name: /Выставить остаток \$255/ }).click();
  await h.expectText(/Выставлено \| \$510/, "the rest billed");
  mine = await pick(2);
  const fin = mine.find((i) => i.kind === "final");
  h.expect(fin && fin.totalCents === 25500 && fin.taxCents === 500, `the balance takes the rest of the tax (${JSON.stringify(fin)})`);
  h.expect(mine.reduce((s, i) => s + i.taxCents, 0) === 1000 && mine.reduce((s, i) => s + i.subtotalCents, 0) === 50000, "Σ tax = $10, revenue = $500");
  // nothing left to bill: no button bills above the contract
  h.expect((await p.getByRole("button", { name: /Выставить остаток|Счёт на этап/ }).count()) === 0, "nothing left to bill");
  await h.shot("billed");
};
