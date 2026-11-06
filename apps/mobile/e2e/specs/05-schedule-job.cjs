/** Signed estimate → job waits for a date (not on the plan) → schedule day +3 with a tech → on the plan. */
/** S8b (docs/specs/07 §2.2 А, founder 05.11): an employee signs the contract for the company on the estimate screen. */
async function countersign(h, estimateId) {
  await h.go(`/estimate/${estimateId}`);
  const pad = h.page.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded(); await h.page.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await h.page.mouse.move(bb.x + 30, bb.y + 90); await h.page.mouse.down();
  for (let i = 0; i < 20; i++) await h.page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await h.page.mouse.up();
  await h.page.getByRole("button", { name: "Подписать договор" }).last().click(); await h.page.waitForTimeout(700);
}

// a working day (П4a: by default Mon–Sat, Sunday off = no slots); the form counts days on the company's calendar (П4b)
const { minuteOf, workdayOffset } = require("../companyTime.cjs");

exports.run = async (h) => {
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.sign("Linda Alvarez");
  await countersign(h, "e6");
  let db = await h.db();
  const job = db.jobs.find((j) => j.estimateId === "e6");
  h.expect(job && job.status === "unscheduled" && !db.visits.some((v) => v.jobId === job.id), "no automatic visit");
  await h.go(`/job/schedule?jobId=${job.id}`);
  const dayOffset = workdayOffset(3);
  await h.page.getByRole("radiogroup").first().getByRole("radio").nth(dayOffset).click();
  // the visit form (docs/specs/03 §7.1): person, a free slot, length, note
  await h.page.getByRole("button", { name: "Ivan Sokolov" }).last().click();
  await h.page.getByRole("radio", { name: /^1:00/ }).last().click();
  await h.page.getByRole("button", { name: "Длительность +15" }).last().click();
  await h.page.getByPlaceholder(/Собака во дворе/).last().fill("Gate code at the office");
  await h.page.getByRole("button", { name: "Запланировать", exact: true }).last().click(); await h.page.waitForTimeout(600);
  await h.expectText(/Сообщить клиенту\?/, "notify sheet after scheduling");
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await h.page.waitForTimeout(400);
  db = await h.db();
  const v = db.visits.find((x) => x.jobId === job.id);
  h.expect(v && v.techId === "m-ivan", "visit with the tech");
  h.expect(minuteOf(v.start) === 13 * 60, `the picked slot, 1:00 PM of the company: ${v.start}`);
  h.expect(v.durationMin === 135, `length of the job (120 + 15): ${v.durationMin}`);
  h.expect(v.note === "Gate code at the office" && !v.scope.includes("Gate code at the office"), "note for the tech: its own field (wave П3b)");
  h.expect(!v.customerNotifiedAt, "«Не сейчас»: the client is not marked as told");
  h.expect(db.jobs.find((j) => j.id === job.id).status === "scheduled", "job scheduled");
  await h.go(`/visit/${v.id}`);
  await h.expectText(/Заметка мастеру[\s\S]*Gate code at the office/, "the note is on the visit card");
  await h.go("/plan");
  for (let i = 0; i < dayOffset; i++) await h.page.getByRole("button", { name: "Вперёд" }).last().click();
  await h.page.waitForTimeout(400);
  await h.expectText(/Carpet, railing, bulb, haul-away/, "on the plan that day");
};
