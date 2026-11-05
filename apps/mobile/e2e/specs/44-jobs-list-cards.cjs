/**
 * «Работы» on the new list cards (step 10а, PR8), every view (3 widths × 2 themes).
 * - office: client name, job title, amount, status in words, address; scheduled job shows its next visit's tech;
 * - tech: the same card without any amount (spec 06 §7.6);
 * - the card opens the job; no «…»; edges aligned.
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/jobs");
  const db = await h.db();
  const cardOf = (text) => p.locator('[data-testid="list-card"]').filter({ hasText: text }).first();
  const nameOf = (j) => db.customers.find((c) => c.id === db.properties.find((x) => x.id === j.propertyId)?.customerId)?.name;

  // a scheduled job (filter «Запланирован»)
  const job = db.jobs.find((j) => j.status === "scheduled");
  h.expect(job, "demo has a scheduled job");
  await p.getByText(/^Запланирован · \d+$/).last().click();
  await p.waitForTimeout(300);
  const card = cardOf(job.title);
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  for (const s of [nameOf(job), job.title, "Запланирован"]) h.expect(txt.includes(s), `job card shows «${s}»: ${txt.slice(0, 200)}`);
  h.expect(/\$[\d,]+/.test(txt), "office sees the amount");
  const visit = db.visits.filter((v) => v.jobId === job.id).sort((a, b) => a.start.localeCompare(b.start)).find((v) => v.step !== "paid" && v.step !== "done");
  // everyone assigned to the next visit (assigneeIds, else techId)
  const ids = visit ? (visit.assigneeIds?.length ? visit.assigneeIds : visit.techId ? [visit.techId] : []) : [];
  for (const id of ids) {
    const m = db.members.find((x) => x.id === id);
    if (m) h.expect(txt.includes(m.name), `assigned «${m.name}» on the card`);
  }
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…» on the screen");
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { reference: (pg) => pg.getByRole("radiogroup").first(), min: 1 });
  await h.shot("office");

  // the card opens the job
  await card.click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/job/${job.id}`), `card opens the job (${p.url()})`);

  // tech: the same list, no amounts anywhere on the cards
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/jobs");
  await p.getByText(/^Запланирован · \d+$/).last().click();
  await p.waitForTimeout(300);
  const cards = await p.locator('[data-testid="list-card"]').allInnerTexts();
  h.expect(cards.length > 0, "the tech sees the jobs");
  for (const c of cards) h.expect(!/\$[\d,]+/.test(c), `tech sees no amount: ${c.slice(0, 160)}`);
  await h.shot("tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("owner")));
};
