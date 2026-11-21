/**
 * #2075 (roles decision В9; audit of roles #2064): only the office bills. On a signed estimate (e5, its job j1) the
 * director gets «Выставить остаток» and «Счёт на этап»; sales see the same contract statement without them. The lines
 * and the tax of a job make its contract total: sales see the lines of a job without an estimate, add none and get no
 * tax switch. The server's side — db T414–T416.
 */
exports.run = async (h) => {
  const p = h.page;
  const statement = () => p.getByTestId("statement-invoiced").locator("visible=true").first().waitFor();
  // v2 (#2350): a job's lines (JobLinesBlock) are on its «Обзор» section (`job-screen-sections-overview`), the statement under «Счета»
  const money = async () => {
    await p.getByTestId("job-screen-sections-overview").locator("visible=true").first().click();
    await p.getByText(/Позиций нет|Позиции/).locator("visible=true").first().waitFor();
  };

  // the director: the statement of a signed estimate offers both invoices, a job without an estimate offers lines
  await h.seed("octo.role.v1", "director");
  await h.go("/estimate/e5");
  await statement();
  await p.getByTestId("statement-bill-balance").locator("visible=true").first().waitFor();
  h.expect((await p.getByTestId("statement-progress").locator("visible=true").count()) > 0, "the director: «Счёт на этап» is there");
  await h.go("/job/j3");
  await money();
  await p.getByTestId("job-lines-add").locator("visible=true").first().waitFor();
  h.expect(true, "the director: «Позиция» on a job without an estimate");

  // sales: the same statement without the invoice buttons; the lines without «Позиция» and without the tax switch
  await h.seed("octo.role.v1", "sales");
  await h.go("/estimate/e5");
  await statement();
  h.expect(true, "sales: the contract statement is there");
  h.expect((await p.getByTestId("statement-bill-balance").count()) === 0, "sales: no «Выставить остаток»");
  h.expect((await p.getByTestId("statement-progress").count()) === 0, "sales: no «Счёт на этап»");
  await h.shot("sales-statement");
  await h.go("/job/j3");
  await money();
  await h.expectText(/Позиций нет/, "sales: the lines block is there");
  h.expect((await p.getByTestId("job-lines-add").count()) === 0, "sales: no «Позиция»");
  h.expect((await p.getByRole("switch", { name: "Налог с продаж" }).count()) === 0, "sales: no tax switch");
  await h.shot("sales-lines");
  h.expect(!(await h.db()).invoices.some((i) => i.jobId === "j1" && i.kind === "final"), "nothing was billed");
  await h.seed("octo.role.v1", "director");
};
