const { atMinute, todayKey } = require("../companyTime.cjs");
/**
 * «План» → Неделя (docs/specs/24 §B, 17-job §12.2): an inspection has no job, so its card in the Week found no client and
 * read «11:00 PM · —». The client comes from the visit itself (visitWho: the property's client or the lead), the same as
 * everywhere else. Own data, not the demo's: a client with no jobs, an inspection of theirs today at 11 PM.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  const busy = new Set(db.jobs.map((j) => j.propertyId));
  const prop = db.properties.find((x) => !busy.has(x.id) && db.customers.some((c) => c.id === x.customerId));
  h.expect(!!prop, "demo has a property without jobs");
  const client = db.customers.find((c) => c.id === prop.customerId);
  const visit = { id: "e2e-108", propertyId: prop.id, kind: "inspection", techId: null, assigneeIds: [], start: atMinute(todayKey(), 23 * 60), durationMin: 45, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 };
  await p.evaluate((v) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [v, ...raw.db.visits.filter((x) => x.id !== v.id)];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("week"));
  }, visit);
  await h.go("/plan");
  await p.waitForTimeout(300);
  // recipe C (ListCard): «11:00 / PM» on the left, the client is the card's name
  const card = p.getByRole("button", { name: client.name, exact: true }).filter({ hasText: "11:00" }).locator("visible=true");
  h.expect((await card.count()) > 0, `the inspection's card names its client (${client.name})`);
  h.expect((await p.getByRole("button", { name: "—", exact: true }).filter({ hasText: "11:00" }).locator("visible=true").count()) === 0, "no card named «—» at 11:00 PM");
  await h.shot("week-inspection");
};
