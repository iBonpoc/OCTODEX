/**
 * e2e 555 — после «Привязать» замер говорит, что дальше (#2990, основатель 27.11: «вот я привязал чертёж к лиду Линда Альварес. Что должно
 * произойти? Непонятно»; #2994 — делать сразу на стенде). Every view.
 * - a drawn draft → «Готово» → the card → «Привязать к клиенту или лиду» → a lead that already has an estimate (not of this drawing);
 * - the card says whose it is now («Замер в карточке лида …»), that the lead already has «смета EST-… · <state> — без этого чертежа», the state
 *   chip is «Без сметы из замера» (not a bare «Без сметы»), «Открыть EST-…» opens that estimate, «Открыть лид» opens the lead — where the
 *   measurement stands on top of «Обзор», above the events;
 * - «Документы» (#2989): only «Чертёж» and «Заказ материалов» on the card; «⋯ → Документы бригады» has the cut and the shop drawings.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, openView, pressWhenStill, docsFor } = require("../gutters.cjs");
const { sheetGone } = require("../sheet.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const text = async (id) => (await tid(id).first().innerText()).replace(/\s+/g, " ");
  const waitFor = async (ok, what, tries = 400) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); v = await ok(); }
    h.expect(!!v, what);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Без срока/ }).waitFor({ timeout: 5000 });
  const d0 = await db();
  // an open lead with an estimate of its own (the seed's Linda Alvarez has EST-0006 sent)
  const est = d0.estimates.find((e) => e.leadId && e.status !== "declined" && e.number && d0.leads.some((l) => l.id === e.leadId && !["won", "lost", "declined"].includes(l.status)));
  h.expect(!!est, "the seed has an open lead with an estimate");
  const lead = d0.leads.find((l) => l.id === est.leadId);

  // a draft: one gutter, «Готово» → the card
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  await p.mouse.move(b.x + b.width * 0.2, y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(b.x + b.width * (0.2 + (0.4 * i) / 8), y);
  await p.mouse.up();
  await skipLength(p);
  await openView(p);

  // «Документы» (#2989): «Чертёж» and «Заказ материалов» only
  await tid("view-docs").waitFor({ timeout: 8000 });
  const cardDocs = await p.getByTestId("view-docs").locator("visible=true").first().locator('[data-testid^="view-doc-"]').evaluateAll((es) => es.map((e) => e.dataset.testid));
  h.expect(JSON.stringify(cardDocs) === JSON.stringify(["view-doc-client", "view-doc-shop-order"]), `the card: «Чертёж» and «Заказ материалов» only (${cardDocs})`);
  h.expect(/Чертёж/.test(await text("view-doc-client")) && /Заказ материалов/.test(await text("view-doc-shop-order")), "their names");
  await docsFor(p, "view-doc-crew");
  h.expect((await tid("view-doc-crew").count()) === 1 && (await tid("view-doc-shop").count()) === 1, "«⋯ → Документы бригады»: the cut and the shop drawings");
  await h.shot("crew-docs");
  await docsFor(p, "view-docs");
  await sheetGone(p);

  // no one yet: no «what next» line
  h.expect((await tid("view-next").count()) === 0, "a draft: no «what next» line");
  await pressWhenStill(tid("view-action-link"));
  await tid("link-sheet").waitFor({ timeout: 5000 });
  await tid("link-search").locator("input").fill(lead.name.split(" ")[0]);
  await tid(`link-lead-${lead.id}`).waitFor({ timeout: 3000 });
  await tid(`link-lead-${lead.id}`).getByRole("button").click();
  await waitFor(async () => (await tid("link-sheet").count()) === 0, "the sheet closes");
  await sheetGone(p);

  // what the card says now
  await tid("view-next").waitFor({ timeout: 5000 });
  h.expect((await text("view-next")).includes(`Замер в карточке лида ${lead.name}`), `whose it is now (${await text("view-next")})`);
  h.expect((await text("view-next-other")).includes(est.number) && /без этого чертежа/.test(await text("view-next-other")), `the lead's estimate without this drawing (${await text("view-next-other")})`);
  h.expect(/Без сметы из замера/.test(await text("view-head-status")), `the state is not a bare «Без сметы» (${await text("view-head-status")})`);
  h.expect((await tid("view-action-make").count()) === 1, "«Сделать смету» from the measurement is still the main step");
  await h.shot("after-link");

  // «Открыть лид» → the lead; back; «Открыть EST-…» → that estimate
  // #2995: the parent link of the object frame's header
  await pressWhenStill(tid("view-head-link"));
  await waitFor(() => new URL(p.url()).pathname === `/lead/${lead.id}`, `«Открыть лид» opens the lead (${p.url()})`);
  // the lead's card: the measurement's buttons on top of «Обзор», above the events (not at the very bottom)
  await tid("module-place-lead").waitFor({ timeout: 8000 });
  const mp = await tid("module-place-lead").boundingBox(), ev = await tid("lead-recent").boundingBox();
  h.expect(!!mp && !!ev && mp.y < ev.y, `the measurement is above the lead's events (${mp && Math.round(mp.y)} < ${ev && Math.round(ev.y)})`);
  await h.shot("lead");
  await p.goBack();
  // the second step is in «⋯» (one step on an object, #2995)
  await tid("view-head").waitFor({ timeout: 8000 });
  await pressWhenStill(tid("view-more").getByRole("button"));
  await p.getByRole("menuitem", { name: `Открыть ${est.number}`, exact: true }).click();
  await waitFor(() => new RegExp(`/estimate/${est.id}$`).test(new URL(p.url()).pathname), `«Открыть ${est.number}» opens it (${p.url()})`);
};
