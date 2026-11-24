const { planShowDone } = require("../planFilters.cjs");
const { addDays, atMinute, todayKey } = require("../companyTime.cjs");
/**
 * «План» rows (v2 #2350: the Week's GroupRow `plan-row-<id>` — was the list card ListCard of step 10а), every view.
 * - a visit: the hour on the left, the client is the title, the status a pill in words («Запланирован» says nothing);
 * - a visit nobody is on: the row's own «Назначить» (`plan-assign-<id>`) and «Не назначено · N» under the day → the sheet with
 *   «Завтра» and «Назначить» (`plan-unassigned-assign-<id>`);
 * - a tech sees no sums (06 §7.6); v2 rows carry no sum for anyone (the money is on the visit) — no coloured edge either, the
 *   status is the pill (rule 2: значок + слово).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const today = todayKey();
  const seed = { today, tomorrow: addDays(today, 1), at: { late: atMinute(today, 22 * 60), nine: atMinute(today, 9 * 60), six: atMinute(addDays(today, 1), 6 * 60 + 30) } };
  const ids = await p.evaluate((s) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const me = raw.db.me;
    // three properties of three different clients: a card is found by its client's name
    const seen = new Set();
    const [p1, p2, p3] = raw.db.properties.filter((x) => !seen.has(x.customerId) && seen.add(x.customerId));
    const base = { scope: [], checklist: [], photos: [], durationMin: 60, kind: "inspection", techId: null };
    raw.db.visits = [
      ...raw.db.visits,
      // a job visit: «к оплате» is counted from its job's contract and invoices (features/visitDue.ts, #857), not a stored field
      { ...base, id: "v130-site", kind: "job", jobId: "j130", propertyId: p1.id, assigneeIds: [me], start: s.at.late, step: "on_site", amountDueCents: 0 },
      { ...base, id: "v130-done", propertyId: p2.id, assigneeIds: [me], start: s.at.nine, step: "done", amountDueCents: 0 },
      { ...base, id: "v130-free", propertyId: p3.id, assigneeIds: [], start: s.at.six, step: "scheduled", amountDueCents: 0 },
    ];
    raw.db.jobs = [...raw.db.jobs, { id: "j130", propertyId: p1.id, title: "T130 job", status: "scheduled", amountCents: 12300 }];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("week"));
    const name = (pr) => raw.db.customers.find((c) => c.id === pr.customerId)?.name;
    return { site: name(p1), done: name(p2), free: name(p3) };
  }, seed);
  await h.go("/plan");
  const feed = p.getByTestId("plan-week-list").locator("visible=true").first();
  await feed.waitFor();
  await planShowDone(p, true);
  const rowOf = (id) => p.getByTestId("plan-week-list").locator("visible=true").first().getByTestId(`plan-row-${id}`).first();
  const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");

  // the visit on site at 10 PM (away from the demo's day: no «Накладка»): «10:00 / PM», the client, the status in words
  const site = rowOf("v130-site");
  await site.scrollIntoViewIfNeeded();
  const siteText = await flat(site);
  for (const w of ["10:00", "PM", ids.site, "На месте"]) h.expect(siteText.includes(w), `the visit row shows «${w}»: ${JSON.stringify(ids)} ${siteText.slice(0, 300)}`);
  h.expect(!siteText.includes("…"), "no «…» on the row");
  h.expect(!/Накладка/.test(siteText), "the control is clean: no overlap sign");

  // the done visit: said in words
  const done = rowOf("v130-done");
  h.expect((await flat(done)).includes("Готово") && (await flat(done)).includes(ids.done), `the done visit says so in words: ${await flat(done)}`);

  // the unassigned visit tomorrow: its row has «Назначить» (a Sunday's tomorrow is the next week)
  if ((await rowOf("v130-free").count()) === 0) await p.getByTestId("plan-month-next").locator("visible=true").first().click();
  const free = rowOf("v130-free");
  await free.waitFor({ timeout: 5000 });
  h.expect((await flat(free)).includes(ids.free) && /6:30/.test(await flat(free)), `the free visit's row: ${await flat(free)}`);
  // the quick action is the row's neighbour (GroupRow: no button inside the row's button)
  h.expect((await p.getByTestId("plan-assign-v130-free").locator("visible=true").count()) === 1, "nobody on it: the row's «Назначить»");
  // «Не назначено · N» → the sheet: «Завтра» and «Назначить»
  const soonRow = p.getByTestId("plan-unassigned").locator("visible=true").first();
  await soonRow.getByRole("button").first().click();
  const sheet = p.getByTestId("plan-unassigned-sheet").locator("visible=true").first();
  await sheet.waitFor({ timeout: 5000 });
  h.expect(/Завтра/.test(await sheet.innerText()) && (await sheet.innerText()).includes(ids.free), `«Не назначено»: tomorrow's visit: ${(await sheet.innerText()).slice(0, 200)}`);
  h.expect((await sheet.getByTestId("plan-unassigned-assign-v130-free").count()) === 1, "«Не назначено»: the action «Назначить»");
  await h.shot("plan-cards");

  // a tech: his own visit, no sums
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/plan");
  const techSite = rowOf("v130-site");
  await techSite.waitFor({ timeout: 8000 });
  const techText = await flat(techSite);
  h.expect(!/\$|к оплате/.test(techText), `a tech sees no sum: ${techText.slice(0, 200)}`);
  await h.shot("plan-cards-tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
