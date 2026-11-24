const { atMinute, todayKey } = require("../companyTime.cjs");
/**
 * «Накладка» on visit cards (docs/specs/03 П3c п. 8; spec 06 §5 «Визиты»), every view (3 widths × 2 themes).
 * - two open visits of one person that cross by [start, end) → «Накладка» (warn) on both: «План» day and week, the tech's «Мой день»
 *   (v2 #2350: a pill on the first row, the word on the others, as the late and the missed);
 * - back to back (end = next start) is not an overlap: the sign goes away; a warning, not a ban (both visits stay).
 */
exports.run = async (h) => {
  const p = h.page;
  // the open screen only (a tab left behind stays mounted, hidden with aria-hidden)
  const shown = () => p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove()); return c.innerText || c.textContent; });
  const signs = async () => ((await shown()).match(/Накладка/g) || []).length;
  await h.go("/plan");
  const db = await h.db();
  const me = db.members.find((m) => m.id === db.me);
  h.expect(me.roles.includes("tech"), "the demo owner is also a tech");
  const tpl = db.visits.find((v) => (v.assigneeIds?.length ? v.assigneeIds : [v.techId]).includes(me.id) && v.jobId);
  h.expect(tpl, "demo has a job visit of mine");
  const cust = db.customers.find((c) => c.id === db.properties.find((x) => x.id === db.jobs.find((j) => j.id === tpl.jobId)?.propertyId)?.customerId);
  // two visits of mine today of the company, late in its day (after the runner's noon: still to come, so their status says
  // nothing else — not «Пропущен»), crossing: 20:30–22:30 and 21:30–23:30 (test data, П4b)
  const at = (h, m) => atMinute(todayKey(), h * 60 + m);
  const put = (b) => p.evaluate(({ tpl, me, a, b }) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const base = { ...tpl, techId: me, assigneeIds: [me], step: "scheduled", closed: false, durationMin: 120, checklist: [], photos: [], amountDueCents: 0 };
    raw.db.visits = [...raw.db.visits.filter((v) => !v.id.startsWith("e2e-ov-")), { ...base, id: "e2e-ov-a", start: a }, { ...base, id: "e2e-ov-b", start: b }];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.role.v1", JSON.stringify("director"));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("day"));
  }, { tpl, me: me.id, a: at(20, 30), b });
  await put(at(21, 30));

  // «План», day: both cards of the overlap carry «Накладка»
  await h.go("/plan");
  await p.waitForTimeout(500);
  const n = await signs();
  h.expect(n >= 2, `«Накладка» on both visits in the day view (${n})`);
  await h.shot("plan-day");

  // «План», week
  await p.evaluate(() => localStorage.setItem("octo.planMode.v1", JSON.stringify("week")));
  await h.go("/plan");
  await p.waitForTimeout(500);
  h.expect((await signs()) >= 2, "«Накладка» on both visits in the week view");

  // the tech's own day (v2 «Мой день»): the rest of the day's rows (`visits-row`) with the sign — the next visit is the card «Дальше»
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/visits");
  await p.waitForTimeout(500);
  const cards = p.locator('[data-testid="visits-row"]').locator("visible=true").filter({ hasText: "Накладка" });
  h.expect((await cards.count()) >= 2, `«Накладка» on both of my visit cards (${await cards.count()})`);
  if (cust) h.expect((await cards.first().innerText()).includes(cust.name), "the sign is on the visit's own card");

  // back to back: 20:30–22:30 and 22:30–00:30 → no sign, both visits still there (a warning, not a ban)
  await put(at(22, 30));
  await h.go("/visits");
  await p.waitForTimeout(500);
  h.expect((await signs()) === 0, `back to back is not an overlap (${await signs()})`);
  const d2 = await h.db();
  h.expect(d2.visits.filter((v) => v.id.startsWith("e2e-ov-")).length === 2, "both visits stay");
};
