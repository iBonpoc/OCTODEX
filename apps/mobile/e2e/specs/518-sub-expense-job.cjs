/**
 * e2e 518 — a subcontractor's expense goes only to a job of a visit of his today (Р-8a, 20261117567000: the server refuses
 * a subcontractor's expense without a job). Without such a visit: the «＋» has no «Создать расход», the form says why and
 * has no «Сохранить»; an inspection of his today does not count. With one: the form offers that job and no «Общий расход». (The job's «Чек» is the office's: a
 * technician's «Деньги» has no costs.) Every view. Waits on what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/");
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db, null, { timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const me = raw.db.me;
  const mine = (v) => v.techId === me || (v.assigneeIds ?? []).includes(me);
  // the page's clock (the run sets it to the company's noon), not this process's
  const now = await p.evaluate(() => Date.now());
  // a subcontractor (the app role is «tech») with no visit today
  raw.db.members = raw.db.members.map((m) => (m.id === me ? { ...m, kind: "sub" } : m));
  raw.db.visits = raw.db.visits.map((v) => (mine(v) ? { ...v, start: new Date(now + 3 * 86400000).toISOString() } : v));
  // …but an inspection of his today (no job: an old phone's in-memory «insp-…»), which does not count
  const job = raw.db.jobs.find((j) => !String(j.id).startsWith("insp-"));
  const insp = raw.db.visits.find((x) => x.jobId !== job.id);
  raw.db.visits = raw.db.visits.map((x) => (x.id === insp.id ? { ...x, jobId: `insp-${x.id}`, start: new Date(now).toISOString(), techId: me, assigneeIds: [me], step: "scheduled", closed: false } : x));
  await h.seed("octo.db.v5", raw);
  await h.seed("octo.role.v1", "tech");

  // the form: why, and nothing to save (an inspection today is not a job)
  await h.go("/expense/new");
  await h.expectText(/Расход — только к работе вашего выезда сегодня/, "the form says why there is no expense");
  h.expect((await p.getByTestId("expense-save").locator("visible=true").count()) === 0, "no «Сохранить» without a job of his today");
  await h.shot("sub-no-job");

  // the home «＋»: no «Создать расход» (left with one item — «Лид» — the «＋» opens it straight away, no sheet)
  // v2 (#2350): «＋» is the header's menu (`visits-create`; its items `fab-…`); with one item it opens it straight away
  const plus = async () => {
    await h.go("/visits");
    await p.getByTestId("visits-create").locator("visible=true").first().getByRole("button").first().click();
    await p.waitForFunction(() => !!document.querySelector('[data-testid="menu-items"]') || location.pathname.startsWith("/lead/new"), null, { timeout: 8000 });
  };
  await plus();
  const menuOpen = (await p.getByTestId("menu-items").locator("visible=true").count()) > 0;
  h.expect(menuOpen ? (await p.getByTestId("fab-expense").locator("visible=true").count()) === 0 : p.url().includes("/lead/new"), "no «Создать расход» in the «＋»");

  // a visit of his today on a job: the form offers that job and no «Общий расход»
  const v = raw.db.visits.find((x) => x.jobId === job.id && x.id !== insp.id) ?? raw.db.visits.find((x) => x.id !== insp.id);
  raw.db.visits = raw.db.visits.map((x) => (x.id === v.id ? { ...x, jobId: job.id, start: new Date(now).toISOString(), techId: me, assigneeIds: [me], step: "scheduled", closed: false } : x));
  await h.seed("octo.db.v5", raw);
  await h.go("/expense/new");
  await p.getByTestId("expense-save").locator("visible=true").first().waitFor({ timeout: 8000 });
  const chips = await p.getByTestId("expense-job").locator("visible=true").first().innerText();
  h.expect(!/Общий расход/.test(chips), `no «Общий расход» for a subcontractor (${chips})`);
  h.expect(chips.includes(job.number || job.title), `the job of his visit is offered (${chips})`);
  await h.shot("sub-job-today");
  // the «＋» of home has «Создать расход» again
  await plus();
  await p.getByTestId("fab-expense").locator("visible=true").first().waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("fab-expense").locator("visible=true").first().innerText()).includes("Создать расход"), "«Создать расход» with a job of his today");
  await h.seed("octo.role.v1", "director");
};
