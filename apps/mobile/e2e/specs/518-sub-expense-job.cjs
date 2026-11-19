/**
 * e2e 518 — a subcontractor's expense goes only to a job of a visit of his today (Р-8a, 20261117567000: the server refuses
 * a subcontractor's expense without a job). Without such a visit: the «＋» has no «Создать расход», the form says why and
 * has no «Сохранить». With one: the form offers that job and no «Общий расход». (The job's «Чек» is the office's: a
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
  await h.seed("octo.db.v5", raw);
  await h.seed("octo.role.v1", "tech");

  // the form: why, and nothing to save
  await h.go("/expense/new");
  await h.expectText(/Расход субподрядчика — только к работе вашего выезда сегодня/, "the form says why there is no expense");
  h.expect((await p.getByTestId("expense-save").locator("visible=true").count()) === 0, "no «Сохранить» without a job of his today");
  await h.shot("sub-no-job");

  // the home «＋»: no «Создать расход» (left with one item — «Лид» — the «＋» opens it straight away, no sheet)
  await h.go("/visits");
  if (h.layout.width >= 820) await p.getByTestId("side-nav").getByRole("button", { name: "Создать", exact: true }).click();
  else await p.getByTestId("fab").locator("visible=true").click();
  await p.waitForFunction(() => /Быстрые действия/.test(document.body.innerText) || location.pathname.startsWith("/lead/new"), null, { timeout: 8000 });
  const sheetOpen = await p.evaluate(() => /Быстрые действия/.test(document.body.innerText));
  h.expect(sheetOpen ? !(await h.sheet().innerText()).includes("Создать расход") : p.url().includes("/lead/new"), "no «Создать расход» in the «＋»");

  // a visit of his today on a job: the form offers that job and no «Общий расход»
  const job = raw.db.jobs.find((j) => !String(j.id).startsWith("insp-"));
  const v = raw.db.visits.find((x) => x.jobId === job.id) ?? raw.db.visits[0];
  raw.db.visits = raw.db.visits.map((x) => (x.id === v.id ? { ...x, jobId: job.id, start: new Date(now).toISOString(), techId: me, assigneeIds: [me], step: "scheduled", closed: false } : x));
  await h.seed("octo.db.v5", raw);
  await h.go("/expense/new");
  await p.getByTestId("expense-save").locator("visible=true").first().waitFor({ timeout: 8000 });
  const chips = await p.getByTestId("expense-job").locator("visible=true").first().innerText();
  h.expect(!/Общий расход/.test(chips), `no «Общий расход» for a subcontractor (${chips})`);
  h.expect(chips.includes(job.number || job.title), `the job of his visit is offered (${chips})`);
  await h.shot("sub-job-today");
  // the «＋» of home has «Создать расход» again
  await h.go("/visits");
  if (h.layout.width >= 820) await p.getByTestId("side-nav").getByRole("button", { name: "Создать", exact: true }).click();
  else await p.getByTestId("fab").locator("visible=true").click();
  await h.expectText(/Быстрые действия/, "the «＋» sheet is open");
  h.expect((await h.sheet().innerText()).includes("Создать расход"), "«Создать расход» with a job of his today");
  await h.seed("octo.role.v1", "director");
};
