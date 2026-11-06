// e2e 82: reports v1 (wave 8)
/**
 * «Ещё» → Отчёты v1 (wave 8, 13 §3.15; S14), every view: 4 reports; each number = the same records the lists show.
 * - «Кто должен»: total = every balance; a client card opens that client's debts in «Счета»;
 * - «Собрано за период» (Всё время): total = Σ payments, by method and «Кто принял»;
 * - «Продажи», «Источник лида → выручка» open with their numbers;
 * - CSV — the owner only: the owner sees «Выгрузить CSV», the office opens reports without it; sales and tech — closed.
 */
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const money = (c) => (c % 100 === 0 ? whole.format(c / 100) : cents2.format(c / 100));

exports.run = async (h) => {
  const p = h.page;
  await h.go("/reports");
  const db = await h.db();
  const cards = p.locator('[data-testid="list-card"]');
  h.expect((await cards.count()) === 4, "four reports");
  for (const s of ["Кто должен", "Собрано за период", "Продажи", "Источник лида → выручка"]) h.expect((await h.text()).includes(s), `report «${s}»`);
  await h.shot("index");

  // 1. who owes
  const owes = (i) => Math.max(0, i.totalCents - i.paidCents);
  const owed = db.invoices.filter((i) => owes(i) > 0);
  const total = owed.reduce((s, i) => s + owes(i), 0);
  await cards.filter({ hasText: "Кто должен" }).first().click();
  await p.waitForTimeout(600);
  h.expect(/\/reports\/owed/.test(p.url()), "opens «Кто должен»");
  await h.go("/reports/owed"); // the stack keeps the index mounted: count cards on a fresh page
  h.expect((await h.text()).includes(money(total)), `total owed ${money(total)}`);
  const clients = [...new Set(owed.map((i) => i.customerId))];
  const nCards = await cards.count();
  h.expect(nCards === clients.length, `one card per client who owes (${clients.length}), got ${nCards}`);
  h.expect(await p.getByRole("button", { name: "Выгрузить CSV" }).count() === 1, "owner: CSV button");
  await h.shot("owed");
  await cards.first().click();
  await p.waitForTimeout(600);
  h.expect(/\/invoice\?.*customer=/.test(p.url()) || /\/invoice\?.*f=owed/.test(p.url()), `a client opens their debts in «Счета» (${p.url()})`);

  // 2. collected, all time
  await h.go("/reports/collected?p=all");
  const paid = db.payments.reduce((s, x) => s + x.amountCents, 0);
  const t2 = await h.text();
  h.expect(t2.includes(money(paid)), `collected ${money(paid)}`);
  h.expect(t2.includes("По способам") && t2.includes("Кто принял"), "by method and by person");
  const taker = db.members.find((m) => db.payments.some((x) => x.receivedBy === m.id));
  if (taker) h.expect(t2.includes(taker.name), `person «${taker.name}» in «Кто принял»`);

  // 3, 4 open
  await h.go("/reports/sales?p=month");
  await h.expectText(/Смет отправлено/, "sales: sent");
  await h.go("/reports/sources?p=all");
  await h.expectText(/Выручка, а не прибыль/, "sources: revenue, not profit");

  // office: reports without CSV
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("dispatcher")));
  await h.go("/reports/owed");
  h.expect((await h.text()).includes(money(total)), "office sees the report");
  h.expect((await p.getByRole("button", { name: "Выгрузить CSV" }).count()) === 0, "office: no CSV");

  // sales and tech: closed
  for (const role of ["sales", "tech"]) {
    await p.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);
    await h.go("/reports");
    await h.expectText(/Этот раздел для вашей роли закрыт/, `${role}: no reports`);
  }
};
