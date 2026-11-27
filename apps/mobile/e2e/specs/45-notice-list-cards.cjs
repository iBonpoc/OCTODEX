/**
 * «Уведомления» as list cards (step 10а, PR9), every view (3 widths × 2 themes). Prototype v2 (#2350): «Главная» has no notices
 * block — they are behind the bell of its header (`home-bell`, the unread count `home-bell-badge`) on «Уведомления» (/notifications).
 * - an approved estimate: client, amount, «Одобрена», estimate number, «Запланировать работу» inside the card → scheduling;
 * - an opened estimate: «Открыта», no «Запланировать работу»; the card opens the estimate;
 * - «Отметить прочитанными» marks all read (they move under «Прочитанные», the bell's count drops); the technician never sees
 *   them (amounts, spec 06 §7.6); no «…».
 * - a computed «running late» notice (docs/specs/03 П3c) is not read by it: spec 49 tests it.
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
  // the bell of «Главная» says how many are unread and opens them
  await p.getByTestId("home-bell-badge").locator("visible=true").first().waitFor({ timeout: 8000 });
  await p.getByTestId("home-bell").locator("visible=true").first().click();
  await p.waitForURL(/\/notifications/, { timeout: 5000 });
  // П3c: the demo may also have a computed «running late» notice (v5) — count the server ones by their words
  const cards = p.locator('[data-testid="notice-card"]').locator("visible=true");
  await cards.first().waitFor({ timeout: 8000 });
  const serverCards = cards.filter({ hasText: /Одобрена|Открыта/ });
  h.expect((await serverCards.count()) === 2, `two client notices (${await serverCards.count()})`);
  const ok = cards.filter({ hasText: "Одобрена" }).first();
  await ok.scrollIntoViewIfNeeded();
  const okText = await ok.innerText();
  for (const s of [name(est), "$5,180.00", est.number].filter(Boolean)) h.expect(okText.includes(s), `approved card shows «${s}»: ${okText.slice(0, 200)}`);
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
  await h.go("/notifications");
  await cards.filter({ hasText: "Открыта" }).first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/estimate/${other.id}`), `card opens the estimate (${p.url()})`);

  // technician: «Сегодня» is closed (route guard) — his home has no bell's count of client events, «Уведомления» show him none
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  // what the tech really sees: the open screen only (a tab he was sent away from stays mounted, hidden with aria-hidden)
  const shownText = () => p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove()); return c.innerText || c.textContent; });
  const shownCount = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((n) => !n.closest('[aria-hidden="true"]')).length, sel);
  await h.go("/today");
  await p.waitForURL(/\/visits/, { timeout: 5000 });
  h.expect(new URL(p.url()).pathname === "/visits", `tech /today → /visits (got ${p.url()})`);
  h.expect((await shownCount('[data-testid="notice-card"]')) === 0 && !(await shownText()).includes("$5,180.00"), "the technician sees no notices on his home");
  await h.go("/notifications");
  await p.getByTestId("screen-title").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await shownCount('[data-testid="notice-card"]')) === 0 && !(await shownText()).includes("$5,180.00"), "the technician sees no client notices and no approved amount");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));

  // «Отметить прочитанными» marks all read → they move under «Прочитанные», the bell's count drops
  await inject(2);
  await h.go("/notifications");
  await serverCards.first().waitFor({ timeout: 8000 });
  await p.getByRole("button", { name: "Отметить прочитанными" }).locator("visible=true").first().click();
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.notices ?? []).filter((n) => n.id.startsWith("e2e-")).every((n) => n.read), null, { timeout: 5000 });
  await h.expectText(/Прочитанные/, "the read notices stay below, under «Прочитанные»");
  await h.go("/today");
  await p.getByTestId("home-bell").locator("visible=true").first().waitFor({ timeout: 8000 });
  const db2 = await h.db();
  h.expect(db2.notices.filter((n) => n.id.startsWith("e2e-")).every((n) => n.read), "both client notices are read (a «running late» one stays while the visit is late, П3c)");
};
