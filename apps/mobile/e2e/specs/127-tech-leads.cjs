/**
 * e2e 127 — «Лиды» of the technician (docs/specs/13 §2.3, §4; spec 14 §6.4): his own leads only — assigned to him or
 * brought by him (canSeeLead, RLS leads_select). Every view. Demo «me» is Alex (as in e2e 15).
 * - the director hands l2 to Ivan (the lead's «Кто ведёт»);
 * - tech: «Лиды» is in «Ещё» (phone) / the side menu (820/1280) and opens /leads; l1 (his) is there, l2 (Ivan's) is not;
 *   no «Ответственный» / «Источник» in the filter, no lead price; a lead's «‹ назад» goes to «Лиды», not «Главная»;
 * - /inbox (the office's old address) stays closed to him.
 * The subcontractor (no «Лиды») is the unit test sections.test.ts: in the demo «me» is never a subcontractor.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;
const { menuApi } = require("../menu.cjs");

exports.run = async (h) => {
  const p = h.page;
  const m = menuApi(h);
  const waitDb = async (ok, what) => {
    let db = await h.db();
    for (let i = 0; i < 30 && !(db && ok(db)); i++) { await p.waitForTimeout(200); db = await h.db(); }
    h.expect(!!db && ok(db), what);
    return db;
  };

  // the director hands l2 to Ivan
  await h.go("/today");
  await setRole(h, "director");
  await h.go("/lead/l2");
  await h.clickText("Обзор");
  await p.getByRole("button", { name: "Alex Petrov" }).last().click();
  await h.sheet().getByRole("button", { name: "Ivan Sokolov" }).waitFor({ timeout: 3000 });
  await h.sheet().getByRole("button", { name: "Ivan Sokolov" }).click();
  const db = await waitDb((d) => d.leads.find((l) => l.id === "l2")?.assigneeId === "m-ivan", "l2 is Ivan's");
  const l1 = db.leads.find((l) => l.id === "l1");
  const l2 = db.leads.find((l) => l.id === "l2");
  h.expect(l1.assigneeId === db.me, "l1 is the tech's (demo «me»)");

  // the technician: «Лиды» in the menu → /leads
  await setRole(h, "tech");
  await h.go("/visits");
  await m.open();
  const item = m.menu().getByRole("button", { name: "Лиды", exact: true });
  h.expect((await item.count()) === 1, "the tech has «Лиды» in the menu");
  if (m.phone) await h.shot("more-tech");
  await item.click();
  await p.waitForURL(/\/leads/, { timeout: 5000 });
  h.expect(path(h) === "/leads", `«Лиды» opens /leads for the tech (${p.url()})`);
  await p.getByRole("button", { name: l1.name }).first().waitFor({ timeout: 5000 });
  h.expect((await p.getByRole("button", { name: l2.name }).locator("visible=true").count()) === 0, `Ivan's lead is not on the tech's list (${l2.name})`);
  // the price paid for a lead (canSeeLeadCost) is the office's; the client's budget may show
  const text = await h.text();
  for (const l of db.leads.filter((x) => x.costCents && (x.assigneeId === db.me || x.createdBy === db.me))) {
    const usd = String(l.costCents / 100);
    h.expect(!text.includes(`$${usd}`), `no lead price ($${usd}) on the tech's list`);
  }
  await h.shot("leads-tech");

  // the filter: no office groups
  const fb = p.getByTestId("filter-button").locator("visible=true");
  if (await fb.count()) {
    await fb.first().click();
    await p.waitForTimeout(300);
    const sheet = await h.text();
    h.expect(!/Ответственный/.test(sheet) && !/Источник/.test(sheet), "no «Ответственный» / «Источник» for the tech");
    await pressEscUntilClosed(p);
  } else {
    // the tech's bar has no office groups at all: no button to open them, none standing open in the bar (1280). Found by
    // #800: this check used to be skipped silently at every width.
    h.expect((await p.locator('[data-testid^="filter-group-"]').locator("visible=true").count()) === 0, "no filter groups for the tech (neither behind a button nor open in the bar)");
  }

  // his lead goes up to «Лиды»
  await h.go("/lead/l1");
  await p.getByText(l1.name).first().waitFor({ timeout: 5000 });
  const up = p.getByRole("link", { name: "Лиды", exact: true }).or(p.getByRole("button", { name: /Лиды/ })).locator("visible=true");
  h.expect((await up.count()) >= 1, "the lead's crumb / «‹ назад» names «Лиды»");
  await up.first().click();
  await p.waitForURL(/\/leads/, { timeout: 5000 });
  h.expect(path(h) === "/leads", `back from the lead → /leads (${p.url()})`);

  // B3 (06 «Серия B»): the lead's estimates are compact cards — the tech sees what and its status, never the sum
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const e = raw.db.estimates.find((x) => x.totalCents > 0);
    // the tech's own (#1138: he sees an estimate he made, or one at a property of his visit — as the server)
    raw.db.estimates = [...raw.db.estimates, { ...e, id: "e127", leadId: "l1", title: "E127 water heater", number: "EST-0127", createdBy: raw.db.me }];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/lead/l1");
  // the tab reads «Сметы · N» (the side menu at 820/1280 has a bare «Сметы»)
  await p.getByText(/^Сметы · \d+$/).locator("visible=true").last().click();
  const est = p.getByTestId("lead-estimate-e127").locator("visible=true");
  await est.first().waitFor({ timeout: 5000 });
  const card = await est.first().innerText();
  h.expect(/E127 water heater/.test(card) && !/\$/.test(card), `the tech: the lead's estimate card has no sum (${card.replace(/\n/g, " | ")})`);
  await p.getByText("Обзор", { exact: true }).locator("visible=true").first().click();
  await p.waitForTimeout(300);
  // the other side: the office sees the sum on the same card
  await setRole(h, "director");
  await h.go("/lead/l1");
  await p.getByText(/^Сметы · \d+$/).locator("visible=true").last().click();
  await est.first().waitFor({ timeout: 5000 });
  h.expect(/\$/.test(await est.first().innerText()), "the director: the lead's estimate card has the sum");
  await p.getByText("Обзор", { exact: true }).locator("visible=true").first().click();
  await p.waitForTimeout(300);
  await setRole(h, "tech");

  // Ivan's lead stays closed; /inbox stays the office's
  await h.go("/lead/l2");
  await h.expectText(/Этот лид ведёт другой человек/, "the tech cannot open Ivan's lead");
  await h.go("/inbox");
  await p.waitForTimeout(500);
  h.expect(path(h) === "/visits", `/inbox → /visits for the tech (${path(h)})`);
  await setRole(h, "director");
};
