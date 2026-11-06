/**
 * Wave 3a «Связано» (docs/specs/13 §2.7, 15-flows §2, 17-job §7.2): the visit links to its parents, the technician too.
 * - tech: visit → «Работа JOB-0002» → job → «Клиент …» → client (the chain worked only from the Plan before);
 * - office: an inspection → «Лид LEA-0001» → lead; a finished inspection → «Сделать смету» with the lead filled in;
 * - «Этажей: N» is gone from the visit (niche field, 13 §3.3).
 */
const { atMinute, todayKey } = require("../companyTime.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  const rel = (re) => p.getByRole("button", { name: re }).locator("visible=true").first();
  await h.go("/visits");
  const db = await h.db();
  const job = db.jobs.find((j) => j.id === "j2");
  const cust = db.customers.find((c) => c.id === (job.customerId ?? db.properties.find((x) => x.id === job.propertyId).customerId));
  const lead = db.leads.find((l) => l.id === "l1");
  const insp = db.visits.find((v) => v.id === "v6");
  await p.evaluate(([v, lid]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [...raw.db.visits.filter((x) => x.id !== v.id), v].map((x) => (x.id === "v6" ? { ...x, leadId: lid } : x));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [
    { id: "e2e62", jobId: job.id, propertyId: job.propertyId, kind: "install", techId: db.me, assigneeIds: [db.me], start: atMinute(todayKey(), 23 * 60), durationMin: 60, step: "scheduled", scope: ["Gutter repair"], checklist: [], photos: [], amountDueCents: 0 },
    lead.id,
  ]);

  // the technician: visit → job → client
  await setRole(h, "tech");
  await h.go("/visit/e2e62");
  let body = await h.text();
  h.expect(!/Этажей|этажей/.test(body), "no «Этажей: N» on the visit");
  h.expect((await rel(new RegExp(`^Связано: Работа ${job.number}$`)).count()) === 1, "tech: «Работа JOB-…» on the visit");
  await h.shot("tech-visit");
  await rel(new RegExp(`^Связано: Работа ${job.number}$`)).click();
  await p.waitForTimeout(700);
  h.expect(path(h) === `/job/${job.id}`, `visit → job (${p.url()})`);
  await h.expectText(new RegExp(`Работа ${job.number}`), "the job's header has its number");
  h.expect((await rel(/^Связано: Смета/).count()) === 0, "tech: no estimate link (money)");
  await rel(new RegExp(`^Связано: Клиент ${cust.name}$`)).click();
  await p.waitForTimeout(700);
  h.expect(path(h) === `/client/${cust.id}`, `job → client (${p.url()})`);

  // the office: inspection → lead
  await setRole(h, "director");
  await h.go(`/visit/${insp.id}`);
  await rel(new RegExp(`^Связано: Лид ${lead.number}$`)).click();
  await p.waitForTimeout(700);
  h.expect(path(h) === `/lead/${lead.id}`, `inspection → lead (${p.url()})`);

  // a finished inspection: «Сделать смету» is the main action, the lead goes along
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = raw.db.visits.map((x) => (x.id === "v6" ? { ...x, step: "done" } : x));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go(`/visit/${insp.id}`);
  await h.shot("inspection-done");
  await h.click("Сделать смету");
  await p.waitForTimeout(700);
  const u = new URL(p.url());
  h.expect(u.pathname === "/estimate/new" && u.searchParams.get("leadId") === lead.id, `«Сделать смету» → new estimate of the lead (${p.url()})`);
};
