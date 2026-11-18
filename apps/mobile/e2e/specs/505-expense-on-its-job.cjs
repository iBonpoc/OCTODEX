/**
 * e2e 505 — an expense goes on the job it was entered from, with its own vendor and its receipt's day (#2008).
 * С1: from job A (no visit today) «Расход по чеку» → the form starts on job A; saved — the expense is on job A and the
 *     job's costs show it.
 * С2: «Где купили» — nothing chosen for the person; saved without it — its error, nothing saved; a vendor typed in the
 *     search is taken by «Указать „…“» as text — no supplier is made.
 * С3: the receipt's day — yesterday picked in the calendar; days after today cannot be picked.
 * С4: the job list — the office sees every job; a technician only the jobs he is on.
 * Every view (h.layout). Waits on what it checks; the days come from the page's own clock (companyTime.cjs).
 */
const { dayKey, addDays } = require("../companyTime.cjs");
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.seed("octo.role.v1", "director");
  const db0 = await (async () => { await h.go("/today"); return h.db(); })();
  const today = dayKey(await p.evaluate(() => Date.now()));
  const yesterday = addDays(today, -1);
  // job A: a job with no visit of today (the old form put the expense on today's visit's job)
  const todays = new Set(db0.visits.filter((v) => dayKey(v.start) === today).map((v) => v.jobId));
  const jobA = db0.jobs.find((j) => !todays.has(j.id) && j.number) ?? db0.jobs[0];
  const suppliersBefore = (db0.suppliers ?? []).length;
  const expensesBefore = (db0.expenses ?? []).length;

  // С1: from the job's screen
  await h.go(`/job/${jobA.id}`);
  await p.getByTestId("job-tab-money").locator("visible=true").click();
  await p.getByRole("button", { name: "Расход по чеку" }).locator("visible=true").first().click();
  await p.waitForURL((u) => /\/expense\/new/.test(u.pathname) && u.searchParams.get("jobId") === jobA.id, { timeout: 8000 });
  await vis("expense-job").waitFor({ timeout: 8000 });
  const jt = await vis("expense-job").innerText();
  h.expect(jt.includes(jobA.number), `the form starts on job A (${jt})`);

  // С2: nothing chosen for the person
  const vt = await vis("field-vendor").innerText();
  h.expect(!/Home Depot/.test(vt), `no vendor is chosen by itself (${vt})`);
  await vis("field-amount").locator("input, textarea").first().fill("23.45");
  await vis("expense-save").click();
  await vis("field-vendor-error").waitFor({ timeout: 4000 });
  h.expect((((await h.db()).expenses ?? []).length) === expensesBefore, "no vendor — nothing saved");
  // a vendor of its own, typed in the search
  await vis("field-vendor-button").click();
  await vis("expense-vendor-picker").waitFor({ timeout: 5000 });
  await vis("expense-vendor-picker-search").locator("input").fill("Corner Hardware 505");
  await vis("expense-vendor-picker-create").getByRole("button").first().click();
  await p.getByTestId("expense-vendor-picker").locator("visible=true").waitFor({ state: "detached", timeout: 5000 });
  h.expect(/Corner Hardware 505/.test(await vis("field-vendor").innerText()), "the typed vendor is chosen");
  h.expect((await vis("field-vendor-error").count()) === 0, "its error is gone");
  await h.shot("vendor-own");

  // С3: the receipt's day — yesterday; tomorrow cannot be picked
  await vis("expense-date-button").click();
  await vis("expense-date-calendar").waitFor({ timeout: 5000 });
  const label = (k) => p.evaluate((x) => new Date(`${x}T12:00:00Z`).toLocaleDateString("ru-RU", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }), k);
  const tomorrowBtn = vis("expense-date-calendar").getByRole("button", { name: await label(addDays(today, 1)), exact: true });
  if (await tomorrowBtn.count()) h.expect(await tomorrowBtn.isDisabled(), "a day after today cannot be picked");
  // yesterday may be last month (today the 1st on the grid's first day): go back a month when it is not on the grid
  const yBtn = vis("expense-date-calendar").getByRole("button", { name: await label(yesterday), exact: true });
  if ((await yBtn.count()) === 0) await vis("expense-date-calendar").getByRole("button", { name: "Назад" }).first().click();
  await yBtn.click();
  await vis("expense-date-calendar").waitFor({ state: "detached", timeout: 5000 });
  await h.shot("date-yesterday");

  await vis("expense-save").click();
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.expenses ?? []).length === n + 1, expensesBefore, { timeout: 8000 });
  const db1 = await h.db();
  const x = db1.expenses.find((e) => e.amountCents === 2345);
  h.expect(x?.jobId === jobA.id, `С1: the expense is on job A (${x?.jobId})`);
  h.expect(x?.vendor === "Corner Hardware 505", "С2: the typed vendor is kept as text");
  h.expect((db1.suppliers ?? []).length === suppliersBefore, "С2: no supplier is made by it");
  h.expect(x?.date === yesterday, `С3: the receipt's day is yesterday (${x?.date} vs ${yesterday})`);
  // (the day sent to the server with the expense: unit test/expenseReceipt «#2008 С3»)

  // the job's costs show it
  await h.go(`/job/${jobA.id}`);
  await p.getByTestId("job-tab-money").locator("visible=true").click();
  await p.getByText("Corner Hardware 505").locator("visible=true").first().waitFor({ timeout: 8000 });

  // С4: a technician sees only his jobs in the list; the office every job
  await h.go("/expense/new");
  await vis("expense-job-button").click();
  await vis("expense-job-picker").waitFor({ timeout: 5000 });
  const missing = [];
  for (const j of db1.jobs) if ((await p.getByTestId(`expense-job-picker-${j.id}`).locator("visible=true").count()) !== 1) missing.push(j.number ?? j.id);
  await pressEscUntilClosed(p, p.getByTestId("expense-job-picker").locator("visible=true").first());
  h.expect(missing.length === 0, `the office sees every job (missing: ${missing.join(", ")})`);
  await h.seed("octo.role.v1", "tech");
  await h.go("/expense/new");
  await vis("expense-job-button").click();
  await vis("expense-job-picker").waitFor({ timeout: 5000 });
  const me = db1.me;
  const mine = new Set(db1.visits.filter((v) => (v.assigneeIds ?? [v.techId]).includes(me) && v.jobId).map((v) => v.jobId));
  for (const j of db1.jobs) {
    const row = p.getByTestId(`expense-job-picker-${j.id}`).locator("visible=true");
    h.expect((await row.count()) === (mine.has(j.id) ? 1 : 0), `tech: job ${j.number ?? j.id} ${mine.has(j.id) ? "is" : "is not"} offered`);
  }
  await h.shot("tech-jobs");

  // the showcase (DS А3, CLAUDE.md: a DS change shows in it): «Указать „…“» takes the typed value
  await h.seed("octo.role.v1", "director");
  await h.go("/settings/design-system/selectors");
  await vis("showcase-picker-own-button").click();
  await vis("showcase-picker-own-sheet").waitFor({ timeout: 5000 });
  await vis("showcase-picker-own-sheet-search").locator("input").fill("My Shop");
  await vis("showcase-picker-own-sheet-create").getByRole("button").first().click();
  await p.getByTestId("showcase-picker-own-sheet").locator("visible=true").waitFor({ state: "detached", timeout: 5000 });
  h.expect(/My Shop/.test(await vis("showcase-picker-own").innerText()), "the showcase: the typed value is chosen");
};
