/**
 * e2e 371 — the company's Terms by language and an estimate made before #1304 (DS §8.12, spec 40 §6, #1304), every view:
 * - «Компания → Документы»: English always; «Добавить: Español» adds a field; arbitration — «согласуйте с юристом»; saved
 *   into termsByLang; a new estimate of a Spanish-reading client takes it;
 * - an estimate without the `terms` key: its row shows the company's default; opened, closed unchanged and saved —
 *   still no key (its client goes on reading the default, as before).
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const { sheetGone } = require("../sheet.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();

  await h.go("/today");
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  raw.db.company.estimate = { ...raw.db.company.estimate, termsByLang: { en: "Net 15 (тестовые)." }, terms: "Net 15 (тестовые)." };
  raw.db.estimateTemplates = [];
  raw.db.customers = raw.db.customers.map((c) =>
    c.id !== "c2" ? c : { ...c, people: c.people?.length ? c.people.map((x, i) => (i === 0 ? { ...x, language: "es" } : x)) : [{ id: "pp371", name: c.name, role: "main", phones: [], emails: [], language: "es" }] });
  // an estimate made before #1304: no `terms` key, not signed (it can still be changed)
  const old = raw.db.estimates.find((e) => e.doc && !["approved", "awaiting_countersign", "declined"].includes(e.status));
  delete old.doc.terms;
  await h.seed(DB_KEY, raw);
  await h.seed("octo.role.v1", "director");

  // the company: English always, Spanish added
  await h.go("/company/documents");
  await tid("co-terms-en").waitFor({ timeout: 8000 });
  h.expect((await count("co-terms-es")) === 0, "Spanish is not there until added");
  await tid("co-terms-add-es").getByRole("button").click();
  const es = tid("co-terms-es").locator("textarea, input").first();
  await es.waitFor({ timeout: 3000 });
  await es.fill("Neto 15. Arbitraje vinculante (pruebas).");
  await tid("co-terms-arb-es").waitFor({ timeout: 3000 });
  h.expect((await count("co-terms-arb-en")) === 0, "no warning on the English text");
  await h.shot("company");
  await tid("co-save").getByRole("button").click();
  await p.waitForFunction((k) => /Arbitraje/.test(JSON.parse(localStorage.getItem(k))?.db?.company?.estimate?.termsByLang?.es || ""), DB_KEY, { timeout: 5000 });

  // a new estimate of the Spanish-reading client takes it
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-terms-row").waitFor({ timeout: 8000 });
  await p.waitForFunction(() => /Arbitraje/.test(document.querySelector('[data-testid="est-terms-row"]')?.textContent || ""), null, { timeout: 3000 });

  // the old estimate: the row shows the default its client reads; opened, closed unchanged, saved — still no key
  await h.go(`/estimate/new?id=${old.id}`);
  await tid("est-terms-row").waitFor({ timeout: 8000 });
  h.expect(/Neto 15|Net 15/.test(await tid("est-terms-row").innerText()), "an old estimate: the company's default on the row");
  await tid("est-terms-row").click();
  await tid("est-terms-field").waitFor({ timeout: 3000 });
  await tid("est-nt-done").getByRole("button").click();
  await sheetGone(p);
  await tid("ue-save").getByRole("button").click();
  await p.waitForFunction(([k, id]) => {
    const e = (JSON.parse(localStorage.getItem(k))?.db?.estimates ?? []).find((x) => x.id === id);
    return !!e && !!e.doc?.savedAt;
  }, [DB_KEY, old.id], { timeout: 8000 });
  const after = await p.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).db.estimates.find((x) => x.id === id), [DB_KEY, old.id]);
  h.expect(!("terms" in after.doc), "an old estimate saved without changing Terms: still no key (as before #1304)");
};
