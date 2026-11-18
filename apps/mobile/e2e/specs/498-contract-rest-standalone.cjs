/**
 * e2e 498 — #2061 (rule А, the lead 18.11): only the contract's own invoices count against it, as the server.
 * С1 ДАНО работа $500 выполнена, по ней только standalone-счёт $200 (доп. работа); КОГДА директор открывает работу;
 *    ТОГДА «Создать счёт на остаток $500.00», и нажатие выставляет final на $500 — standalone договор не съедает.
 * С2 ДАНО standalone $200 + депозит $150; ТОГДА остаток $350.
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
  const iso = new Date().toISOString();
  const job = (id, title) => ({ ...base, id, title, status: "done", amountCents: 50000, estimateId: undefined });
  raw.db.jobs = [...raw.db.jobs.filter((j) => !["j498a", "j498b"].includes(j.id)), job("j498a", "Gutter 498 A"), job("j498b", "Gutter 498 B")];
  raw.db.visits = raw.db.visits.filter((v) => !["j498a", "j498b"].includes(v.jobId));
  raw.db.invoices = [
    ...raw.db.invoices.filter((i) => !["j498a", "j498b"].includes(i.jobId)),
    { id: "i498s", customerId: cust.id, jobId: "j498a", totalCents: 20000, paidCents: 20000, dueDate: iso, sentAt: iso, kind: "standalone", title: "Extra 498" },
    { id: "i498t", customerId: cust.id, jobId: "j498b", totalCents: 20000, paidCents: 0, dueDate: iso, sentAt: iso, kind: "standalone", title: "Extra 498 B" },
    { id: "i498d", customerId: cust.id, jobId: "j498b", totalCents: 15000, paidCents: 15000, dueDate: iso, sentAt: iso, kind: "deposit" },
  ];
  await h.seed(KEY, raw);
  await h.seed("octo.role.v1", "director");

  // С1
  await h.go("/job/j498a");
  const rest = p.getByText(/^Создать счёт на остаток \$500(\.00)?$/).locator("visible=true").first();
  await rest.waitFor({ timeout: 8000 });
  h.expect(true, "С1 the rest is the whole $500: a standalone invoice does not eat the contract");
  await h.shot("rest-500");
  await rest.click();
  await p.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || "null")?.db?.invoices ?? []).some((i) => i.jobId === "j498a" && i.kind === "final"), KEY, { timeout: 8000 });
  const db = await h.db();
  const fin = db.invoices.filter((i) => i.jobId === "j498a" && i.kind === "final");
  h.expect(fin.length === 1 && fin[0].totalCents === 50000, `С1 one final for $500: ${JSON.stringify(fin.map((i) => i.totalCents))}`);

  // С2
  await h.go("/job/j498b");
  await p.getByText(/^Создать счёт на остаток \$350(\.00)?$/).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(true, "С2 standalone $200 + deposit $150: the rest is $350");
};
