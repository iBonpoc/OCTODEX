/**
 * #2015 (spec 38 §12, story map S37): «⋯ → Отменить работу…». The director cancels a job with a reason: the visit not started goes
 * with it, the job leaves «Ждёт даты» / the live list and appears in «Отменённые» with the reason; its own screen says «Отменена» and why.
 * A job with a payment is not cancelled: the item is dim and says «сначала возврат» (no dead end). Server side — db T383–T390.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const pick = async (pred, what) => {
    await p.waitForFunction((src) => {
      const db = JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db;
      return !!db && new Function("db", `return (${src})(db)`)(db);
    }, pred.toString());
    h.expect(true, what);
    return h.db();
  };
  const openMenu = async () => {
    await tid("job-more").getByRole("button").click();
    await tid("menu-items").waitFor({ timeout: 3000 });
  };

  // 1) a job with money taken: the item is there, dim, and the click says why (nothing is cancelled)
  await h.go("/jobs");
  const seed = await h.db();
  const paid = seed.jobs.find((j) => seed.invoices.some((i) => i.jobId === j.id && i.paidCents > 0));
  h.expect(!!paid, "the demo has a job with a payment");
  await h.go(`/job/${paid.id}`);
  await openMenu();
  await tid("job-act-cancel").click();
  await p.getByText("сначала оформите возврат").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect((await h.db()).jobs.some((j) => j.id === paid.id), "a job with a payment stays");

  // 2) j6: an open visit, no money — cancelled with a reason
  await h.go("/job/j6");
  await openMenu();
  await tid("job-act-cancel").click();
  await h.sheet().getByTestId("job-cancel-reason").locator("input, textarea").fill("Client changed his mind");
  await h.sheet().getByTestId("job-cancel-confirm").getByRole("button").click();
  const db = await pick((d) => (d.cancelledJobs ?? []).some((j) => j.id === "j6" && j.cancelReason === "Client changed his mind"), "j6 is cancelled with its reason");
  h.expect(!db.jobs.some((j) => j.id === "j6"), "it left the live jobs");
  h.expect(!db.visits.some((v) => v.jobId === "j6"), "its visit not started went with it");
  await tid("job-cancelled-status").waitFor({ timeout: 5000 });
  h.expect(/Client changed his mind/.test(await tid("job-cancelled-reason").innerText()), "its screen says why");

  // 3) the list: the lane «Отменённые» holds it, «Все» does not
  await h.go("/jobs");
  await tid("filter-lane-cancelled").click();
  await p.getByText("Panel upgrade 200A").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(true, "the lane «Отменённые» lists the cancelled job");
  await tid("filter-lane-all").click();
  h.expect((await p.getByText("Panel upgrade 200A").locator("visible=true").count()) === 0, "«Все» does not");
  await h.shot("cancelled");
};
