/**
 * Wave 3c «Работа выполнена» (S10; docs/specs/17-job.md §4, 13 §3.4.1, 15-flows §1.1 шаг 22, §1.15):
 * - a job going with every visit over → «Работа выполнена?» in the office's queue and on the job;
 * - «Нужен ещё выезд» (in «⋯») → a second visit; the job stays «in progress» (failed before: it went back to «scheduled»);
 * - with an open visit «Завершить работу» (in «⋯») says why and closes nothing;
 * - «Да, выполнена» → done → «Создать счёт на остаток» (only when something is left to invoice);
 * - the technician is never asked.
 */
const { workdayOffset } = require("../companyTime.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

const { pickVisitDay, pickVisitStart } = require("../visitForm.cjs");
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  let db = await h.db();
  const job = db.jobs.find((j) => j.id === "j2");
  // j2 is going, its only visit paid; no invoice yet, so the whole contract is left to invoice
  await p.evaluate(([jid, pid]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.jobs = raw.db.jobs.map((j) => (j.id === jid ? { ...j, status: "in_progress", amountCents: 48000 } : j));
    raw.db.invoices = raw.db.invoices.filter((i) => i.jobId !== jid);
    raw.db.visits = [...raw.db.visits.filter((v) => v.jobId !== jid), { id: "e2e65", jobId: jid, propertyId: pid, kind: "install", techId: "m-ivan", assigneeIds: ["m-ivan"], start: new Date(Date.now() - 5 * 3600_000).toISOString(), durationMin: 60, step: "paid", scope: [], checklist: [], photos: [], amountDueCents: 0 }];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [job.id, job.propertyId]);

  // the technician: nothing to answer
  await setRole(h, "tech");
  await h.go(`/job/${job.id}`);
  h.expect((await p.getByTestId("job-next-close").count()) === 0, "the technician is not asked");

  // the office: on the job
  await setRole(h, "director");
  await h.go(`/job/${job.id}`);
  // the next step of the card (LAYOUT-RULES §3): «Да, выполнена», its reason under it
  await p.getByTestId("job-next-close").locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.expectText(/Все выезды закончены/, "the office is asked on the job");
  await h.shot("ask");

  // «Нужен ещё выезд» (in «⋯») → the visit form → the job stays in progress
  const more = async (id) => {
    await p.getByTestId("job-more").locator("visible=true").first().getByRole("button").click();
    await p.getByTestId(id).locator("visible=true").first().click();
  };
  await more("job-act-more");
  await p.waitForTimeout(500);
  h.expect(new URL(p.url()).pathname === "/job/schedule", `«Нужен ещё выезд» → the visit form (${p.url()})`);
  await pickVisitDay(p, workdayOffset(2)); // the day — DateField (spec 56 wave 5б)
  await p.getByRole("option", { name: "Ivan Sokolov" }).last().click();
  await pickVisitStart(p, 13 * 60); // «Начало ⌄» — 1:00 PM
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click();
  await p.waitForTimeout(600);
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  h.expect(db.jobs.find((j) => j.id === job.id).status === "in_progress", "a second visit keeps the job in progress");

  // an open visit: «Завершить работу» explains, closes nothing; no question while a visit is open
  await h.go(`/job/${job.id}`);
  h.expect((await p.getByTestId("job-next-close").count()) === 0, "no question while a visit is open");
  await more("job-act-complete");
  await h.expectText(/Сначала завершите или отмените открытые выезды/, "why it is not closed");
  db = await h.db();
  h.expect(db.jobs.find((j) => j.id === job.id).status === "in_progress", "not closed with an open visit");

  // the second visit is over → the question in the queue (Разбор) → «Да, выполнена» → invoice the balance
  await p.evaluate((jid) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = raw.db.visits.map((v) => (v.jobId === jid ? { ...v, step: "paid" } : v));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, job.id);
  await h.go("/triage");
  await h.expectText(/работа выполнена\?/, "«Работа выполнена?» in the office's queue (Разбор)");
  await h.go(`/job/${job.id}`);
  await h.click("Да, выполнена");
  await p.waitForTimeout(400);
  db = await h.db();
  h.expect(db.jobs.find((j) => j.id === job.id).status === "done", "«Да, выполнена» → done");
  await h.expectText(/Создать счёт на остаток \$480/, "offer to invoice the balance");
  await h.shot("done");
  await p.getByRole("button", { name: /^Создать счёт на остаток/ }).last().dblclick();
  await p.waitForTimeout(400);
  db = await h.db();
  h.expect(db.invoices.filter((i) => i.jobId === job.id).length === 1, "a double tap makes one balance invoice");
  const inv = db.invoices.find((i) => i.jobId === job.id);
  h.expect(inv && inv.kind === "final" && inv.totalCents === 48000, `balance invoice: ${JSON.stringify(inv)}`);
  await h.go(`/job/${job.id}`);
  h.expect(!/Создать счёт на остаток/.test(await h.text()), "nothing left to invoice → no offer");
  // a closed job takes no new visit
  h.expect(!/Ещё один выезд/.test(await h.text()), "no «Ещё один выезд» on a closed job");
  await h.go(`/job/schedule?jobId=${job.id}`);
  await h.expectText(/Работа закрыта — новый выезд не ставится/, "the visit form refuses a closed job");
};
