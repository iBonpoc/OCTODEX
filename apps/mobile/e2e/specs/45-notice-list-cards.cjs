/**
 * «Уведомления» on «Сегодня» as list cards (step 10а, PR9), every view (3 widths × 2 themes).
 * - an approved estimate: client, amount, «Одобрена», estimate number, «Запланировать работу» inside the card → scheduling;
 * - an opened estimate: «Открыта», no «Запланировать работу»; the card opens the estimate;
 * - «Понятно» marks all read; the technician never sees the block (amounts, spec 06 §7.6); no «…».
 * - a computed «running late» notice (docs/specs/03 П3c) is not read by «Понятно»: spec 49 tests it.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  // a job made from an estimate and waiting for a date (no visits yet), and another estimate to be «opened»
  const job = db.jobs.find((j) => !db.visits.some((v) => v.jobId === j.id));
  h.expect(job, "demo has a job without visits");
  const est = db.estimates.find((e) => e.id === job.estimateId) ?? db.estimates[0];
  const other = db.estimates.find((e) => e.id !== est.id);
  const name = (e) => db.customers.find((c) => c.id === e.customerId).name;
  const now = new Date().toISOString();
  const inject = (tag) => p.evaluate(([n1, n2]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.notices = [n1, n2, ...raw.db.notices.filter((n) => !n.id.startsWith("e2e-"))];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [
    { id: `e2e-ok-${tag}`, kind: "estimate.approved", estimateId: est.id, jobId: job.id, customer: name(est), totalCents: 518000, at: now },
    { id: `e2e-view-${tag}`, kind: "estimate.viewed", estimateId: other.id, customer: name(other), at: now },
  ]);
  await inject(1);
  await h.go("/today");
  // П3c: the demo may also have a computed «running late» notice (v5) — count the server ones by their words
  await h.expectText(/Уведомления · \d+/, "notices block with the count");
  const cards = p.locator('[data-testid="notice-card"]');
  const serverCards = cards.filter({ hasText: /Одобрена|Открыта/ });
  h.expect((await serverCards.count()) === 2, `two client notices (${await serverCards.count()})`);
  const ok = cards.filter({ hasText: "Одобрена" }).first();
  await ok.scrollIntoViewIfNeeded();
  const okText = await ok.innerText();
  for (const s of [name(est), "$5,180", est.number].filter(Boolean)) h.expect(okText.includes(s), `approved card shows «${s}»: ${okText.slice(0, 200)}`);
  h.expect(okText.includes("Запланировать работу"), "«Запланировать работу» is inside the card");
  const viewText = await cards.filter({ hasText: "Открыта" }).first().innerText();
  h.expect(viewText.includes(name(other)) && !viewText.includes("Запланировать работу"), `opened card: client, no «Запланировать работу»: ${viewText.slice(0, 160)}`);
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…» on the screen");
  await h.shot("notices");

  // «Запланировать работу» → scheduling of that job
  await ok.getByRole("button", { name: "Запланировать работу" }).click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`jobId=${job.id}`), `«Запланировать работу» opens scheduling (${p.url()})`);

  // the opened card opens the estimate
  await h.go("/today");
  await cards.filter({ hasText: "Открыта" }).first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/estimate/${other.id}`), `card opens the estimate (${p.url()})`);

  // technician: «Сегодня» is closed (route guard) — on his visits there is no notices block and no client amounts from it
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  // what the tech really sees: the open screen only (a tab he was sent away from stays mounted, hidden with aria-hidden)
  const shownText = () => p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove()); return c.innerText || c.textContent; });
  const shownCount = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((n) => !n.closest('[aria-hidden="true"]')).length, sel);
  await h.go("/today");
  await p.waitForTimeout(500);
  h.expect(new URL(p.url()).pathname === "/visits", `tech /today → /visits (got ${p.url()})`);
  const techBody = await shownText();
  h.expect((await shownCount('[data-testid="notice-card"]')) === 0 && !/Уведомления · \d+/.test(techBody) && !techBody.includes("$5,180"), "the technician sees no notices and no approved amount");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));

  // «Понятно» marks all read → the block is gone
  await inject(2);
  await h.go("/today");
  await p.getByRole("button", { name: "Понятно" }).first().click();
  await p.waitForTimeout(400);
  h.expect((await serverCards.count()) === 0, "«Понятно» hides the read notices (a «running late» one stays while the visit is late, П3c)");
};
