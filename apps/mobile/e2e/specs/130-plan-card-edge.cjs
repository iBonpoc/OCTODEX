const { planShowDone } = require("../planFilters.cjs");
const { addDays, atMinute, todayKey } = require("../companyTime.cjs");
const { checkCardAlignment } = require("../cardsAlignment.cjs");
/**
 * «План» on the list card ListCard (step 10а, docs/specs/06-list-cards.md «10а, остаток»), every view (3 widths × 2 themes).
 * - a visit is recipe C: the hour on the left, the client is the name, the status chip in words;
 * - the coloured edge only for warn / bad (06 §7.3): an «on site» (info) and a done (ok) visit have none, an unassigned one has it;
 * - «к оплате» only to the office and only when the visit has a sum; a tech sees no sums (06 §7.6);
 * - the cards sit on the Feed's edges.
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
      { ...base, id: "v130-site", propertyId: p1.id, assigneeIds: [me], start: s.at.late, step: "on_site", amountDueCents: 12300 },
      { ...base, id: "v130-done", propertyId: p2.id, assigneeIds: [me], start: s.at.nine, step: "done", amountDueCents: 0 },
      { ...base, id: "v130-free", propertyId: p3.id, assigneeIds: [], start: s.at.six, step: "scheduled", amountDueCents: 0 },
    ];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("feed"));
    const name = (pr) => raw.db.customers.find((c) => c.id === pr.customerId)?.name;
    return { site: name(p1), done: name(p2), free: name(p3) };
  }, seed);
  await h.go("/plan");
  const feed = p.getByTestId("plan-feed").last();
  await feed.waitFor();
  await planShowDone(p, true);

  const cardOf = (root, name, hasText) => root.getByRole("button", { name, exact: true }).filter({ hasText }).locator('xpath=ancestor-or-self::*[@data-testid="list-card"][1]').first();
  // the edge is an absolute 3-px strip on the card's left side (component.statusEdge)
  const edgeOf = (card) => card.evaluate((el) => [...el.querySelectorAll("*")].some((n) => {
    const st = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return st.position === "absolute" && st.left === "0px" && Math.round(r.width) === 3 && r.height > 20;
  }));

  // the visit on site at 10 PM (away from the demo's day: no «Накладка»): recipe C (10:00 / PM), the status in words, «к оплате $123» to the office, no edge (info)
  const site = cardOf(feed, ids.site, "10:00 PM");
  await site.scrollIntoViewIfNeeded();
  const siteText = await site.innerText();
  // the 1280 row-card shows the sum alone in its value column; the label «к оплате» is on the phone and the tablet card
  const want = ["10:00", "PM", ids.site, "На месте", "$123", ...(h.layout.width >= 1280 ? [] : ["к оплате"])];
  for (const s of want) h.expect(siteText.includes(s), `visit card shows «${s}»: ${JSON.stringify(ids)} ${siteText.replace(/\n/g, " | ").slice(0, 300)}`);
  h.expect(!siteText.includes("…"), "no «…» on the card");
  h.expect(!/Накладка/.test(siteText), "the control is clean: no overlap sign");
  h.expect(!(await edgeOf(site)), "info (on site): no coloured edge");

  // the done visit (ok): no edge
  const done = cardOf(feed, ids.done, "9:00 AM");
  h.expect((await done.innerText()).includes("Готово"), "the done visit says so in words");
  h.expect(!(await edgeOf(done)), "ok (done): no coloured edge");

  // the unassigned visit tomorrow (warn): the edge, in the Feed and in «Не назначено» on top with «Назначить»
  const free = cardOf(feed, ids.free, "6:30 AM");
  h.expect(await edgeOf(free), "warn (nobody on it): the edge");
  const soon = cardOf(p.getByTestId("plan-unassigned-soon").last(), ids.free, "Завтра");
  h.expect(await edgeOf(soon), "«Не назначено»: the edge");
  h.expect((await soon.getByRole("button", { name: "Назначить" }).count()) > 0, "«Не назначено»: the action «Назначить»");

  await checkCardAlignment(h, { reference: () => feed, min: 2 });
  await h.shot("plan-cards");

  // a tech: his own visit, no sums
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/plan");
  const techSite = cardOf(p.getByTestId("plan-feed").last(), ids.site, "10:00 PM");
  await techSite.scrollIntoViewIfNeeded();
  const techText = await techSite.innerText();
  h.expect(!/\$|к оплате/.test(techText), `a tech sees no sum: ${techText.slice(0, 200)}`);
  await h.shot("plan-cards-tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
