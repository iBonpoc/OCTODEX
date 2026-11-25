const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * «Сегодня у бригад» on «Главная» (step 10а, PR10a → prototype v2 #2350 макет 1), every view (3 widths × 2 themes), by testID:
 * - a row per visit of the company's today (`crew-row`, at most 6): the client, «работа · мастера» (every assignee through
 *   assigneeIds, #105 — their first names), the visit's state in words when it says more than its hour («Идёт работа»);
 * - the row opens its visit; «План ›» (`crew-plan`) opens the Plan; no «…».
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  const today = todayKey(); // the company's today (П4b)
  const assigned = (v, id) => (v.assigneeIds?.length ? v.assigneeIds : v.techId ? [v.techId] : []).includes(id);
  const techs = db.members.filter((m) => m.roles.includes("tech"));
  // put one of today's visits «in work», with two people on it, so the row has a state and two names
  const tech = techs.find((m) => db.visits.some((v) => dayKey(v.start) === today && assigned(v, m.id)));
  h.expect(tech, "demo has a tech with a visit today");
  const mate = techs.find((m) => m.id !== tech.id);
  h.expect(mate, "demo has a second tech");
  const visit = db.visits.filter((v) => dayKey(v.start) === today && assigned(v, tech.id)).sort((a, b) => a.start.localeCompare(b.start))[0];
  await p.evaluate(([id, ids]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = raw.db.visits.map((v) => (v.id === id ? { ...v, step: "working", closed: false, techId: ids[0], assigneeIds: ids } : v));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [visit.id, [tech.id, mate.id]]);
  await h.go("/today");
  const rows = p.getByTestId("crew-row").locator("visible=true");
  await rows.first().waitFor({ timeout: 8000 });
  const todays = db.visits.filter((v) => dayKey(v.start) === today);
  const n = await rows.count();
  h.expect(n >= 1 && n <= Math.min(6, todays.length), `a row per visit of today, at most 6 (${n} of ${todays.length})`);
  const prop = db.properties.find((x) => x.id === db.jobs.find((j) => j.id === visit.jobId)?.propertyId) ?? db.properties.find((x) => x.id === visit.propertyId);
  const client = prop && db.customers.find((c) => c.id === prop.customerId);
  h.expect(client, "the visit has a client");
  const row = rows.filter({ hasText: client.name }).first();
  await row.scrollIntoViewIfNeeded();
  const txt = await row.innerText();
  const first = (m) => m.name.split(/\s+/)[0];
  for (const s of [client.name, "Идёт работа", first(tech), first(mate)]) h.expect(txt.includes(s), `crew row shows «${s}»: ${txt.replace(/\n/g, " | ")}`);
  h.expect(!/…|\.\.\./.test(await p.getByTestId("today-crews").locator("visible=true").first().innerText()), "no «…» in «Сегодня у бригад»");
  await h.shot("crews");

  // the row opens its visit
  await row.click();
  await p.waitForURL(new RegExp(`/visit/${visit.id}`), { timeout: 5000 });
  h.expect(true, `the row opens its visit (${p.url()})`);

  // «План ›» → the Plan
  await h.go("/today");
  await p.getByTestId("crew-plan").locator("visible=true").first().click();
  await p.waitForURL(/\/plan/, { timeout: 5000 });
  h.expect(true, `«План ›» opens the plan (${p.url()})`);
};
