/**
 * e2e 154 — «Сделать смету / Перенести изменения в смету» из замера (через «Просмотр замера», #698 #699) (docs/specs/33-gutters-estimate.md П23.8, M8b; стык S5g). Every view.
 * - #3027 (founder 26.11, #3047 А): a lead → «Замер» → a run → «Готово»: the estimate comes by itself, a draft, its section «Gutters · по
 *   замеру …» in the client's language; the measurement is ready; the editor has the lines, each marked «Из замера»;
 * - a hand price on one line (the line sheet says «Перенести изменения в смету» keeps what you change) → saved;
 * - the review: «Открыть смету» (nothing changed, the estimates listed); a second run → «Готово» → the DRAFT follows by itself (spec 70
 *   §4.4): the hand price stays, the line's quantity grows (S5g: hand changes and own lines are never touched);
 * - the lead has «Смета из замера»: nothing changed → it opens the same estimate, never a second one.
 * Finds things by testID; waits on what it checks (CHECKS §9).
 */
const { skipLength, openView, backToCanvas, savedOnce, showSection } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 60) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const drawRun = async (at) => {
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * at;
    const a = [b.x + b.width * 0.25, y], z = [b.x + b.width * 0.7, y];
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((z[0] - a[0]) * i) / 12, y);
    await p.mouse.up();
    await skipLength(p);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const gutters = async () => (await db())?.moduleData?.gutters ?? { measurements: [], elements: [] };
  const ofM = (l, mid) => l.source && l.source.module === "gutters" && l.source.measurementId === mid;
  const estimatesOf = async (mid) => ((await db())?.estimates ?? []).filter((e) => (e.doc?.options ?? []).some((o) => o.lines.some((l) => ofM(l, mid))));
  const lineOf = async (estimateId, lineId) => {
    const e = ((await db())?.estimates ?? []).find((x) => x.id === estimateId);
    return e?.doc?.options?.[0]?.lines?.find((l) => l.id === lineId);
  };

  await h.go("/today");
  // a lead with nothing open of its own (#3027: «Готово» makes a NEW estimate for it — a lead with an open one gets the drawing in it, e2e 556)
  const d0 = await db();
  const free = (l) => !d0.estimates.some((e) => e.status !== "declined" && ((e.leadId && e.leadId === l.id) || (l.propertyId && e.propertyId === l.propertyId)));
  const lead = d0.leads.find((l) => free(l) && !["won", "lost", "declined"].includes(l.status));
  h.expect(!!lead, "the demo has a lead with no estimate");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => !!(await db())?.company?.modules?.gutters?.enabled, "the trial is on");

  // the lead → «Замер» → a run → «Готово»: the estimate comes BY ITSELF (#3027, founder 26.11: «если замер уже есть, то смета уже должна
  // быть автоматически сделана»), a draft; the card stays, its step is «Открыть смету» — no «Сделать смету» to press
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-measure").waitFor({ timeout: 8000 });
  await tid("module-gutters-measure").getByRole("button").click();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun(0.4);
  await savedOnce(p); // saved into the phone (no cloud mark any more, #1274)
  await waitFor(() => !!new URL(p.url()).searchParams.get("m"), "saved: the address names the measurement");
  const mid = new URL(p.url()).searchParams.get("m");
  await openView(p);
  await waitFor(async () => (await estimatesOf(mid)).length === 1, "«Готово»: the estimate came by itself");
  const eid = (await estimatesOf(mid))[0].id;
  h.expect((await estimatesOf(mid))[0].status === "draft", "a draft");
  await tid("view-action-open").waitFor({ timeout: 8000 });
  h.expect((await tid("view-action-make").count()) === 0 && (await tid("view-stale").count()) === 0, "nothing to press: no «Сделать смету», nothing to move");
  await waitFor(async () => (await gutters()).measurements.some((m) => m.id === mid && m.status === "ready"), "the measurement is ready");
  await h.shot("view-auto");
  // its lines are the section «Водостоки (Gutters) · по замеру …» of the estimate (spec 70 §4.3)
  const e0 = (await estimatesOf(mid))[0];
  const sec = (e0.doc.options[0].sections || []).find((x) => x.id === `gutters:${mid}`);
  h.expect(!!sec && /^Gutters · (per measurement|по замеру|según medición) \d\d\/\d\d\/\d{4}$/.test(sec.title), `the measurement's section, in the client's language (${sec && sec.title})`);
  h.expect(e0.doc.options[0].lines.filter((l) => ofM(l, mid)).every((l) => l.sectionId === sec.id), "its lines in it");
  await h.go(`/estimate/new?id=${encodeURIComponent(eid)}`);
  await p.locator('[data-testid^="ue-line-mark-module-"]').locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.shot("estimate");

  // a hand price on the gutter line
  const est = (await estimatesOf(mid))[0];
  const g = est.doc.options[0].lines.find((l) => ofM(l, mid) && l.source.section === "gutter");
  h.expect(!!g, "a gutter line");
  const q1 = Number(g.quantity);
  await tid(`ue-line-marks-${g.id}`).click();
  await tid("ue-line-source-hint").waitFor({ timeout: 5000 });
  await tid(`est-price-${g.id}`).locator("input").fill("99");
  await tid(`est-collapse-${g.id}`).getByRole("button").click();
  await waitFor(async () => (await tid("ue-line-source-hint").count()) === 0, "the row closed");
  await tid("ue-save").click(); // v2: the bar's MainStep «Готово» — the testID is on the button itself
  await waitFor(async () => (await lineOf(eid, g.id))?.unitPriceCents === 9900, "the hand price is saved");

  // the review: nothing changed → «Открыть смету»; «Править чертёж», another run → «Готово» → a DRAFT follows the drawing by itself
  // (#3027, spec 70 §4.4): the hand price stays, the quantity grows — no «Перенести изменения» to press
  await h.go(`/module/gutters/view?m=${encodeURIComponent(mid)}`);
  await tid("view-action-open").waitFor({ timeout: 8000 });
  h.expect((await tid("view-action-update").count()) === 0 && (await tid("view-stale").count()) === 0, "nothing changed: no «Перенести изменения»");
  await showSection(p, "view-estimates"); // #3028: on «Сметы»
  h.expect((await tid("view-estimates").count()) === 1, "the estimates of the measurement under it (#707)");
  await backToCanvas(p);
  await drawRun(0.6);
  await openView(p);
  await waitFor(async () => {
    const l = await lineOf(eid, g.id);
    return l && l.unitPriceCents === 9900 && Number(l.quantity) > q1;
  }, "«Готово»: the draft followed the drawing — the hand price stays, the quantity grows");
  await tid("view-action-open").waitFor({ timeout: 8000 });
  h.expect((await tid("view-action-update").count()) === 0, "nothing to press");
  await h.shot("view-auto-update");
  h.expect((await estimatesOf(mid)).length === 1, "one estimate of the measurement");
  await waitFor(async () => (await gutters()).measurements.some((m) => m.id === mid && m.status === "ready"), "ready again");

  // the lead: «Смета из замера» → the review opens and, nothing changed, opens the same estimate (once)
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-estimate").waitFor({ timeout: 8000 });
  await h.shot("lead");
  await tid("module-gutters-estimate").getByRole("button").click();
  await p.waitForURL(new RegExp(`/estimate/${eid}$`), { timeout: 8000 });
  h.expect((await estimatesOf(mid)).length === 1, "«Смета из замера» made no second estimate");
};
