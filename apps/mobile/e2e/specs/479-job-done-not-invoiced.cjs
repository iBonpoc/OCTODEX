/**
 * e2e 479 — #2048 (S11 job → invoice): a done job with part of its contract on no invoice is a reason in «Требует внимания»
 * for the office, with the amount not invoiced; it opens the job; it goes when an invoice covers the contract.
 * С1 ДАНО работа выполнена, счёта нет, договор $500; КОГДА директор открывает «Требует внимания»; ТОГДА там «{клиент}: работа
 *    выполнена, счёт не выставлен» и $500, нажатие открывает работу.
 * С2 ДАНО по этой работе выставлен счёт на $500; ТОГДА причины нет.
 * Every view; seeded from a page without the app (h.seed).
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.jobs?.length, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const base = raw.db.jobs[0];
  const cust = raw.db.customers.find((c) => c.id === (base.customerId ?? raw.db.properties.find((x) => x.id === base.propertyId)?.customerId));
  raw.db.jobs = [...raw.db.jobs.filter((j) => j.id !== "j479"), { ...base, id: "j479", title: "Gutter clean 479", status: "done", amountCents: 50000 }];
  raw.db.invoices = raw.db.invoices.filter((i) => i.jobId !== "j479");
  await h.seed(KEY, raw);

  // С1
  await h.go("/triage");
  const row = p.getByText(new RegExp(`${cust.name}: работа выполнена, счёт не выставлен`)).locator("visible=true").first();
  await row.waitFor({ timeout: 8000 });
  h.expect(true, "С1 the reason is in «Требует внимания»");
  // the amount in the reason's own card, not anywhere on the page
  const card = p.locator('[data-testid^="att-"], [data-testid^="list-card"]').filter({ hasText: /работа выполнена, счёт не выставлен/ }).locator("visible=true").first();
  h.expect(/\$500(\.00)?/.test(await card.innerText()), `С1 with the amount not invoiced in its card: ${(await card.innerText()).replace(/\s+/g, " ").slice(0, 120)}`);
  await h.shot("reason");
  await row.click();
  await p.waitForURL((u) => u.pathname === "/job/j479", { timeout: 8000 });
  h.expect(true, "С1 it opens the job");

  // the dispatcher sees it too
  await h.seed("octo.role.v1", "dispatcher");
  await h.go("/triage");
  await p.getByText(/работа выполнена, счёт не выставлен/).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(true, "С1 the dispatcher sees it too");
  await h.seed("octo.role.v1", "director");

  // С2: an invoice for the whole contract — no reason
  const raw2 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  raw2.db.invoices = [...raw2.db.invoices, { id: "i479", customerId: cust.id, jobId: "j479", totalCents: 50000, paidCents: 0, dueDate: new Date(Date.now() + 7 * 864e5).toISOString(), kind: "final" }];
  await h.seed(KEY, raw2);
  await h.go("/triage");
  await p.getByText(/Требует внимания|Нужно внимание/).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByText(/работа выполнена, счёт не выставлен/).locator("visible=true").count()) === 0, "С2 an invoice for the whole contract: no reason");
};
