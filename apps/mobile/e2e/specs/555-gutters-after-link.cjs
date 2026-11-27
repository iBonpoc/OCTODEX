/**
 * e2e 555 — после «Привязать» замер говорит, что дальше (#2990, основатель 27.11: «вот я привязал чертёж к лиду Линда Альварес. Что должно
 * произойти? Непонятно»; #2994 — делать сразу на стенде). Every view.
 * - a drawn draft → «Готово» → the card → «Привязать к клиенту или лиду» → a lead that already has an estimate (not of this drawing);
 * - #3048 А (founder 26.11): the drawing goes INTO the lead's open estimate by itself — its section «Gutters · по замеру …», the estimate's
 *   own lines stay, no second estimate; the card's step is «Открыть смету» (it opens that estimate); «Лид» opens the lead — where the
 *   measurement stands on top of «Обзор», above the events;
 * - #3028: the card is the object frame — the name, «Замер · лид», «Сейчас» with the step, the sections; «Документы» (#2989) on «Сметы»: only «Чертёж» and «Заказ материалов» on the card; «⋯ → Документы бригады» has the cut and the shop drawings.
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

  // #3028: the card's sections «Обзор · Фото · Сметы · История»; «Документы» (#2989) are on «Сметы»: «Чертёж» and «Заказ материалов» only
  await p.getByRole("tab", { name: /^Сметы/ }).first().click();
  await tid("view-docs").waitFor({ timeout: 8000 });
  const cardDocs = await p.getByTestId("view-docs").locator("visible=true").first().locator('[data-testid^="view-doc-"]').evaluateAll((es) => es.map((e) => e.dataset.testid));
  h.expect(JSON.stringify(cardDocs) === JSON.stringify(["view-doc-client", "view-doc-shop-order"]), `the card: «Чертёж» and «Заказ материалов» only (${cardDocs})`);
  h.expect(/Чертёж/.test(await text("view-doc-client")) && /Заказ материалов/.test(await text("view-doc-shop-order")), "their names");
  await docsFor(p, "view-doc-crew");
  h.expect((await tid("view-doc-crew").count()) === 1 && (await tid("view-doc-shop").count()) === 1, "«⋯ → Документы бригады»: the cut and the shop drawings");
  await h.shot("crew-docs");
  await docsFor(p, "view-docs");
  await sheetGone(p);

  // no one yet: «Сейчас» says so, its one step is «Привязать…»
  h.expect(/без клиента/.test(await text("view-now")), `a draft: «Сейчас» says it has no client (${await text("view-now")})`);
  await pressWhenStill(tid("view-action-link"));
  await tid("link-sheet").waitFor({ timeout: 5000 });
  await tid("link-search").locator("input").fill(lead.name.split(" ")[0]);
  await tid(`link-lead-${lead.id}`).waitFor({ timeout: 3000 });
  await tid(`link-lead-${lead.id}`).getByRole("button").click();
  await waitFor(async () => (await tid("link-sheet").count()) === 0, "the sheet closes");
  await sheetGone(p);

  // what the card says now: the lead's name on top, «Замер · лид»; #3048 А (founder 26.11: «надо делать в ту же смету»): the drawing went INTO
  // the lead's estimate by itself — its section «Gutters · по замеру …», one estimate for the job (not a second one, not «без этого чертежа»)
  await waitFor(async () => (await text("screen-title")).includes(lead.name), "the lead's name on top");
  h.expect(/Замер · лид/.test(await text("screen-head-big")), `«Замер · лид» (${await text("screen-head-big")})`);
  const mid = new URL(p.url()).searchParams.get("m");
  const ofM = (l) => l.source && l.source.module === "gutters" && l.source.measurementId === mid;
  await waitFor(async () => {
    const e = (await db()).estimates.find((x) => x.id === est.id);
    const o = e?.doc?.options?.[0];
    return !!o && o.lines.some(ofM) && (() => { const sid = o.lines.find(ofM).sectionId; return !!sid && o.lines.filter(ofM).every((l) => l.sectionId === sid) && (o.sections || []).some((x) => x.id === sid); })();
  }, `the drawing is in ${est.number}, its own section`);
  const after = await db();
  h.expect(after.estimates.filter((e) => e.leadId === lead.id && e.status !== "declined").length === d0.estimates.filter((e) => e.leadId === lead.id && e.status !== "declined").length, "no second estimate for the lead");
  // a sent one is saved as its new version (the core gives the lines new ids, reIdDoc): its own lines stay — by what they are
  const key = (l) => `${l.name}|${l.quantity}|${l.unitPriceCents}`;
  const before = d0.estimates.find((e) => e.id === est.id).doc.options[0].lines.map(key);
  const now = after.estimates.find((e) => e.id === est.id).doc.options[0].lines.map(key);
  h.expect(before.every((k) => now.includes(k)), "the estimate's own lines stay");
  await tid("view-action-open").waitFor({ timeout: 8000 });
  h.expect((await tid("view-action-make").count()) === 0 && (await tid("view-open-other").count()) === 0, "no «Сделать смету», no «другая смета»: it is this one");
  await h.shot("after-link");

  // «Лид» → the lead; back; «Открыть смету» → that estimate
  // #3028: «Лид» is a place in the row of actions (no loose «Открыть лид ›» line)
  await pressWhenStill(tid("view-open-who"));
  await waitFor(() => new URL(p.url()).pathname === `/lead/${lead.id}`, `«Открыть лид» opens the lead (${p.url()})`);
  // the lead's card: the measurement's buttons on top of «Обзор», above the events (not at the very bottom)
  await tid("module-place-lead").waitFor({ timeout: 8000 });
  const mp = await tid("module-place-lead").boundingBox(), ev = await tid("lead-recent").boundingBox();
  h.expect(!!mp && !!ev && mp.y < ev.y, `the measurement is above the lead's events (${mp && Math.round(mp.y)} < ${ev && Math.round(ev.y)})`);
  await h.shot("lead");
  await p.goBack();
  await tid("view-action-open").waitFor({ timeout: 8000 });
  await pressWhenStill(tid("view-action-open"));
  await waitFor(() => new RegExp(`/estimate/${est.id}$`).test(new URL(p.url()).pathname), `«Открыть смету» opens ${est.number} (${p.url()})`);
};
