/**
 * e2e 223 — чертёж замера страницей в смете (S6g; #705, П24.7; лист «как на бумаге» #739). Every view.
 * - a lead → «Замер желобов» → a run → «Готово» → «Сделать смету»: the estimate's document carries the drawing as its
 *   page «Gutter drawing» (the client's language: en), without a dollar;
 * - the estimate PDF: the page after the lines — the sheet (svg), «Gutter drawing», the scale;
 * - the client page /p/: the same page, drawn on white paper (doc-page-gutters:<m>);
 * - «Перенести изменения»: a second run → the same page id, its drawing now has two gutters.
 * Finds things by testID; waits on what it checks (CHECKS §9).
 */
const { skipLength, openView, backToCanvas, pressWhenStill } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";
const TOKEN = "e2e223gutterpage0000000000000001";

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
  const estimate = async (id) => ((await db())?.estimates ?? []).find((e) => e.id === id);
  const pageOf = async (id, mid) => ((await estimate(id))?.doc?.pages ?? []).find((pg) => pg.id === `gutters:${mid}`);
  const runsOn = (pg) => pg.items.filter((x) => x.t === "l" && x.sw === 2.5).length;

  await h.go("/today");
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => !!(await db())?.company?.modules?.gutters?.enabled, "the trial is on");

  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-measure").getByRole("button").click();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun(0.4);
  await waitFor(() => !!new URL(p.url()).searchParams.get("m"), "saved: the address names the measurement");
  const mid = new URL(p.url()).searchParams.get("m");
  await openView(p);
  await pressWhenStill(tid("view-action-make").getByRole("button"));
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  const eid = new URL(p.url()).searchParams.get("id");
  await waitFor(async () => !!(await pageOf(eid, mid)), "the estimate carries the drawing as its page");
  const pg = await pageOf(eid, mid);
  h.expect(pg.title === "Gutter drawing", `in the client's language (${pg.title})`);
  h.expect(runsOn(pg) === 1, "one gutter on the page");
  h.expect(!JSON.stringify(pg).includes("$"), "no money on the page");

  // the demo's price list has no gutter parts: every line gets a price, so the check before the PDF (C5) does not hold it
  // — the page is the drawing, not the money
  await h.go("/today");
  await p.evaluate(([k, id]) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.db.estimates = s.db.estimates.map((e) =>
      e.id !== id ? e : { ...e, doc: { ...e.doc, options: e.doc.options.map((o) => ({ ...o, lines: o.lines.map((l) => ({ ...l, unitPriceCents: l.unitPriceCents || 100, source: l.source ? { ...l.source, noPrice: false, testPrice: false } : l.source })) })) } },
    );
    localStorage.setItem(k, JSON.stringify(s));
  }, [DB_KEY, eid]);
  // the estimate PDF: the page after the lines (the web prints from a hidden frame: read the new frame)
  await h.go(`/estimate/${eid}`);
  await p.evaluate(() => {
    for (const f of document.querySelectorAll("iframe")) f.dataset.seen = "1";
    const add = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      const r = add(el);
      if (el.tagName === "IFRAME") el.contentWindow.print = () => {};
      return r;
    };
  });
  await pressWhenStill(tid("est-pdf").getByRole("button"));
  // a module's word may ask first (the check before the PDF, C5): then «Всё равно»; else the PDF prints at once
  const printedOrAsked = () =>
    p.waitForFunction(
      () =>
        [...document.querySelectorAll("iframe:not([data-seen])")].some((x) => x.contentDocument?.body?.innerHTML.includes("Gutter drawing")) ||
        !!document.querySelector('[data-testid="pdf-check-force"]'),
      null,
      { timeout: 8000 },
    );
  await printedOrAsked();
  if (await tid("pdf-check-force").count()) await pressWhenStill(tid("pdf-check-force").getByRole("button"));
  await p.waitForFunction(() => [...document.querySelectorAll("iframe:not([data-seen])")].some((x) => x.contentDocument?.body?.innerHTML.includes("Gutter drawing")), null, { timeout: 8000 });
  const pdf = await p.evaluate(() => [...document.querySelectorAll("iframe:not([data-seen])")].find((x) => x.contentDocument?.body?.innerHTML.includes("Gutter drawing")).contentDocument.documentElement.outerHTML);
  h.expect(/class="attach"/.test(pdf) && /<svg/.test(pdf) && /Scale: /.test(pdf), "the estimate PDF: the drawing's page with the sheet");
  h.expect(pdf.indexOf("Gutter drawing") > pdf.indexOf('class="sigs"'), "after the signatures");

  // the client page /p/ (demo: the estimate gets a link)
  await p.evaluate(([k, id, tok]) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.db.estimates = s.db.estimates.map((e) => (e.id === id ? { ...e, token: tok, status: "sent", sentAt: e.sentAt || new Date().toISOString() } : e));
    localStorage.setItem(k, JSON.stringify(s));
  }, [DB_KEY, eid, TOKEN]);
  await h.go(`/p/${TOKEN}`);
  const onPage = p.getByTestId(`doc-page-gutters:${mid}`).locator("visible=true");
  await onPage.waitFor({ timeout: 8000 });
  h.expect(/Gutter drawing/.test(await onPage.innerText()), "the client page shows the drawing's page");
  h.expect((await onPage.locator("line").count()) > 4, "the sheet is drawn");
  await onPage.scrollIntoViewIfNeeded();
  await h.shot("client-page");

  // «Перенести изменения»: a second run → the same page, now two gutters
  await h.go(`/module/gutters/draw?m=${encodeURIComponent(mid)}`);
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun(0.7);
  await openView(p);
  await pressWhenStill(tid("view-action-update").getByRole("button"));
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  h.expect(new URL(p.url()).searchParams.get("id") === eid, "the same estimate");
  await waitFor(async () => runsOn((await pageOf(eid, mid)) ?? { items: [] }) === 2, "the page now has two gutters");
  h.expect(((await estimate(eid)).doc.pages ?? []).length === 1, "one page per measurement");
};
