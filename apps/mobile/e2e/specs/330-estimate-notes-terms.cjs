/**
 * e2e 330 — «Notes» и «Terms & conditions» сметы (#1304, docs/specs/40), every view; by testID (rule 19). Test data.
 * - an estimate made before #1304 (no own Terms): the client page shows the company's default in the CLIENT's language
 *   (Spanish), under its heading, ABOVE the signature; Notes under theirs;
 * - the estimate's own Terms (typed with markup): shown as text, and they stay when the company's default changes after;
 * - the PDF: the headings in Spanish, the text escaped, Terms before the signatures;
 * - on site: the same Terms above «Client signs on site».
 */
const TOKEN = "demo0handyman0estimate0000000001";
const DB_KEY = "octo.db.v5";
const ES = "Garantía: 1 año de mano de obra (prueba).";
const EN = "Warranty: 1 year on labor (test).";
const OWN = "Pay in 30 days <b>net</b> (test).";
const NOTE = "Gutters cleaned first (test).";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const before = (a, b) =>
    p.evaluate(([x, y]) => {
      const ex = [...document.querySelectorAll(`[data-testid="${x}"]`)].find((e) => e.offsetParent !== null);
      const ey = [...document.querySelectorAll(`[data-testid="${y}"]`)].find((e) => e.offsetParent !== null);
      return !!ex && !!ey && !!(ex.compareDocumentPosition(ey) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, [a, b]);
  const pdfHtml = async (clickTestId) => {
    await p.evaluate(() => {
      window.__pdf = null;
      const add = document.body.appendChild.bind(document.body);
      document.body.appendChild = (el) => { const r = add(el); if (el.tagName === "IFRAME") el.contentWindow.print = () => { window.__pdf = el.contentDocument.documentElement.outerHTML; }; return r; };
    });
    await tid(clickTestId).getByRole("button").click();
    await p.waitForFunction(() => !!window.__pdf, null, { timeout: 5000 });
    return p.evaluate(() => window.__pdf);
  };
  const seed = async (own, esDefault = ES) => {
    await h.go("/today");
    const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
    raw.db.company.estimate = { ...raw.db.company.estimate, termsByLang: { en: EN, es: esDefault } };
    const e = raw.db.estimates.find((x) => x.id === "e6");
    e.doc.note = NOTE;
    if (own === undefined) delete e.doc.terms;
    else e.doc.terms = own;
    // the client reads Spanish: its main person's language
    raw.db.customers = raw.db.customers.map((c) =>
      c.id !== e.customerId ? c
        : { ...c, people: c.people?.length ? c.people.map((x, i) => (i === 0 ? { ...x, language: "es" } : x)) : [{ id: "pp330", name: c.name, role: "main", phones: [], emails: [], language: "es" }] });
    await h.seed(DB_KEY, raw);
  };

  // an estimate made before #1304: the company's Spanish default, above the signature
  await seed(undefined);
  await h.go(`/p/${TOKEN}`);
  await tid("estimate-terms").waitFor({ timeout: 8000 });
  h.expect((await tid("estimate-terms").innerText()).includes(ES), "an older estimate: the company's default in the client's language");
  h.expect(/Términos y condiciones/.test(await tid("estimate-terms").innerText()), "under its heading in Spanish");
  h.expect((await tid("estimate-notes").innerText()).includes(NOTE) && /Notas/.test(await tid("estimate-notes").innerText()), "Notes under their heading");
  h.expect(await before("estimate-terms", "portal-sign"), "Terms stand above the signature");

  // the estimate's own Terms: as text; the company's default changes after — the estimate keeps its own
  await seed(OWN, "Otro texto (prueba).");
  await h.go(`/p/${TOKEN}`);
  await tid("estimate-terms").waitFor({ timeout: 8000 });
  const shown = await tid("estimate-terms").innerText();
  h.expect(shown.includes(OWN) && !shown.includes("Otro texto"), "the estimate's own Terms, not the company's new default");
  h.expect((await p.locator('[data-testid="estimate-terms"] b').count()) === 0, "markup in the Terms is shown as text");
  const pdf = await pdfHtml("portal-pdf");
  h.expect(pdf.includes("<h2>Términos y condiciones</h2>") && pdf.includes("<h2>Notas</h2>"), "the PDF: the headings in the client's language");
  h.expect(pdf.includes("Pay in 30 days &lt;b&gt;net&lt;/b&gt; (test).") && !pdf.includes("<b>net</b>"), "the PDF escapes the Terms");
  h.expect(pdf.indexOf("Términos y condiciones") < pdf.indexOf('class="sigs"'), "the PDF: Terms before the signatures");

  // on site: the same Terms above «Client signs on site»
  await h.go("/estimate/e6");
  await tid("onsite-sign").waitFor({ timeout: 8000 });
  h.expect((await tid("estimate-terms").innerText()).includes(OWN), "on site: the client sees the Terms");
  h.expect(await before("estimate-terms", "onsite-sign"), "on site: Terms stand above the signature");
};
