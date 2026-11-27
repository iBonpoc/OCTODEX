/**
 * e2e 498 — #2061 (rule А, the lead 18.11): only the contract's own invoices count against it, as the server.
 * С1 ДАНО работа $500 выполнена, по ней только standalone-счёт $200 (доп. работа); КОГДА директор открывает работу;
 *    ТОГДА главный шаг «Счёт на остаток» (v2: без суммы на кнопке), и нажатие выставляет final на $500 — standalone
 *    договор не съедает.
 * С2 ДАНО standalone $200 + депозит $150; ТОГДА остаток выставляется final на $350.
 * С3 (ревью) ДАНО старый final $150, выставленный по старому правилу (500 − депозит 150 − standalone 200); ТОГДА остаток
 *    $200 выставляется счётом за этап (progress): второго final сервер не примет.
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
  raw.db.jobs = [...raw.db.jobs.filter((j) => !["j498a", "j498b", "j498c"].includes(j.id)), job("j498a", "Gutter 498 A"), job("j498b", "Gutter 498 B"), job("j498c", "Gutter 498 C")];
  raw.db.visits = raw.db.visits.filter((v) => !["j498a", "j498b", "j498c"].includes(v.jobId));
  raw.db.invoices = [
    ...raw.db.invoices.filter((i) => !["j498a", "j498b", "j498c"].includes(i.jobId)),
    { id: "i498s", customerId: cust.id, jobId: "j498a", totalCents: 20000, paidCents: 20000, dueDate: iso, sentAt: iso, kind: "standalone", title: "Extra 498" },
    { id: "i498t", customerId: cust.id, jobId: "j498b", totalCents: 20000, paidCents: 0, dueDate: iso, sentAt: iso, kind: "standalone", title: "Extra 498 B" },
    { id: "i498d", customerId: cust.id, jobId: "j498b", totalCents: 15000, paidCents: 15000, dueDate: iso, sentAt: iso, kind: "deposit" },
    { id: "i498cd", customerId: cust.id, jobId: "j498c", totalCents: 15000, paidCents: 15000, dueDate: iso, sentAt: iso, kind: "deposit" },
    { id: "i498cs", customerId: cust.id, jobId: "j498c", totalCents: 20000, paidCents: 0, dueDate: iso, sentAt: iso, kind: "standalone" },
    { id: "i498cf", customerId: cust.id, jobId: "j498c", totalCents: 15000, paidCents: 0, dueDate: iso, sentAt: iso, kind: "final" },
  ];
  await h.seed(KEY, raw);
  await h.seed("octo.role.v1", "director");

  // v2 (#2349): the main step «Счёт на остаток» carries no sum — the sum is the invoice it makes
  const rest = () => p.getByTestId("job-next-rest").locator("visible=true").first();
  const added = async (jid, before, n) => {
    await p.waitForFunction(([k, j, c]) => (JSON.parse(localStorage.getItem(k) || "null")?.db?.invoices ?? []).filter((i) => i.jobId === j).length === c, [KEY, jid, n], { timeout: 8000 });
    const db = await h.db();
    return { db, inv: db.invoices.find((i) => i.jobId === jid && !before.includes(i.id)) };
  };

  // С1
  await h.go("/job/j498a");
  await rest().waitFor({ timeout: 8000 });
  await h.shot("rest-500");
  await rest().click();
  const a = await added("j498a", ["i498s"], 2);
  const fin = a.db.invoices.filter((i) => i.jobId === "j498a" && i.kind === "final");
  h.expect(fin.length === 1 && fin[0].totalCents === 50000, `С1 one final for $500, a standalone invoice does not eat the contract: ${JSON.stringify(fin.map((i) => i.totalCents))}`);

  // С2
  await h.go("/job/j498b");
  await rest().waitFor({ timeout: 8000 });
  await rest().click();
  const b = await added("j498b", ["i498t", "i498d"], 3);
  h.expect(b.inv?.kind === "final" && b.inv?.totalCents === 35000, `С2 standalone $200.00 + deposit $150.00: the rest $350.00 as a final: ${JSON.stringify(b.inv)}`);

  // С3
  await h.go("/job/j498c");
  await rest().waitFor({ timeout: 8000 });
  await rest().click();
  const c = await added("j498c", ["i498cd", "i498cs", "i498cf"], 4);
  const finals = c.db.invoices.filter((i) => i.jobId === "j498c" && i.kind === "final");
  h.expect(finals.length === 1 && c.inv?.kind === "progress" && c.inv?.totalCents === 20000, `С3 the gap $200.00 as a progress invoice, still one final: ${JSON.stringify(c.inv)}`);
};
