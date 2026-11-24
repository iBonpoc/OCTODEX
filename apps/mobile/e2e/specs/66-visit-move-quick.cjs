/**
 * Wave 3c: moving and cancelling a job visit in the visit form (13 §3.6, 17-job §7.4, 15-flows §1.3):
 * - «Перенести» → the next working day, «Начало» 9:00 AM → the visit is tomorrow 9:00 of the company (not of the phone);
 * - #2208: the quick dates of the move form are now the people's nearest free windows (`vf-windows`), one row of chips;
 * - «Отменить выезд» with a reason → the job's «История» shows the cancelled visit with the reason.
 */
const { addDays, dayKey, minuteOf, todayKey, atMinute, weekday } = require("../companyTime.cjs");
const { visitAct } = require("../visitScreen.cjs");
const { pickVisitDay, pickVisitStart } = require("../visitForm.cjs");
const { objSection } = require("../objectScreen.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  const job = db.jobs.find((j) => j.id === "j2");
  await p.evaluate((v) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [...raw.db.visits.filter((x) => x.jobId !== v.jobId), v];
    raw.db.jobs = raw.db.jobs.map((j) => (j.id === v.jobId ? { ...j, status: "scheduled" } : j));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, { id: "e2e66", jobId: job.id, propertyId: job.propertyId, kind: "install", techId: "m-ivan", assigneeIds: ["m-ivan"], start: atMinute(addDays(todayKey(), 2), 14 * 60), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 });
  await setRole(h, "director");

  await h.go("/visit/e2e66");
  await p.getByRole("button", { name: "Перенести", exact: true }).first().click();
  await p.waitForTimeout(400);
  await h.sheet().getByTestId("vf-windows").first().waitFor({ timeout: 5000 });
  h.expect(!/Завтра утром/.test(await h.sheet().innerText()), "one row of quick choices: the free windows, no quick dates (#2208)");
  await h.shot("move");
  // the company's next working day (the demo's Sunday is off: no free start that day)
  let ahead = 1;
  while (weekday(addDays(todayKey(), ahead)) === 0) ahead++;
  await pickVisitDay(p, ahead, h.sheet());
  await pickVisitStart(p, 9 * 60, h.sheet());
  await h.sheet().getByRole("button", { name: "Перенести", exact: true }).last().click();
  await p.waitForTimeout(600);
  let v = (await h.db()).visits.find((x) => x.id === "e2e66");
  h.expect(dayKey(v.start) === addDays(todayKey(), ahead) && minuteOf(v.start) === 9 * 60, `moved to the next working day 9:00 of the company: ${v.start}`);

  // cancel with a reason → the job's history keeps it with the reason
  await h.go("/visit/e2e66");
  // v2: «Отменить выезд» is the red item of the header's «⋯»
  await visitAct(p, "visit-act-cancel");
  await p.waitForTimeout(400);
  await h.sheet().getByRole("radio", { name: "Клиент отменил" }).click(); // the reason — a row with a check (spec 56 wave 5б)
  await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().click();
  await p.waitForTimeout(600);
  await h.go(`/job/${job.id}`);
  // v2: the job's history is its section «Заметки»
  await objSection(p, "job-screen", "notes");
  await h.expectText(/Выезд отменён[\s\S]*Клиент отменил/, "the cancelled visit with its reason in the job's history");
  const d2 = await h.db();
  h.expect(d2.jobs.find((j) => j.id === job.id).status === "unscheduled", "the last visit cancelled → the job waits for a date (S9a)");
};
