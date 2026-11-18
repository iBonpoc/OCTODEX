/**
 * #2050 (spec 38 §12.1, story map S37): a cancelled job is brought back. The director cancels j6 with a reason, opens its card
 * («Отменена»), presses «Вернуть работу» and confirms in the sheet: the job leaves «Отменённые» and is in the live list waiting for
 * a date; its reason is gone, its cancelled visit stays cancelled. The server's side — db T403–T406.
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
  await h.go("/job/j6");
  await tid("job-more").getByRole("button").click();
  await tid("menu-items").waitFor({ timeout: 3000 });
  await tid("job-act-cancel").click();
  await h.sheet().getByTestId("job-cancel-reason").locator("input, textarea").fill("Client changed his mind");
  await h.sheet().getByTestId("job-cancel-confirm").getByRole("button").click();
  await pick((d) => (d.cancelledJobs ?? []).some((j) => j.id === "j6"), "j6 is cancelled");
  await tid("job-cancelled-status").waitFor({ timeout: 5000 });

  // the way back: the button, the sheet with its words, the confirmation
  await tid("job-restore").getByRole("button").click();
  await h.sheet().getByTestId("job-restore-confirm").getByRole("button").click();
  const db = await pick((d) => d.jobs.some((j) => j.id === "j6" && j.status === "unscheduled"), "j6 is back, waiting for a date");
  const job = db.jobs.find((j) => j.id === "j6");
  h.expect(!job.cancelReason && !job.cancelledAt, "no reason and no time of a cancel on it");
  h.expect(!(db.cancelledJobs ?? []).some((j) => j.id === "j6"), "it left «Отменённые»");
  h.expect(!db.visits.some((v) => v.jobId === "j6"), "its cancelled visit did not come back");
  await tid("job-main").waitFor({ state: "detached" }).catch(() => {});
  await tid("job-more").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("job-cancelled-status").locator("visible=true").count()) === 0, "its screen is the live job's again");
  await h.shot("restored");
};
