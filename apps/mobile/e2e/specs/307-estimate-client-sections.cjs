/**
 * e2e 307 — разделы в документе клиента (РС-7b, §5), every view; the client page /p/ and the PDF; by testID (rule 19):
 * - a section with its subsection (named by the dictionary), its subtotal, «Other items»; the add-on in its own section with its switch;
 * - choosing the add-on moves that section's subtotal; the client's PDF repeats the choice (the add-on is in the lines and the total);
 * - the company's PDF of an unsigned estimate offers every add-on as «+ $X», none in the total;
 * - a title typed with markup is shown as text on the page and escaped in the PDF (never markup).
 */
const TOKEN = "demo0handyman0estimate0000000001";
const DB_KEY = "octo.db.v5";
const EVIL = "Roof <b>bold</b>";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
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

  // the client page
  await h.go(`/p/${TOKEN}`);
  await tid("est-client-section-R").waitFor({ timeout: 8000 });
  h.expect((await tid("est-client-section-R").innerText()).trim() === EVIL, "the title is shown as typed — as text, not markup");
  h.expect((await p.locator("body b").count()) === 0, "no element was made of the title");
  h.expect(/Materials/.test(await tid("est-client-section-RM").innerText()), "the subsection is named by the dictionary");
  h.expect(await tid("est-client-other").isVisible(), "«Other items» stands");
  const money = (s) => s.replace(/\s+/g, " ");
  h.expect(/\$1,750\b/.test(money(await tid("est-client-subtotal-R").innerText())), "the section's subtotal without the add-on ($900 + $850)");
  const order = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="est-client-"]')].map((e) => e.getAttribute("data-testid")));
  const at = (id) => order.indexOf(id);
  h.expect(at("est-client-line-l2") < at("est-client-line-l3") && at("est-client-line-l3") < at("est-client-subtotal-R") && at("est-client-subtotal-R") < at("est-client-other") && at("est-client-other") < at("est-client-line-l4"), `the add-on stands in its own section, before the subtotal and «Other items» (${order.join(" ")})`);
  // the PDF before any choice: the add-on is an offer, «+ $400», not in the total
  let pdf = await pdfHtml("portal-pdf");
  h.expect(/Leaf guards/.test(pdf) && />\+ \$400</.test(pdf) && /<td class="r">\$1,900<\/td>/.test(pdf), "the client's PDF without a choice: the add-on is an offer, the total is without it ($1,900)");
  // choose the add-on: the subtotal moves, the PDF repeats the choice
  await tid("est-client-line-l3").getByRole("switch").click();
  await p.waitForFunction(() => /\$2,150\b/.test((document.querySelector('[data-testid="est-client-subtotal-R"]')?.textContent ?? "").replace(/\s+/g, " ")), null, { timeout: 4000 });
  pdf = await pdfHtml("portal-pdf");
  h.expect(!/>\+ \$400</.test(pdf) && /<td class="r">\$400<\/td>/.test(pdf) && /<td class="r">\$2,300<\/td>/.test(pdf), "the client's PDF repeats the choice: the add-on in the lines ($400) and the total ($2,300)");

  // the company's PDF of an unsigned estimate: every add-on offered, none in the total; the title escaped
  await h.go("/estimate/e6");
  await tid("est-pdf").waitFor({ timeout: 8000 });
  pdf = await pdfHtml("est-pdf");
  h.expect(/Roof &lt;b&gt;bold&lt;\/b&gt;/.test(pdf) && !/Roof <b>bold<\/b>/.test(pdf), "the PDF escapes the title");
  h.expect(/Roof &lt;b&gt;bold&lt;\/b&gt; subtotal/.test(pdf), "and its subtotal line");
  h.expect(/Leaf guards/.test(pdf) && />\+ \$400</.test(pdf) && /<td class="r">\$1,900<\/td>/.test(pdf), "the company's PDF: the add-on offered, not in the total");
};
