/**
 * Wave 3a «Связано» (docs/specs/13 §2.7, 15-flows §2, 17-job §7.2): the visit links to its parents, the technician too.
 * - tech: visit → «Работа JOB-0002» → job → «Клиент …» → client (the chain worked only from the Plan before);
 * - office: an inspection → «Лид LEA-0001» → lead; a finished inspection → «Сделать смету» with the lead filled in;
 * - «Этажей: N» is gone from the visit (niche field, 13 §3.3).
 * v2 (#2350): the visit names its job in its header (`visit-job`), the job names its client in the header's parent link
 * (`hdr-parent`) — «Связано» hides what the header shows (features/RelatedBlock `hide`); the inspection's lead is `related-lead`.
 */
const { atMinute, todayKey } = require("../companyTime.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
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
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await tid("visit-job").waitFor({ timeout: 8000 });
  let body = await h.text();
  h.expect(!/Этажей|этажей/.test(body), "no «Этажей: N» on the visit");
  h.expect((await tid("visit-job").innerText()).includes(job.title), `tech: the job «${job.title}» on the visit`);
  await h.shot("tech-visit");
  await tid("visit-job").click();
  await p.waitForURL((u) => u.pathname === `/job/${job.id}`, { timeout: 8000 });
  await tid("job-screen").waitFor();
  h.expect((await p.getByTestId("related-estimate").locator("visible=true").count()) === 0, "tech: no estimate link (money)");
  // phone: the header's parent link; 820 / 1280: the client is the trail's last crumb (the address bar)
  const clientLink = h.layout.width >= 820 ? p.locator('[data-testid^="crumb-/client/"]').locator("visible=true").first() : tid("hdr-parent");
  h.expect((await clientLink.getAttribute("aria-label")).includes(cust.name) || (await clientLink.innerText()).includes(cust.name), `the job's header names its client (${cust.name})`);
  await clientLink.click();
  await p.waitForURL((u) => u.pathname === `/client/${cust.id}`, { timeout: 8000 });

  // the office: inspection → lead
  await setRole(h, "director");
  await h.go(`/visit/${insp.id}`);
  await tid("related-lead").waitFor({ timeout: 8000 });
  h.expect((await tid("related-lead").getAttribute("aria-label")) === `Связано: Лид ${lead.number}`, "the inspection names its lead");
  await tid("related-lead").click();
  await p.waitForURL((u) => u.pathname === `/lead/${lead.id}`, { timeout: 8000 });

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
