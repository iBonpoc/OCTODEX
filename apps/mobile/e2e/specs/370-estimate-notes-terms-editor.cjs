/**
 * e2e 370 — «Notes — заметка» and «Terms — условия» in the estimate editor (DS §8.12, spec 40 §6, #1304), every view, by testID:
 * - a new estimate for a Spanish-reading client: Terms = the company's Spanish default, «Español» on the row;
 * - another client (English): the untouched text follows their language; an edited text stays when the client changes;
 * - a Terms text that speaks of arbitration: «согласуйте с юристом» (a warning, nothing blocked);
 * - saved: the estimate keeps its own Terms and Notes.
 */
const DB_KEY = "octo.db.v5";
const EN = "Net 15. Cleanup included (тестовые).";
const ES = "Neto 15. Limpieza incluida (тестовые).";

exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const { sheetGone } = require("../sheet.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();
  const rowSays = (id, re) => p.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`[data-testid="${id}"]`)?.textContent || ""), [id, re.source], { timeout: 3000 });

  await h.go("/today");
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  raw.db.company.estimate = { ...raw.db.company.estimate, termsByLang: { en: EN, es: ES } };
  raw.db.estimateTemplates = [];
  // c2 reads Spanish (its main person's language); c1 — the company's language (English)
  raw.db.customers = raw.db.customers.map((c) =>
    c.id !== "c2" ? c : { ...c, people: c.people?.length ? c.people.map((x, i) => (i === 0 ? { ...x, language: "es" } : x)) : [{ id: "pp370", name: c.name, role: "main", phones: [], emails: [], language: "es" }] });
  await h.seed(DB_KEY, raw);

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-terms-row").waitFor({ timeout: 8000 });
  await rowSays("est-terms-row", /Neto 15/);
  h.expect(/Español/.test(await tid("est-terms-row").innerText()), "the language the client reads them in");
  h.expect(/Не заполнено/.test(await tid("est-notes-row").innerText()), "Notes: nothing yet");
  await h.shot("new");

  // another client: the untouched text follows their language
  await tid("est-client").getByRole("button").first().click();
  await tid("est-client-pick-p1").click();
  await sheetGone(p);
  await rowSays("est-terms-row", /Net 15/);
  h.expect(/English/.test(await tid("est-terms-row").innerText()), "English for this client");

  // the text edited: it stays when the client changes; arbitration — the warning
  await tid("est-terms-row").click();
  const field = tid("est-terms-field").locator("textarea, input").first();
  await field.waitFor({ timeout: 3000 });
  await field.fill("Disputes go to binding arbitration (тестовые).");
  await tid("est-terms-sheet-arb").waitFor({ timeout: 3000 });
  await h.shot("terms-sheet");
  await tid("est-nt-done").getByRole("button").click();
  await sheetGone(p);
  await tid("est-terms-arb").waitFor({ timeout: 3000 });
  await tid("est-client").getByRole("button").first().click();
  await tid("est-client-pick-p2").click();
  await sheetGone(p);
  await rowSays("est-terms-row", /arbitration/);
  h.expect(!/Neto 15/.test(await tid("est-terms-row").innerText()), "an edited text stays when the client changes");

  // Notes
  await tid("est-notes-row").click();
  await tid("est-notes-field").locator("textarea, input").first().fill("Gate code 1234");
  await tid("est-nt-done").getByRole("button").click();
  await sheetGone(p);
  await rowSays("est-notes-row", /Gate code 1234/);

  // saved: its own Terms and Notes
  await line.addCustom(h, "Gutter clean (тестовые)", 100);
  await tid("ue-save").getByRole("button").click();
  await p.waitForFunction((k) => (JSON.parse(localStorage.getItem(k))?.db?.estimates ?? []).some((e) => e.doc?.note === "Gate code 1234"), DB_KEY, { timeout: 8000 });
  const saved = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).db.estimates.find((e) => e.doc?.note === "Gate code 1234"), DB_KEY);
  h.expect(saved.doc.terms === "Disputes go to binding arbitration (тестовые).", `saved with its own Terms (${saved.doc.terms})`);
  h.expect((await count("est-terms-arb")) <= 1, "one warning at most");
};
