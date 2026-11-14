/**
 * e2e 166 — C5 for the estimate PDF (docs/specs/33-gutters-estimate.md П23.10). Every view.
 * The PDF of an unsigned estimate goes to the client by hand: the same check as «Отправить клиенту» (П23.9).
 * - a draft with a «нет цены» line: «PDF» opens the check «Нельзя отправить», no «Всё равно скачать PDF», no PDF is made;
 *   «Изменить смету» is the way out;
 * - a draft with only a test price: «Проверьте перед отправкой» → «Всё равно скачать PDF» → the PDF, without module words;
 * - a sent (not signed) one: the same check;
 * - a signed estimate: the PDF at once (a copy of what was signed, no check).
 * The core reads only the source flags — the estimates are seeded, no module needed. By testID; waits on what it checks.
 */
const { estMore, estAct, estHas } = require("../estimateMenu.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const capture = async () =>
    p.evaluate(() => {
      window.__pdf = null;
      const add = document.body.appendChild.bind(document.body);
      document.body.appendChild = (el) => {
        const r = add(el);
        if (el.tagName === "IFRAME") el.contentWindow.print = () => { window.__pdf = el.contentDocument.documentElement.outerHTML; };
        return r;
      };
    });
  const pdfMade = () => p.evaluate(() => window.__pdf);
  const pressPdf = () => estAct(p, "pdf");

  await h.go("/today");
  await p.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    const base = s.db.estimates.find((e) => e.doc && e.customerId);
    const src = (x) => ({ module: "gutters", key: `k.${Math.random()}`, ...x });
    const line = (lid, name, x) => ({ id: lid, group: "material", name, quantity: "10", unit: "ft", unitPriceCents: 500, ...x });
    const make = (id, number, status, lines, extra = {}) => {
      const doc = JSON.parse(JSON.stringify(base.doc));
      doc.options = [{ ...doc.options[0], lines }];
      s.db.estimates.push({ ...base, id, number, status, token: undefined, sentAt: undefined, viewedAt: undefined, approval: undefined, countersign: undefined, linkRevokedAt: undefined, depositPaidAt: undefined, doc, ...extra });
    };
    const tp = () => line("l-tp", "Gutter 5in K", { unitPriceCents: 700, source: src({ testPrice: true, priceCents: 700 }) });
    make("e-e2e-166a", "EST-1661", "draft", [line("l-own", "Own line", {}), line("l-np", "Downspout 3x4", { unitPriceCents: 0, source: src({ noPrice: true }) }), tp()]);
    make("e-e2e-166b", "EST-1662", "draft", [line("l-own", "Own line", {}), tp()]);
    make("e-e2e-166d", "EST-1664", "sent", [line("l-own", "Own line", {}), tp()], { token: "e2e166sent0000000000000000000000", sentAt: new Date().toISOString() });
    const opt = base.doc.options[0].id;
    make("e-e2e-166c", "EST-1663", "approved", [line("l-own", "Own line", {}), tp()], { approval: { optionId: opt, addonIds: [], signerName: "Test Client", at: new Date().toISOString(), channel: "on_site" } });
    localStorage.setItem(k, JSON.stringify(s));
  }, DB_KEY);

  // «нет цены»: no PDF, only «Изменить смету»
  await h.go("/estimate/e-e2e-166a");
  await capture();
  await pressPdf();
  await tid("pdf-check-blocked").waitFor({ timeout: 8000 });
  h.expect(/Downspout 3x4/.test(await tid("pdf-check-noPrice").innerText()), "the «нет цены» line by name");
  h.expect((await tid("pdf-check-force").count()) === 0, "no «Всё равно скачать PDF» while a line has no price");
  h.expect((await tid("pdf-check-edit").count()) === 1, "«Изменить смету» is the way out");
  await p.waitForTimeout(1000); // a PDF would print 250 ms after the press (estimatePdf.ts) — nothing must come
  h.expect(!(await pdfMade()), "no PDF with a «нет цены» line");
  await h.shot("blocked");
  await tid("pdf-check-edit").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=e-e2e-166a/, { timeout: 8000 });

  // only a test price: confirm → the PDF
  await h.go("/estimate/e-e2e-166b");
  await capture();
  await pressPdf();
  await tid("pdf-check-review").waitFor({ timeout: 8000 });
  h.expect((await tid("pdf-check-testPrice").count()) === 1, "the test price is listed");
  h.expect(!(await pdfMade()), "no PDF before the confirmation");
  await h.shot("review");
  await tid("pdf-check-force").getByRole("button").click();
  await p.waitForFunction(() => !!window.__pdf, null, { timeout: 5000 });
  const pdf = await pdfMade();
  h.expect(/Gutter 5in K/.test(pdf), "the PDF has the estimate");
  h.expect(!/Тестовая цена|Test price|Precio de prueba|Из замера|From measurement/.test(pdf), "no module marks in the PDF");
  h.expect((await tid("pdf-check").count()) === 0, "the check closed with the PDF");

  // sent, not signed: the same check
  await h.go("/estimate/e-e2e-166d");
  await capture();
  await pressPdf();
  await tid("pdf-check-review").waitFor({ timeout: 8000 });
  h.expect(!(await pdfMade()), "a sent estimate's PDF waits for the confirmation too");

  // signed: a copy of what was signed, no check
  await h.go("/estimate/e-e2e-166c");
  await capture();
  await pressPdf();
  await p.waitForFunction(() => !!window.__pdf, null, { timeout: 5000 });
  h.expect((await tid("pdf-check").count()) === 0, "a signed estimate's PDF has no check");
};
