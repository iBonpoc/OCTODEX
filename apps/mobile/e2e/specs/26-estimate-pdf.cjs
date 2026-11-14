/**
 * Rule 7 (founder 05.11.2026, docs/specs/07 §2.1, wave E1): what goes to the client is in the CLIENT's language,
 * whatever the app language is. The app runs in Russian here; the client is English (company default), then Spanish.
 * Checks the estimate PDF (the HTML printed on the web), the client page /p/, and that the app itself stays Russian.
 */
const { estAct } = require("../estimateMenu.cjs");
const TOKEN = "demo0handyman0estimate0000000001";

/** capture the PDF HTML instead of opening the print dialog */
async function capturePdf(h, buttonName) {
  await h.page.evaluate(() => {
    window.__pdf = null;
    const add = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      const r = add(el);
      if (el.tagName === "IFRAME") el.contentWindow.print = () => { window.__pdf = el.contentDocument.documentElement.outerHTML; };
      return r;
    };
  });
  // the estimate's own PDF lives in «⋯» (#1412); the client page's PDF is a button
  if (buttonName === "PDF") await estAct(h.page, "pdf");
  else await h.page.getByRole("button", { name: buttonName, exact: true }).last().click();
  await h.page.waitForFunction(() => !!window.__pdf, null, { timeout: 5000 });
  return h.page.evaluate(() => window.__pdf);
}

async function setCompanyDocLanguage(h, lang) {
  await h.page.evaluate((l) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.company = { ...raw.db.company, docLanguage: l };
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, lang);
}

exports.run = async (h) => {
  // English client, Russian app
  await h.go("/estimate/e6");
  await h.expectText(/Отправить ещё раз/, "the app itself is Russian");
  let pdf = await capturePdf(h, "PDF");
  h.expect(/<html lang="en"/.test(pdf), "estimate PDF is English");
  h.expect(/>Total</.test(pdf) && /Customer/.test(pdf), "English words in the PDF");
  h.expect(!/Итого|Клиент|Смета/.test(pdf), "no Russian in the client's PDF");
  h.expect(/\d{2}\/\d{2}\/\d{4}/.test(pdf), "US numeric date");

  await h.go(`/p/${TOKEN}`);
  await h.expectText(/Download PDF/, "client page in English");
  const page = await h.text();
  h.expect(!/Скачать PDF|Итого/.test(page), "no Russian on the client page");
  pdf = await capturePdf(h, "Download PDF");
  h.expect(/<html lang="en"/.test(pdf), "PDF from the client page is English");

  // Spanish client (company default for documents → es), the app stays Russian
  await setCompanyDocLanguage(h, "es");
  await h.go(`/p/${TOKEN}`);
  await h.expectText(/Descargar PDF/, "client page in Spanish");
  await h.expectText(/Para/, "Spanish words on the client page");
  pdf = await capturePdf(h, "Descargar PDF");
  h.expect(/<html lang="es"/.test(pdf) && /Cliente/.test(pdf), "PDF in Spanish");
  await h.go("/estimate/e6");
  await h.expectText(/Отправить ещё раз/, "the app is still Russian");
};
