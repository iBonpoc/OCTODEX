/**
 * The panel on 1280, its debts (docs/specs/06-list-cards.md «панель 1280 — долги №7»):
 * ↓/↑ scroll the list to the open row when it went past the edge; the client's panel has «Изменить» and «＋» as the
 * client's screen; the open card out of the filter is marked «Нет в списке — другой фильтр».
 * All widths: the lead's five tabs stay inside the screen (and inside the 360 panel) — they scroll sideways.
 */
const { waited } = require("../sheet.cjs");
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);
const panel = (h) => h.page.getByTestId("list-panel").locator("visible=true");
const openIs = (h, id) => h.page.waitForFunction((w) => (new URLSearchParams(location.search).get("open") ?? "") === w, id, { timeout: 4000 }).then(() => true, () => false);

/** the lead's last tab «Файлы», tapped: it is inside `box` (the screen or the panel) */
async function filesTabInside(h, scope, outer, where) {
  let box = outer;
  const tab = scope.getByRole("tab", { name: /^Файлы/ }).first();
  await tab.click();
  const b = await tab.boundingBox();
  // the content's gutter (space[4] = 16) on both sides: a tab past it is cut by the capsule's end
  box = { x: box.x + 16, width: box.width - 32 };
  h.expect(b && b.x >= box.x - 1 && b.x + b.width <= box.x + box.width + 1, `${where}: «Файлы» inside (${JSON.stringify(b)} in ${JSON.stringify(box)})`);
}

exports.run = async (h) => {
  const p = h.page;
  const desk = h.layout.width >= 1280;
  await h.go("/today");
  await role(h, "director");
  await h.go("/leads");
  const db = await h.db();
  // a lead with estimates: «Сметы · N» makes the tabs longest
  const est = db.estimates.find((e) => e.leadId && db.leads.some((l) => l.id === e.leadId));
  const lead = db.leads.find((l) => l.id === est?.leadId);
  h.expect(lead, "a lead with an estimate");

  if (!desk) {
    await h.go(`/lead/${lead.id}`);
    await filesTabInside(h, p, { x: 0, width: h.layout.width }, `${h.layout.width}: the lead's screen`);
    await h.shot("lead-tabs");
    return;
  }

  // the lead's tabs in the 360 panel
  await h.go(`/leads?open=${lead.id}`);
  await panel(h).waitFor();
  await filesTabInside(h, panel(h), await panel(h).boundingBox(), "1280 panel");
  await h.shot("lead-tabs-panel");

  // ↓ to the last client of a short window: the open row is scrolled into view
  await p.setViewportSize({ width: h.layout.width, height: 420 });
  await h.go("/clients");
  const cards = p.locator('[data-testid="list-card"]:visible');
  await cards.first().waitFor();
  const n = await cards.count();
  h.expect(n >= 4, `enough clients to pass the edge (${n})`);
  const last = cards.nth(n - 1);
  const lb0 = await last.boundingBox();
  h.expect(lb0 && lb0.y + lb0.height > 420, `before ↓ the last row is past the edge (${JSON.stringify(lb0)})`);
  const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const idOf = (label) => db.customers.find((c) => label.startsWith(c.name))?.id;
  await cards.first().click();
  await panel(h).waitFor();
  // one step at a time: each ↓ waits for its own address
  for (let i = 1; i < n; i++) {
    await p.keyboard.press("ArrowDown");
    h.expect(await openIs(h, idOf(ids[i])), `↓ ${i} → ${ids[i].slice(0, 30)}`);
  }
  h.expect(await waited(p.waitForFunction(() => {
    const r = [...document.querySelectorAll('[data-testid="list-card"][aria-current="true"]')].find((x) => x.offsetParent !== null);
    if (!r) return false;
    const b = r.getBoundingClientRect();
    return b.top >= 0 && b.bottom <= window.innerHeight;
  }, null, { timeout: 4000 })), "the current row is scrolled into view");
  h.expect((await last.getAttribute("aria-current")) === "true", "↓ reached the last client");
  const lb = await last.boundingBox();
  h.expect(lb && lb.y >= 0 && lb.y + lb.height <= 420 + 1, `the last row is scrolled into view (${JSON.stringify(lb)})`);
  await p.setViewportSize({ width: h.layout.width, height: h.layout.height ?? 900 });

  // the client's panel: «Изменить», no «＋» — as on the client's screen (prototype v6, #1343); one column of cards
  const owes = db.customers.find((c) => db.invoices.some((i) => i.customerId === c.id && !i.void && i.totalCents > i.paidCents));
  const quiet = db.customers.find((c) => c.status !== "archived" && c.status !== "prospect" && c.id !== owes?.id && !db.invoices.some((i) => i.customerId === c.id && !i.void && i.totalCents > i.paidCents));
  h.expect(quiet, "a client who owes nothing");
  await h.go(`/clients?open=${quiet.id}`);
  await panel(h).waitFor();
  h.expect((await panel(h).getByTestId("fab-header").count()) === 0, "no «＋» in the client's panel");
  h.expect((await panel(h).getByTestId("list-panel-edit").count()) === 1, "«Изменить» in the panel's header");
  // 360 is one column: a property card is as wide as the panel's content, not split in two (#1343 review)
  const card = await panel(h).locator('[data-testid^="client-property-"]').locator("visible=true").first().boundingBox().catch(() => null);
  const box = await panel(h).boundingBox();
  if (card && box) h.expect(card.width > box.width * 0.7, `one column in the panel (card ${Math.round(card.width)} of ${Math.round(box.width)})`);
  // the open tab lives in the address beside ?open= (#1417 review): it survives «Назад» like on the client's screen
  const jobsPill = panel(h).getByTestId("client-tabs-jobs").locator("visible=true").first();
  await jobsPill.scrollIntoViewIfNeeded();
  await jobsPill.click();
  await p.waitForFunction(() => /[?&]tab=jobs\b/.test(location.search) && /[?&]open=/.test(location.search), null, { timeout: 4000 });
  await panel(h).getByTestId("client-tab-jobs").locator("visible=true").first().waitFor({ timeout: 4000 });
  await panel(h).getByTestId("client-tabs-overview").locator("visible=true").first().click();
  h.expect((await panel(h).getByTestId("list-panel-outside").count()) === 0, "in the list: no «not in the list» mark");

  // out of the filter: the panel says so; back to «Все» — the mark is gone
  await p.getByTestId("filter-lane").locator("visible=true").getByRole("radio", { name: /^Должны/ }).first().click();
  await panel(h).getByTestId("list-panel-outside").waitFor();
  await h.shot("panel-outside");
  await p.getByTestId("filter-lane").locator("visible=true").getByRole("radio", { name: /^Все/ }).first().click();
  await panel(h).getByTestId("list-panel-outside").waitFor({ state: "detached" });
  h.expect(await openIs(h, quiet.id), "the same client stays open");

  await panel(h).getByTestId("list-panel-edit").getByRole("button").first().click();
  await p.waitForURL(new RegExp(`/client/edit\\?id=${quiet.id}`));

  // the technician: no «Изменить» in the panel (as on the screen)
  await role(h, "tech");
  await h.go("/clients");
  const techCards = p.locator('[data-testid="list-card"]:visible');
  await techCards.first().click();
  await panel(h).waitFor();
  h.expect((await panel(h).getByTestId("list-panel-edit").count()) === 0, "technician: no «Изменить» in the panel");
};
