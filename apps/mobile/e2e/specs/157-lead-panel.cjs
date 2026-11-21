/**
 * «Лиды» with the open card beside the list on 1280 (docs/specs/06-list-cards.md «Панель 1280 — Лиды»; nav/listPanel.ts).
 * 1280: a tap opens the lead on the right, the list stays; `/leads?open=<id>`; ↓/↑ — the next / previous lead in the
 * order on screen, Esc closes; the address is replaced, not pushed; out of the filter — the panel stays;
 * «Открыть» — the lead's own screen. The panel draws the lead's own content (v2 #2350: «Сейчас», the sections, the open section):
 * the technician sees no lead cost and no estimate sums (role check). Rows are v2 GroupRows `lead-row-<id>`.
 * 390/820: no panel — a tap opens the lead's screen, and a link with ?open= goes to that screen.
 */
const { escOnPage, pressEscUntilClosed } = require("../sheet.cjs");
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);
const panel = (h) => h.page.getByTestId("list-panel").locator("visible=true");
const openIs = (h, id) => h.page.waitForFunction((w) => (new URLSearchParams(location.search).get("open") ?? "") === w, id, { timeout: 4000 }).then(() => true, () => false);
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

  const desk = h.layout.width >= 1280;
  if (!desk) {
    await rows.first().click();
    await p.waitForURL(new RegExp(`/lead/${l0.id}`));
    h.expect((await panel(h).count()) === 0, `${h.layout.width}: no panel, the lead's own screen`);
    await p.getByTestId("lead-screen").locator("visible=true").first().waitFor();
    h.expect((await p.getByTestId("screen-head-big").locator("visible=true").first().innerText()).includes(l0.name), `the screen of ${l0.name}`);
    await h.go(`/leads?open=${l1.id}`);
    await p.waitForURL(new RegExp(`/lead/${l1.id}`));
    await p.getByTestId("lead-screen").locator("visible=true").first().waitFor();
  } else {
    const startLen = await p.evaluate(() => history.length);
    await rows.first().click();
    h.expect(await openIs(h, l0.id), `a tap opens the panel (${p.url()})`);
    await panel(h).waitFor();
    h.expect((await rows.first().getAttribute("aria-current")) === "true", "the open row is marked (aria-current)");
    h.expect(new URL(p.url()).pathname === "/leads", `the list stays (${p.url()})`);
    // under the title — number · source · cost · date, as under the screen's title (the office sees the cost)
    await panel(h).getByText(l0.number, { exact: false }).first().waitFor();
    await h.shot("leads-panel");
    await p.keyboard.press("ArrowDown");
    h.expect(await openIs(h, l1.id), `↓ → the next lead on screen (${p.url()})`);
    await panel(h).getByText(l1.name, { exact: true }).first().waitFor();
    await p.keyboard.press("ArrowUp");
    h.expect(await openIs(h, l0.id), `↑ → back to the first (${p.url()})`);
    h.expect((await p.evaluate(() => history.length)) === startLen, "open, ↓, ↑ replace the address, history does not grow");
    // Esc with a sheet of the panel open (its «Сейчас» card's step) closes the sheet only
    const step = panel(h).getByTestId("lead-now").getByRole("button").first();
    await step.waitFor({ timeout: 4000 });
    {
      await step.click();
      await p.locator('[aria-modal="true"]').first().waitFor();
      await h.sheet().getByRole("button").first().waitFor();
      const sheetEl = p.locator('[aria-modal="true"]').first();
      await pressEscUntilClosed(p);
      await sheetEl.waitFor({ state: "detached" });
      h.expect(await openIs(h, l0.id), `Esc closed the sheet, the panel stays (${p.url()})`);
    }
    await escOnPage(p);
    h.expect(await openIs(h, ""), `Esc closes the panel (${p.url()})`);
    await panel(h).waitFor({ state: "detached" });
    // out of the filter: the open lead stays in the panel
    await rows.first().click();
    h.expect(await openIs(h, l0.id), "the panel again");
    const chips = p.getByTestId("leads-chips").locator("visible=true").first();
    const before = await rows.count();
    await chips.getByText(/^Новые/).first().click();
    await p.waitForFunction((n) => document.querySelectorAll('[data-testid^="lead-row-"]').length !== n || !document.querySelector('[aria-current="true"]'), before);
    h.expect(await openIs(h, l0.id), `out of the filter → the panel stays (${p.url()})`);
    await panel(h).getByText(l0.name, { exact: true }).first().waitFor();
    await chips.getByText(/^Все|^Открыт/).first().click();
    await rows.first().waitFor();
    // «✕» closes too
    await p.getByTestId("list-panel-close").locator("visible=true").getByRole("button").click();
    h.expect(await openIs(h, ""), `«✕» closes the panel (${p.url()})`);
    // the link after a full reload, then «Открыть» → the lead's own screen
    await h.go(`/leads?open=${l1.id}`);
    await panel(h).getByText(l1.name, { exact: true }).first().waitFor();
    await p.getByTestId("list-panel-open").locator("visible=true").click();
    await p.waitForURL(new RegExp(`/lead/${l1.id}$`));
  }

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
