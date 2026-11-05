/**
 * «Требует внимания» on the new list cards (step 10а, PR7), every view (3 widths × 2 themes).
 * - «Today»: one card per client with all their reasons (a lead without a client — its own card), debt only from overdue invoices;
 *   reason rows open their record; «More» opens «Triage»;
 * - «Triage»: the rest of the queue are cards that open their record (they did not before);
 * - a technician never gets «Сегодня» / «Требует внимания» (route guard → his visits, no reasons, no debts); no «…».
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  const cards = p.locator('[data-testid="list-card"]');
  const people = cards.filter({ hasText: /Причин: \d+/ });
  h.expect((await people.count()) >= 1 && (await people.count()) <= 3, `people cards on Today (${await people.count()})`);

  // the client with an overdue invoice: one card, «Должен $X», the overdue reason inside
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inv = db.invoices.find((i) => i.paidCents < i.totalCents && new Date(i.dueDate) < today);
  if (inv) {
    const name = db.customers.find((c) => c.id === inv.customerId).name;
    const c = people.filter({ hasText: name });
    if (await c.count()) {
      h.expect((await c.count()) === 1, `one card for ${name}`);
      const txt = await c.first().innerText();
      h.expect(/Должен/.test(txt) && /\$[\d,]+/.test(txt), `debt on the person card: ${txt.slice(0, 200)}`);
    }
  }
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…» on Today");
  await h.shot("today");

  // a reason row opens its own record
  const before = p.url();
  const row = people.first().locator('[data-testid="list-card-reason"]').first();
  await row.click();
  await p.waitForTimeout(600);
  h.expect(p.url() !== before, `a reason row opens its record (${p.url()})`);

  // «Triage»: the rest of the queue are cards that open their record
  await h.go("/triage");
  const rest = p.locator('[data-testid="list-card"]');
  if ((await rest.count()) > 0) {
    const u = p.url();
    await rest.first().click({ position: { x: 20, y: 20 } });
    await p.waitForTimeout(600);
    h.expect(p.url() !== u, `a queue card opens its record (${p.url()})`);
  }
  await h.shot("triage");

  // technician: «Сегодня» and «Требует внимания» are closed (route guard) — he lands on his visits: no attention cards, no debts
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  // what the tech really sees: the open screen only (a tab he was sent away from stays mounted, hidden with aria-hidden)
  const shownText = () => p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove()); return c.innerText || c.textContent; });
  const shownCount = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((n) => !n.closest('[aria-hidden="true"]')).length, sel);
  for (const path of ["/today", "/triage"]) {
    await h.go(path);
    await p.waitForTimeout(500);
    h.expect(new URL(p.url()).pathname === "/visits", `tech ${path} → /visits (got ${p.url()})`);
    const body = await shownText();
    h.expect((await shownCount('[data-testid="list-card"]')) > 0, "the tech sees his visit cards");
    h.expect(!body.includes("Требует внимания") && !/Причин: \d+/.test(body) && !/Должен/.test(body), `tech sees no «Требует внимания» and no debts after ${path}`);
    h.expect((await shownCount('[data-testid="list-card-reason"]')) === 0, "no attention reason rows");
  }
};
