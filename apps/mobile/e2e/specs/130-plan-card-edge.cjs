const { planShowDone } = require("../planFilters.cjs");
const { addDays, atMinute, todayKey } = require("../companyTime.cjs");
/**
 * The coloured edge of a list card only for warn / bad (docs/specs/06-list-cards.md §7.3, step 10а PR A), every view
 * (3 widths × 2 themes), on the Plan's Feed (its cards are ItemCard; the look of the Feed is kept, 24 §B):
 * - an «on site» visit (info) and a done one (ok) — no edge; the status is still in words on the chip;
 * - a visit with nobody on it (warn) — the edge stays, in the Feed and in «Не назначено» on top.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const today = todayKey();
  const at = { late: atMinute(today, 22 * 60), nine: atMinute(today, 9 * 60), six: atMinute(addDays(today, 1), 6 * 60 + 30) };
  const names = await p.evaluate((at) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const me = raw.db.me;
    // three properties of three different clients: a card is found by «time · client»
    const seen = new Set();
    const [p1, p2, p3] = raw.db.properties.filter((x) => !seen.has(x.customerId) && seen.add(x.customerId));
    const base = { scope: [], checklist: [], photos: [], durationMin: 60, kind: "inspection", techId: null, amountDueCents: 0 };
    raw.db.visits = [
      ...raw.db.visits,
      // 10 PM: away from the demo's day, so no «Накладка» (warn) on it
      { ...base, id: "v130-site", propertyId: p1.id, assigneeIds: [me], start: at.late, step: "on_site" },
      { ...base, id: "v130-done", propertyId: p2.id, assigneeIds: [me], start: at.nine, step: "done" },
      { ...base, id: "v130-free", propertyId: p3.id, assigneeIds: [], start: at.six, step: "scheduled" },
    ];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("feed"));
    const name = (pr) => raw.db.customers.find((c) => c.id === pr.customerId)?.name;
    return { site: name(p1), done: name(p2), free: name(p3) };
  }, at);
  await h.go("/plan");
  const feed = p.getByTestId("plan-feed").last();
  await feed.waitFor();
  await planShowDone(p, true);

  // the card of a title: the nearest ancestor that has the edge strip, or the card frame (rounded, bordered) if none.
  // The edge is an absolute 3-px strip on the card's left side (component.statusEdge, Card in ui/surfaces.tsx).
  const edgeOf = (loc) => loc.first().evaluate((el) => {
    const isEdge = (n) => {
      const st = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      return st.position === "absolute" && st.left === "0px" && Math.round(r.width) === 3 && r.height > 20;
    };
    for (let n = el, i = 0; n && i < 10; n = n.parentElement, i++) {
      if ([...n.children].some(isEdge)) return true;
      if (getComputedStyle(n).borderTopLeftRadius !== "0px" && getComputedStyle(n).borderTopWidth !== "0px" && n.getBoundingClientRect().width > 250) return false;
    }
    return false;
  });
  const title = (root, time, name) => root.getByText(`${time} · ${name}`, { exact: true });

  const site = title(feed, "10:00 PM", names.site);
  await site.first().scrollIntoViewIfNeeded();
  h.expect((await site.count()) > 0, `the on-site visit is in the Feed (${names.site})`);
  h.expect(!(await edgeOf(site)), "info (on site): no coloured edge");
  await h.expectText(/На месте/, "the status is still in words on the chip");

  const done = title(feed, "9:00 AM", names.done);
  h.expect((await done.count()) > 0, `the done visit is in the Feed (${names.done})`);
  h.expect(!(await edgeOf(done)), "ok (done): no coloured edge");

  // the control: warn keeps the edge (the check is not blind)
  const free = title(feed, "6:30 AM", names.free);
  h.expect((await free.count()) > 0, `the unassigned visit is in the Feed (${names.free})`);
  h.expect(await edgeOf(free), "warn (nobody on it): the edge stays in the Feed");
  const soon = title(p.getByTestId("plan-unassigned-soon").last(), "6:30 AM", names.free);
  h.expect(await edgeOf(soon), "warn: the edge stays in «Не назначено» on top");
  await h.shot("plan-edge");
};
