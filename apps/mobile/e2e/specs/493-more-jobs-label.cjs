/**
 * e2e 493 — #2060: the «Работы» counter on «Ещё» says what it counts (it said «К плану: N» for done jobs too).
 * С1 ДАНО запланировать нечего, а выполненная работа ждёт офис («Работа выполнена?»); КОГДА директор открывает «Ещё»;
 *    ТОГДА у «Работы» — «Проверить: N», а не «К плану».
 * С2 ДАНО к этому ещё работа без даты; ТОГДА «Требуют внимания: N» (сумма).
 * Every view; seeded from a page without the app (h.seed).
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.jobs?.length, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const db = raw.db;
  // nothing to schedule: every job without a date is closed (price 0 — no other money reason)
  for (const j of db.jobs) if (j.status === "unscheduled") Object.assign(j, { status: "done", amountCents: 0 });
  // one job done on site, waiting for the office
  const withVisit = db.jobs.find((j) => db.visits.some((v) => v.jobId === j.id));
  h.expect(!!withVisit, "a job with a visit");
  withVisit.status = "in_progress";
  for (const v of db.visits) if (v.jobId === withVisit.id) v.step = "paid";
  await h.seed(KEY, raw);
  await h.seed("octo.role.v1", "director");

  const row = () => p.getByTestId("more-jobs").locator("visible=true").first();
  // С1
  await h.go("/more");
  await row().waitFor({ timeout: 8000 });
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="more-jobs"]')].some((e) => /Проверить: \d+/.test(e.innerText)), null, { timeout: 8000 });
  const t1 = (await row().innerText()).replace(/\s+/g, " ");
  h.expect(/Проверить: [1-9]/.test(t1) && !/К плану/.test(t1), `С1 «Проверить: N», not «К плану»: ${t1}`);
  await h.shot("check");

  // С2: plus a job without a date
  const raw2 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const n1 = Number(/Проверить: (\d+)/.exec(t1)[1]);
  const base = raw2.db.jobs.find((j) => j.id === withVisit.id);
  raw2.db.jobs = [...raw2.db.jobs.filter((j) => j.id !== "j493"), { ...base, id: "j493", title: "Plan 493", status: "unscheduled", amountCents: 0 }];
  await h.seed(KEY, raw2);
  await h.go("/more");
  await row().waitFor({ timeout: 8000 });
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="more-jobs"]')].some((e) => /Требуют внимания: \d+/.test(e.innerText)), null, { timeout: 8000 });
  const t2 = (await row().innerText()).replace(/\s+/g, " ");
  h.expect(new RegExp(`Требуют внимания: ${n1 + 1}`).test(t2), `С2 «Требуют внимания: ${n1 + 1}»: ${t2}`);
};
