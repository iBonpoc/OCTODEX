/**
 * «Лиды» with the open card beside the list on 1280 (docs/specs/06-list-cards.md «Панель 1280 — Лиды»; nav/listPanel.ts).
 * 1280: a tap opens the lead on the right, the list stays; `/leads?open=<id>`; ↓/↑ — the next / previous lead in the
 * order on screen, Esc closes; the address is replaced, not pushed; out of the filter — the panel stays;
 * «Открыть» — the lead's own screen. The panel draws the same body as the lead's screen: the technician sees no
 * lead cost and no estimate sums there (role check).
 * 390/820: no panel — a tap opens the lead's screen, and a link with ?open= goes to that screen.
 */
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);
const panel = (h) => h.page.getByTestId("list-panel").locator("visible=true");
const openIs = (h, id) => h.page.waitForFunction((w) => (new URLSearchParams(location.search).get("open") ?? "") === w, id, { timeout: 4000 }).then(() => true, () => false);

exports.run = async (h) => {
  const p = h.page;
  const desk = h.layout.width >= 1280;
  await h.go("/today");
  await role(h, "director");
  await h.go("/leads");
  const db = await h.db();
  const cards = p.locator('[data-testid="list-card"]:visible');
  await cards.first().waitFor();
  const labels = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const leadOf = (n) => db.leads.find((l) => n.startsWith(l.name));
  const [l0, l1] = [leadOf(labels[0]), leadOf(labels[1])];
  h.expect(l0 && l1, `two leads in the list (${labels.slice(0, 2).join(" | ")})`);

  if (!desk) {
    await cards.first().click();
    await p.waitForURL(new RegExp(`/lead/${l0.id}`));
    h.expect((await panel(h).count()) === 0, `${h.layout.width}: no panel, the lead's own screen`);
    await h.go(`/leads?open=${l1.id}`);
    await p.waitForURL(new RegExp(`/lead/${l1.id}`));
    await p.getByRole("heading", { level: 1, name: l1.name }).locator("visible=true").first().waitFor();
    return;
  }

  await h.shot("leads-list");
  const startLen = await p.evaluate(() => history.length);
  await cards.first().click();
  h.expect(await openIs(h, l0.id), `a tap opens the panel (${p.url()})`);
  await panel(h).waitFor();
  h.expect((await cards.first().getAttribute("aria-current")) === "true", "the open row is marked (aria-current)");
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
  // Esc with the status sheet of the panel open closes the sheet only
  await panel(h).getByTestId("lead-status").first().click();
  await p.locator('[aria-modal="true"]').first().waitFor();
  // the sheet takes Esc only once it has opened (its key handler mounts with the content) — CHECKS §9 п.3
  await h.sheet().getByRole("button").first().waitFor();
  await p.keyboard.press("Escape");
  await p.locator('[aria-modal="true"]').first().waitFor({ state: "detached" });
  h.expect(await openIs(h, l0.id), `Esc closed the sheet, the panel stays (${p.url()})`);
  await p.keyboard.press("Escape");
  h.expect(await openIs(h, ""), `Esc closes the panel (${p.url()})`);
  await panel(h).waitFor({ state: "detached" });

  // out of the filter: the open lead stays in the panel
  await cards.first().click();
  h.expect(await openIs(h, l0.id), "the panel again");
  // another status of the lane (empty ones are hidden)
  const lane = p.getByTestId("filter-lane").locator("visible=true").getByRole("radio");
  const before = await cards.count();
  await lane.nth(1).click();
  // wait for the list to change, then check the panel is still there
  await p.waitForFunction(([n, id]) => document.querySelectorAll('[data-testid="list-card"]').length !== n || !document.querySelector(`[data-testid="list-card"][aria-current="true"]`), [before, l0.id]);
  h.expect(await openIs(h, l0.id), `out of the filter → the panel stays (${p.url()})`);
  await panel(h).getByText(l0.name, { exact: true }).first().waitFor();
  await lane.first().click();
  await cards.first().waitFor();
  // «✕» closes too
  await p.getByTestId("list-panel-close").locator("visible=true").getByRole("button").click();
  h.expect(await openIs(h, ""), `«✕» closes the panel (${p.url()})`);

  // the link after a full reload, then «Открыть» → the lead's own screen
  await h.go(`/leads?open=${l1.id}`);
  await panel(h).getByText(l1.name, { exact: true }).first().waitFor();
  await p.getByTestId("list-panel-open").locator("visible=true").click();
  await p.waitForURL(new RegExp(`/lead/${l1.id}$`));

  // the technician: a lead of his with a paid lead cost and an estimate with a sum — no money in the panel
  const est = db.estimates.find((e) => e.leadId && e.totalCents > 0 && db.leads.some((l) => l.id === e.leadId && !["won", "lost", "closed"].includes(l.status)));
  h.expect(est, "a lead in work with an estimate that has a sum");
  await p.evaluate((lid) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.leads = raw.db.leads.map((l) => (l.id === lid ? { ...l, assigneeId: raw.db.me, costCents: 4500 } : l));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, est.leadId);
  // the office sees the cost and the estimate's sum there — so the technician's check below is not blind
  await h.go(`/leads?open=${est.leadId}`);
  await panel(h).getByText(/^Сметы/).first().click();
  await panel(h).getByTestId(`lead-estimate-${est.id}`).first().waitFor();
  h.expect(/\$\d/.test(await panel(h).innerText()), "office: money in the panel");
  await role(h, "tech");
  await h.go(`/leads?open=${est.leadId}`);
  await panel(h).waitFor();
  await panel(h).getByText(/^Сметы/).first().click();
  await panel(h).getByTestId(`lead-estimate-${est.id}`).first().waitFor();
  const txt = await panel(h).innerText();
  h.expect(!/\$\d/.test(txt), `technician: no lead cost, no estimate sums in the panel (${txt.slice(0, 200)})`);
  await h.shot("leads-panel-tech");
};
