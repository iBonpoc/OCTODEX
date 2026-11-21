/**
 * «Лиды» rows and the lead's screen, every view (was the 1280 panel beside the list, docs/specs/06-list-cards.md «Панель 1280 —
 * Лиды»). v2 (#2350, the List template; leads.tsx «`?open=<id>` (the 1280 panel) opens the lead's screen»): the leads list has no
 * panel on any width — a row (`lead-row-<id>`) opens the lead's own screen, and an old link `/leads?open=<id>` opens it too, the
 * list behind it. The lead's screen draws the same body for every role: the technician sees no lead cost and no estimate sums
 * (role check), the office sees them.
 */
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);
const ROWS = '[data-testid^="lead-row-"]:not([data-testid^="lead-row-tel-"]):not([data-testid^="lead-row-sms-"]):not([data-testid^="lead-row-call-"]):not([data-testid^="lead-row-archive-"]):not([data-testid^="lead-row-reopen-"]):not([data-testid$="-swipe"]):visible';

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await role(h, "director");
  await h.go("/leads");
  const db = await h.db();
  const rows = p.locator(ROWS);
  await rows.first().waitFor();
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").slice("lead-row-".length)));
  const [l0, l1] = ids.map((id) => db.leads.find((l) => l.id === id));
  h.expect(l0 && l1, `two leads in the list (${ids.slice(0, 2).join(" | ")})`);
  await h.shot("leads-list");

  // a row opens the lead's screen (no panel on any width)
  await rows.first().click();
  await p.waitForURL(new RegExp(`/lead/${l0.id}`));
  h.expect((await p.getByTestId("list-panel").locator("visible=true").count()) === 0, `${h.layout.width}: no panel, the lead's own screen`);
  await p.getByTestId("lead-screen").locator("visible=true").first().waitFor();
  h.expect((await p.getByTestId("screen-head-big").locator("visible=true").first().innerText()).includes(l0.name), `the screen of ${l0.name}`);
  // an old link with ?open=: the lead's screen
  await h.go(`/leads?open=${l1.id}`);
  await p.waitForURL(new RegExp(`/lead/${l1.id}`));
  await p.getByTestId("lead-screen").locator("visible=true").first().waitFor();

  // the technician: a lead of his with a paid lead cost and an estimate with a sum — no money on its screen
  const est = db.estimates.find((e) => e.leadId && e.totalCents > 0 && db.leads.some((l) => l.id === e.leadId && !["won", "lost", "closed"].includes(l.status)));
  h.expect(est, "a lead in work with an estimate that has a sum");
  await p.evaluate((lid) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.leads = raw.db.leads.map((l) => (l.id === lid ? { ...l, assigneeId: raw.db.me, costCents: 4500 } : l));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, est.leadId);
  const estimates = async () => {
    await h.go(`/lead/${est.leadId}?tab=estimates`);
    await p.getByTestId(`lead-estimate-${est.id}`).locator("visible=true").first().waitFor();
    return p.getByTestId("lead-estimates").locator("visible=true").first().innerText();
  };
  // the office sees the estimate's sum — so the technician's check below is not blind
  h.expect(/\$\d/.test(await estimates()), "office: money on the lead");
  await role(h, "tech");
  const txt = await estimates();
  h.expect(!/\$\d/.test(txt), `technician: no lead cost, no estimate sums (${txt.slice(0, 200)})`);
  await h.go(`/lead/${est.leadId}`);
  await p.getByTestId("lead-work").locator("visible=true").first().waitFor();
  h.expect(!/\$\d/.test(await p.getByTestId("lead-work").locator("visible=true").first().innerText()), "technician: no lead cost in «Кто ведёт»");
  await h.shot("lead-tech");
};
