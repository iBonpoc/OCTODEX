/**
 * e2e 435 — lengths in feet in the client's documents read as on the drawing (#1733; founder 11.11, G-15: «без округления;
 * допустимо до 1/16″»), every view, by testID: a line of 40.4167 ft shows «40′ 5″ × $12.00/ft» on the client's page /p/,
 * «40′ 5″» in the client's PDF and in the company's PDF — never «40.4167 ft»; a line in «ea» stays «3 ea».
 */
const { estMore, estAct } = require("../estimateMenu.cjs");
const TOKEN = "demo0handyman0estimate0000000001";
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/today");
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  const e = raw.db.estimates.find((x) => x.id === "e6");
  e.doc.options = [{
    id: "o1", name: "Good", recommended: true,
    lines: [
      { id: "l1", group: "material", name: "Gutter 5in", quantity: "40.4167", unit: "ft", unitPriceCents: 1200 },
      { id: "l2", group: "material", name: "Downspout 2x3", quantity: "19.1667", unit: "ft", unitPriceCents: 900 },
      { id: "l3", group: "material", name: "End cap", quantity: "3", unit: "ea", unitPriceCents: 500 },
    ],
  }];
  e.doc.settings.tax = { enabled: false, rateBps: 0, groups: { service: true, labor: true, material: true } };
  e.doc.settings.discount = null;
  await h.seed(DB_KEY, raw);
  const pdfHtml = async (click) => {
    await p.evaluate(() => {
      window.__pdf = null;
      const add = document.body.appendChild.bind(document.body);
      document.body.appendChild = (el) => { const r = add(el); if (el.tagName === "IFRAME") el.contentWindow.print = () => { window.__pdf = el.contentDocument.documentElement.outerHTML; }; return r; };
    });
    await click();
    await p.waitForFunction(() => !!window.__pdf, null, { timeout: 5000 });
    return p.evaluate(() => window.__pdf);
  };
  const flat = (s) => s.replace(/\s+/g, " ");

  // the client's page
  await h.go(`/p/${TOKEN}`);
  await tid("est-client-line-l1").waitFor({ timeout: 8000 });
  const l1 = flat(await tid("est-client-line-l1").innerText());
  h.expect(/40′ 5″ × \$12(\.00)?\/ft/.test(l1), `/p/: «40′ 5″ × $12.00/ft» (${l1})`);
  h.expect(!/40\.4/.test(l1), `/p/: no decimal feet (${l1})`);
  h.expect(/19′ 2″/.test(flat(await tid("est-client-line-l2").innerText())), "/p/: the downspout «19′ 2″»");
  h.expect(/3 ea × \$5(\.00)?(?!\/)/.test(flat(await tid("est-client-line-l3").innerText())), "/p/: a count stays «3 ea»");
  await tid("est-client-line-l1").scrollIntoViewIfNeeded();
  await h.shot("p");
  let pdf = await pdfHtml(() => tid("portal-pdf").getByRole("button").click());
  h.expect(/<td class="r">40′ 5″<\/td>/.test(pdf) && /<td class="r">19′ 2″<\/td>/.test(pdf), "the client's PDF: «40′ 5″», «19′ 2″»");
  h.expect(!/40\.4167/.test(pdf) && /<td class="r">3 ea<\/td>/.test(pdf), "the client's PDF: no decimal feet; «3 ea» as before");
  // the price column says what $12 is for (design review of #1748): «$12/ft» beside «40′ 5″», «$5» beside «3 ea»
  h.expect(/<td class="r">\$12(\.00)?\/ft<\/td>/.test(pdf) && /<td class="r">\$5(\.00)?<\/td>/.test(pdf), "the client's PDF: the price of a foot line is «$12/ft», of «ea» — «$5»");

  // the company's PDF of the same estimate
  await h.go("/estimate/e6");
  await estMore(p);
  pdf = await pdfHtml(() => estAct(p, "pdf"));
  h.expect(/<td class="r">40′ 5″<\/td>/.test(pdf) && !/40\.4167/.test(pdf), "the company's PDF: «40′ 5″»");
};
