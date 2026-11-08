/**
 * e2e 167 — C5b «замер изменился после сметы» (docs/specs/33-gutters-estimate.md П23.11). Every view.
 * The module answers the core through the registry (ModuleDef.estimateNotes); the core never knows a measurement.
 * - a lead → «Замер» → a run → «Смета»: the estimate has no word (the drawing is as estimated);
 * - another run on the canvas (the measurement is a draft again) → the estimate shows «Замер изменился после сметы»;
 *   «Отправить клиенту» and «PDF» ask first («Проверьте», «Всё равно …» — not a stop);
 * - «Обновить из замера» → the canvas's «Обновить смету» → the same estimate, the quantity grew, the word is gone.
 * Finds things by testID; waits on what it checks (CHECKS §9).
 */
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

  // a measurement and its estimate
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-measure").getByRole("button").click();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun(0.4);
  await tid("draw-saved").waitFor({ timeout: 5000 });
  await waitFor(() => !!new URL(p.url()).searchParams.get("m"), "saved: the address names the measurement");
  const mid = new URL(p.url()).searchParams.get("m");
  await tid("draw-estimate-make").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  const eid = new URL(p.url()).searchParams.get("id");
  await waitFor(async () => (await gutters()).measurements.some((m) => m.id === mid && m.status === "ready"), "the measurement is ready");

  // hand prices on every line (the demo price list has no gutter items: «нет цены» would stop the send — C5, e2e 164)
  await p.evaluate(({ k, id }) => {
    const st = JSON.parse(localStorage.getItem(k));
    const e = st.db.estimates.find((x) => x.id === id);
    for (const o of e.doc.options) for (const l of o.lines) l.unitPriceCents = (l.unitPriceCents || 0) + 100;
    localStorage.setItem(k, JSON.stringify(st));
  }, { k: DB_KEY, id: eid });

  // nothing changed: no word on the estimate
  await h.go(`/estimate/${eid}`);
  await tid("est-pdf").waitFor({ timeout: 8000 });
  h.expect((await tid("module-gutters-stale").count()) === 0, "no «Замер изменился» while the drawing is as estimated");

  // the drawing changes after the estimate
  await h.go(`/module/gutters/draw?m=${encodeURIComponent(mid)}`);
  await tid("draw-estimate-open").waitFor({ timeout: 8000 });
  await drawRun(0.6);
  await tid("draw-estimate-update").waitFor({ timeout: 8000 });
  await waitFor(async () => (await gutters()).measurements.some((m) => m.id === mid && m.status === "draft"), "the measurement changed");
  const g = (await estimatesOf(mid))[0].doc.options[0].lines.find((l) => ofM(l, mid) && l.source.section === "gutter");
  const q1 = Number(g.quantity);

  // the estimate says so; sending and the PDF ask first
  await h.go(`/estimate/${eid}`);
  await tid("module-gutters-stale").waitFor({ timeout: 8000 });
  // on site: the client signs what they would get by link — the same question first
  await tid("sign-check-module").waitFor({ timeout: 8000 });
  h.expect((await tid("sign-check-force").count()) === 1, "on-site signing: «Всё равно» (not a stop)");
  await h.shot("stale");
  await tid("est-send").getByRole("button").click();
  await tid("send-check-module").waitFor({ timeout: 8000 });
  h.expect((await tid("send-check-review").count()) === 1, "«Проверьте перед отправкой», not a stop");
  for (const k of ["noPrice", "testPrice", "gone"]) h.expect((await tid(`send-check-${k}`).count()) === 0, `no ${k}: the word alone holds the send`);
  h.expect((await tid("send-copy").getByRole("button").getAttribute("aria-disabled")) === "true", "the send waits for «Всё равно отправить»");
  await h.shot("send-check");
  await tid("send-check-force").getByRole("button").click();
  await waitFor(async () => (await tid("send-copy").getByRole("button").getAttribute("aria-disabled")) !== "true", "«Всё равно отправить» opens the send");
  await p.keyboard.press("Escape");
  await h.go(`/estimate/${eid}`);
  await tid("est-pdf").getByRole("button").click();
  await tid("pdf-check-module").waitFor({ timeout: 8000 });
  await p.evaluate(() => {
    window.__pdf = null;
    const add = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      const r = add(el);
      if (el.tagName === "IFRAME") el.contentWindow.print = () => { window.__pdf = el.contentDocument.documentElement.outerHTML; };
      return r;
    };
  });
  await tid("pdf-check-force").getByRole("button").click();
  await p.waitForFunction(() => !!window.__pdf, null, { timeout: 5000 });

  // «Обновить из замера» → the canvas's «Обновить смету»: the same estimate, the quantity grows, the word is gone
  await h.go(`/estimate/${eid}`);
  await tid("module-gutters-stale-update").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  h.expect(new URL(p.url()).searchParams.get("id") === eid, "the same estimate");
  await waitFor(async () => Number((await lineOf(eid, g.id))?.quantity) > q1, "the quantity grew");
  await waitFor(async () => (await gutters()).measurements.some((m) => m.id === mid && m.status === "ready"), "ready again");
  h.expect((await estimatesOf(mid)).length === 1, "one estimate of the measurement");
  await h.go(`/estimate/${eid}`);
  await tid("est-pdf").waitFor({ timeout: 8000 });
  h.expect((await tid("module-gutters-stale").count()) === 0, "the word is gone after the update");
};
