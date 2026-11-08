/**
 * e2e 154 — «Смета / Обновить смету» из замера (docs/specs/33-gutters-estimate.md П23.8, M8b; стык S5g). Every view.
 * - a lead → «Замер» → a run → «Смета»: the estimate editor opens with the measurement's lines, each marked «Из замера»;
 *   the measurement is ready, a revision is queued;
 * - a hand price on one line (the line sheet says «Обновить смету» keeps what you change) → saved;
 * - back on the canvas: «Открыть смету» (nothing changed); a second run → «Обновить смету» → the same estimate: the hand
 *   price stays, the line's quantity grows (S5g: hand changes and own lines are never touched);
 * - the lead has «Смета из замера»: nothing changed → it opens the same estimate, never a second one.
 * Finds things by testID; waits on what it checks (CHECKS §9).
 */
const { skipLength } = require("../gutters.cjs");
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
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  h.expect(!!lead, "the demo has a lead");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => !!(await db())?.company?.modules?.gutters?.enabled, "the trial is on");

  // the lead → «Замер» → a run → «Смета»
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-measure").waitFor({ timeout: 8000 });
  await tid("module-gutters-measure").getByRole("button").click();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun(0.4);
  await tid("draw-saved").waitFor({ timeout: 5000 });
  await waitFor(() => !!new URL(p.url()).searchParams.get("m"), "saved: the address names the measurement");
  const mid = new URL(p.url()).searchParams.get("m");
  await tid("draw-estimate-make").waitFor({ timeout: 5000 });
  await h.shot("canvas-make");
  await tid("draw-estimate-make").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  const eid = new URL(p.url()).searchParams.get("id");
  await p.locator('[data-testid^="ue-line-mark-module-"]').locator("visible=true").first().waitFor({ timeout: 8000 });
  await waitFor(async () => (await estimatesOf(mid)).some((e) => e.id === eid), "the estimate has the measurement's lines");
  await waitFor(async () => (await gutters()).measurements.some((m) => m.id === mid && m.status === "ready"), "the measurement is ready");
  await h.shot("estimate");

  // a hand price on the gutter line
  const est = (await estimatesOf(mid))[0];
  const g = est.doc.options[0].lines.find((l) => ofM(l, mid) && l.source.section === "gutter");
  h.expect(!!g, "a gutter line");
  const q1 = Number(g.quantity);
  await tid(`ue-line-marks-${g.id}`).click();
  await tid("ue-line-source-hint").waitFor({ timeout: 5000 });
  await tid("ue-line-price").locator("input").fill("99");
  await tid("ue-line-save").getByRole("button").click();
  await waitFor(async () => (await tid("ue-line-source-hint").count()) === 0, "the line sheet closed");
  await tid("ue-save").getByRole("button").click();
  await waitFor(async () => (await lineOf(eid, g.id))?.unitPriceCents === 9900, "the hand price is saved");

  // back on the canvas: nothing changed → «Открыть смету»; another run → «Обновить смету»
  await h.go(`/module/gutters/draw?m=${encodeURIComponent(mid)}`);
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await tid("draw-estimate-open").waitFor({ timeout: 8000 });
  await drawRun(0.6);
  await tid("draw-estimate-update").waitFor({ timeout: 8000 });
  await h.shot("canvas-update");
  await tid("draw-estimate-update").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  h.expect(new URL(p.url()).searchParams.get("id") === eid, "the same estimate");
  await waitFor(async () => {
    const l = await lineOf(eid, g.id);
    return l && l.unitPriceCents === 9900 && Number(l.quantity) > q1;
  }, "«Обновить смету»: the hand price stays, the quantity grows");
  h.expect((await estimatesOf(mid)).length === 1, "one estimate of the measurement");
  await waitFor(async () => (await gutters()).measurements.some((m) => m.id === mid && m.status === "ready"), "ready again");

  // the lead: «Смета из замера» → the canvas opens and, nothing changed, opens the same estimate (once)
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-estimate").waitFor({ timeout: 8000 });
  await h.shot("lead");
  await tid("module-gutters-estimate").getByRole("button").click();
  await p.waitForURL(new RegExp(`/estimate/${eid}$`), { timeout: 8000 });
  h.expect((await estimatesOf(mid)).length === 1, "«Смета из замера» made no second estimate");
};
