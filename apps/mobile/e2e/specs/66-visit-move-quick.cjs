/**
 * Wave 3c: moving and cancelling a job visit in the visit form (13 §3.6, 17-job §7.4, 15-flows §1.3):
 * - «Перенести» → «Завтра утром (9:00 AM)» → the visit is tomorrow 9:00 of the company (not of the phone);
 * - the quick dates are only in the move form, not in a new booking;
 * - «Отменить выезд» with a reason → the job's «История» shows the cancelled visit with the reason.
 */
const { addDays, dayKey, minuteOf, todayKey, atMinute } = require("../companyTime.cjs");
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

  // a new booking has no quick dates
  await h.go(`/job/schedule?jobId=${job.id}`);
  h.expect(!/Завтра утром/.test(await h.text()), "no quick dates in a new booking");

  await h.go("/visit/e2e66");
  await p.getByRole("button", { name: "Перенести", exact: true }).first().click();
  await p.waitForTimeout(400);
  await h.expectText(/Завтра утром \(9:00 AM\)[\s\S]*В понедельник \(9:00 AM\)/, "quick dates in the move form");
  await h.shot("move");
  await h.sheet().getByRole("button", { name: "Завтра утром (9:00 AM)" }).click();
  await h.sheet().getByRole("button", { name: "Перенести", exact: true }).last().click();
  await p.waitForTimeout(600);
  let v = (await h.db()).visits.find((x) => x.id === "e2e66");
  h.expect(dayKey(v.start) === addDays(todayKey(), 1) && minuteOf(v.start) === 9 * 60, `moved to tomorrow 9:00 of the company: ${v.start}`);

  // cancel with a reason → the job's history keeps it with the reason
  await h.go("/visit/e2e66");
  await p.getByRole("button", { name: "Отменить выезд", exact: true }).first().click();
  await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Клиент отменил" }).click();
  await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().click();
  await p.waitForTimeout(600);
  await h.go(`/job/${job.id}`);
  await p.getByRole("tab", { name: "История", exact: true }).locator("visible=true").click();
  await h.expectText(/Выезд отменён[\s\S]*Клиент отменил/, "the cancelled visit with its reason in the job's history");
  const d2 = await h.db();
  h.expect(d2.jobs.find((j) => j.id === job.id).status === "unscheduled", "the last visit cancelled → the job waits for a date (S9a)");
};
