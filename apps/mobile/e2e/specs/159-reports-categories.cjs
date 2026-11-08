// e2e 159: «По направлениям» (step 12б, docs/specs/18-money-reports.md §11; spec 11 T4; map S14)
/**
 * Every view: the 5th report card on «Отчёты» opens «По направлениям»; for today (company day) each direction card shows
 * leads received / won / %, estimates sent / signed, jobs invoiced, revenue (before tax, through the invoice's job) and the
 * average ticket; «Без направления» is its own card; an archived direction keeps its card with «в архиве»; the total =
 * Σ before tax of every invoice sent today. CSV — the owner only; office sees without CSV; the tech — closed.
 * Records are put in the local base at 00:05 of the company's today, so the spec holds at E2E_NOW = midnight in LA.
 */
const { atMinute, dayKey, todayKey } = require("../companyTime.cjs");

const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const money = (c) => (c % 100 === 0 ? whole.format(c / 100) : cents2.format(c / 100));

exports.run = async (h) => {
  const p = h.page;
  await h.go("/reports");
  const today = todayKey();
  const at = atMinute(today, 5);
  const yesterday = atMinute(today, -60); // 11 PM the day before: not «today»
  await p.evaluate(([at, yesterday]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const db = raw.db;
    const c = db.customers[0];
    const prop = db.properties.find((x) => x.customerId === c.id) || db.properties[0];
    db.serviceCategories = [
      ...db.serviceCategories,
      { id: "cat159a", name: "Roof 159", position: 90 },
      { id: "cat159old", name: "Old 159", position: 91, archivedAt: at },
    ];
    const lead = (id, cat, status, when) => ({ id, name: `Lead ${id}`, phone: "", city: "", sourceId: db.sources[0].id, receivedAt: when, message: "", status, serviceCategoryId: cat });
    db.leads = [...db.leads, lead("l159a", "cat159a", "won", at), lead("l159b", "cat159a", "new", at), lead("l159c", "cat159a", "won", yesterday)];
    db.estimates = [
      ...db.estimates,
      { id: "e159a", serviceCategoryId: "cat159old", customerId: c.id, propertyId: prop.id, title: "E159", totalCents: 123400, status: "approved", sentAt: at, approvedAt: at },
    ];
    db.jobs = [...db.jobs, { id: "j159a", propertyId: prop.id, title: "J159", status: "scheduled", amountCents: 0, serviceCategoryId: "cat159a" }];
    db.invoices = [
      ...db.invoices,
      { id: "i159a", customerId: c.id, jobId: "j159a", totalCents: 108250, subtotalCents: 100000, paidCents: 0, dueDate: at.slice(0, 10), sentAt: at },
      { id: "i159b", customerId: c.id, jobId: "j159a", totalCents: 50001, subtotalCents: 50001, paidCents: 0, dueDate: at.slice(0, 10), sentAt: at },
    ];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [at, yesterday]);

  // the index: five reports, the fifth opens «По направлениям»
  await h.go("/reports");
  const cards = p.locator('[data-testid="list-card"]');
  await h.expectText(/По направлениям/, "the 5th report");
  h.expect((await cards.count()) === 5, "five reports");
  await h.shot("index");
  await cards.filter({ hasText: "По направлениям" }).first().click();
  await p.waitForURL(/\/reports\/categories/);

  await h.go("/reports/categories?p=today");
  const card = (k) => p.getByTestId(`rpt-cat-${k}`).locator("visible=true").first();
  await card("cat159a").waitFor();
  const a = await card("cat159a").innerText();
  // 2 leads today (the third is yesterday's), 1 won = 50 %; one job, two invoices before tax $1,500.01 → average $1,500.01
  h.expect(a.includes("Roof 159"), "direction name");
  h.expect(/Лиды\s+2\b/.test(a) && /Выиграно\s+1 · 50%/.test(a), `leads of Roof 159: ${a}`);
  h.expect(a.includes(money(150001).replace(/\.\d\d$/, "")), `revenue of Roof 159 (${a})`);
  h.expect(a.includes(money(150001)), `average ticket $1,500.01 (${a})`);
  const old = await card("cat159old").innerText();
  h.expect(old.includes("в архиве"), "archived direction keeps its card, marked");
  h.expect(/Смет отправлено\s+1\b/.test(old) && /Смет подписано\s+1 · \$1,234\b/.test(old), `archived: estimate sent and signed $1,234 (${old})`);

  // the total = Σ before tax of every invoice sent today (the demo's own too)
  const db = await h.db();
  const revenue = db.invoices.filter((i) => i.sentAt && dayKey(i.sentAt) === today).reduce((s, i) => s + (i.subtotalCents ?? i.totalCents), 0);
  const tot = await p.getByTestId("rpt-cat-total").locator("visible=true").first().innerText();
  h.expect(tot.includes(cents2.format(revenue / 100)), `total revenue ${cents2.format(revenue / 100)} (${tot})`);
  // «Без направления» is its own card when today has a record without one
  const noneToday =
    db.leads.some((l) => !l.serviceCategoryId && dayKey(l.receivedAt) === today) ||
    db.invoices.some((i) => i.sentAt && dayKey(i.sentAt) === today && !db.jobs.find((j) => j.id === i.jobId)?.serviceCategoryId);
  if (noneToday) h.expect((await card("none").innerText()).includes("Без направления"), "«Без направления» card");
  h.expect(await p.getByRole("button", { name: "Выгрузить CSV" }).count() === 1, "owner: CSV");
  await h.shot("categories");

  // office: the report without CSV
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("dispatcher")));
  await h.go("/reports/categories?p=today");
  await card("cat159a").waitFor();
  h.expect((await p.getByRole("button", { name: "Выгрузить CSV" }).count()) === 0, "office: no CSV");

  // the tech: closed, no figures on the way
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/reports/categories?p=today");
  await p.waitForURL((u) => new URL(u).pathname === "/visits");
  await h.expectText(/Нет доступа к этому экрану/, "tech: «Нет доступа»");
  h.expect((await p.getByTestId("rpt-cat-cat159a").count()) === 0, "tech: no direction figures");
};
