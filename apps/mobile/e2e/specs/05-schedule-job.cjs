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

exports.run = async (h) => {
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.sign("Linda Alvarez");
  await countersign(h, "e6");
  let db = await h.db();
  const job = db.jobs.find((j) => j.estimateId === "e6");
  h.expect(job && job.status === "unscheduled" && !db.visits.some((v) => v.jobId === job.id), "no automatic visit");
  await h.go(`/job/schedule?jobId=${job.id}`);
  await h.page.getByRole("radiogroup").first().getByRole("radio").nth(3).click();
  await h.page.getByRole("radio", { name: "Ivan Sokolov" }).click();
  await h.page.getByRole("button", { name: "Запланировать", exact: true }).last().click(); await h.page.waitForTimeout(600);
  db = await h.db();
  const v = db.visits.find((x) => x.jobId === job.id);
  h.expect(v && v.techId === "m-ivan", "visit with the tech");
  h.expect(db.jobs.find((j) => j.id === job.id).status === "scheduled", "job scheduled");
  await h.go("/plan");
  for (let i = 0; i < 3; i++) await h.page.getByRole("button", { name: "Вперёд" }).last().click();
  await h.page.waitForTimeout(400);
  await h.expectText(/Carpet, railing, bulb, haul-away/, "on the plan that day");
};
