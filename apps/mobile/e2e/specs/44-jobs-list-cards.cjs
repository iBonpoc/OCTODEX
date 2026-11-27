/**
 * «Работы» — rows of one group (lists B #2992; was the list cards of step 10а), every view (3 widths × 2 themes).
 * - office: client name, job title, amount; the next visit's people in the line; the status word only on «Все»;
 * - tech: no amount anywhere (spec 06 §7.6) — on the right «Позвонить» instead;
 * - the row opens the job. By testID `job-row-<id>` (rule 19).
 */

exports.run = async (h) => {
  const p = h.page;
  await h.go("/jobs");
  const db = await h.db();
  const cardOf = (j) => p.getByTestId(`job-row-${j.id}`).locator("visible=true").first();
  const nameOf = (j) => db.customers.find((c) => c.id === db.properties.find((x) => x.id === j.propertyId)?.customerId)?.name;

  // a scheduled job (the filter «scheduled», by its key)
  const job = db.jobs.find((j) => j.status === "scheduled");
  h.expect(job, "demo has a scheduled job");
  await p.getByTestId("filter-lane-scheduled").locator("visible=true").first().click();
  await p.waitForTimeout(300);
  const card = cardOf(job);
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  for (const s of [nameOf(job), job.title]) h.expect(txt.includes(s), `job row shows «${s}»: ${txt.slice(0, 200)}`);
  h.expect(!txt.includes("Запланирована"), "the chip «Запланированы» is on: the row does not repeat the status");
  h.expect(/\$[\d,]+/.test(txt), "office sees the amount");
  const visit = db.visits.filter((v) => v.jobId === job.id).sort((a, b) => a.start.localeCompare(b.start)).find((v) => v.step !== "paid" && v.step !== "done");
  // everyone assigned to the next visit (assigneeIds, else techId)
  const ids = visit ? (visit.assigneeIds?.length ? visit.assigneeIds : visit.techId ? [visit.techId] : []) : [];
  for (const id of ids) {
    const m = db.members.find((x) => x.id === id);
    if (m) h.expect(txt.includes(m.name.split(" ")[0]), `assigned «${m.name}» in the row`);
  }
  // «Все»: now each row says its status in words
  await p.getByTestId("filter-lane-all").locator("visible=true").first().click();
  await cardOf(job).getByText("Запланирована").first().waitFor({ timeout: 5000 });
  h.expect(true, "on «Все» the row says its status");
  await h.shot("office");

  // the card opens the job
  await card.click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/job/${job.id}`), `card opens the job (${p.url()})`);

  // tech: the same list, no amounts anywhere on the cards
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/jobs");
  await p.getByTestId("filter-lane-scheduled").locator("visible=true").first().click();
  await p.waitForTimeout(300);
  const cards = await p.locator('[data-testid^="job-row-"]:not([data-testid^="job-row-call-"])').locator("visible=true").allInnerTexts();
  h.expect(cards.length > 0, "the tech sees the jobs");
  h.expect((await p.locator('[data-testid^="job-row-call-"]').locator("visible=true").count()) > 0, "the tech: «Позвонить» on the right of a row");
  for (const c of cards) h.expect(!/\$[\d,]+/.test(c), `tech sees no amount: ${c.slice(0, 160)}`);
  await h.shot("tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
