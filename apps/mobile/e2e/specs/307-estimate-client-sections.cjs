/**
 * e2e 307 — разделы в документе клиента (РС-7b, §5), every view; the client page /p/ and the PDF:
 * - a section with its subsection (named by the dictionary, in the client's language), its subtotal, «Other items»;
 * - an add-on stands in its own section with its switch (no separate block); choosing it moves that section's subtotal;
 * - a title typed with markup is shown as text on the page and escaped in the PDF (never markup).
 */
const TOKEN = "demo0handyman0estimate0000000001";
const DB_KEY = "octo.db.v5";
const EVIL = "Roof <b>bold</b>";

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  const e = raw.db.estimates.find((x) => x.id === "e6");
  e.doc.options = [{
    id: "o1", name: "Good", recommended: true,
    sections: [{ id: "R", title: EVIL }, { id: "RM", kind: "material", parentId: "R" }],
    lines: [
      { id: "l1", group: "labor", name: "Install gutters", quantity: "1", unit: "lot", unitPriceCents: 90000, sectionId: "R" },
      { id: "l2", group: "material", name: "Gutter 5in", quantity: "100", unit: "LF", unitPriceCents: 850, sectionId: "RM" },
      { id: "l3", group: "material", name: "Leaf guards", quantity: "100", unit: "LF", unitPriceCents: 400, sectionId: "RM", optional: true },
      { id: "l4", group: "service", name: "Haul away", quantity: "1", unit: "ea", unitPriceCents: 15000 },
    ],
  }];
  e.doc.settings.tax = { enabled: false, rateBps: 0, groups: { service: true, labor: true, material: true } };
  e.doc.settings.discount = null;
  await h.seed(DB_KEY, raw);

  // the client page: sections, subsection, subtotal, «Other items»; the add-on in its place
  await h.go(`/p/${TOKEN}`);
  await h.expectText(/Download PDF/, "the client page");
  const body = async () => p.locator("body").innerText();
  let t = await body();
  h.expect(t.includes(EVIL), "the title is shown as typed — as text, not markup");
  h.expect((await p.locator("body b").count()) === 0, "no element was made of the title");
  h.expect(/Materials/.test(t) && /Other items/.test(t) && /Haul away/.test(t), "subsection by the dictionary, «Other items»");
  h.expect(/subtotal \$1,750\b/.test(t.replace(/\s+/g, " ")), `the section's subtotal without the add-on ($900 + $850 = $1,750) (${t.replace(/\n/g, " ").slice(t.indexOf("Roof"), t.indexOf("Roof") + 500)})`);
  const sw = p.getByRole("switch", { name: "Leaf guards" }).locator("visible=true");
  await sw.first().waitFor({ timeout: 5000 });
  const order = await p.evaluate(() => { const txt = document.body.innerText; return [txt.indexOf("Gutter 5in"), txt.indexOf("Leaf guards"), txt.indexOf("Haul away")]; });
  h.expect(order[0] < order[1] && order[1] < order[2], "the add-on stands in its own section, before «Other items»");
  await sw.first().click();
  await p.waitForFunction(() => /subtotal \$2,150\b/.test(document.body.innerText.replace(/\s+/g, " ")), null, { timeout: 4000 });
  h.expect(true, "chosen: the section's subtotal is $2,150.00");

  // the PDF: escaped
  await h.go("/estimate/e6");
  await p.evaluate(() => {
    window.__pdf = null;
    const add = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => { const r = add(el); if (el.tagName === "IFRAME") el.contentWindow.print = () => { window.__pdf = el.contentDocument.documentElement.outerHTML; }; return r; };
  });
  await p.getByRole("button", { name: "PDF", exact: true }).last().click();
  await p.waitForFunction(() => !!window.__pdf, null, { timeout: 5000 });
  const pdf = await p.evaluate(() => window.__pdf);
  h.expect(/Roof &lt;b&gt;bold&lt;\/b&gt;/.test(pdf) && !/Roof <b>bold<\/b>/.test(pdf), "the PDF escapes the title");
  h.expect(/Roof &lt;b&gt;bold&lt;\/b&gt; subtotal/.test(pdf), "and its subtotal line");
};
