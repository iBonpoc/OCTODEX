/**
 * e2e 175 — debts 1 and 5 of «Сметы» №1. Every view.
 * - debt 5: the server has no margin after a tech's change (spec 19 §9.1). The office sees the margin counted from its
 *   own document when every line has a cost, and «Маржа не посчитана · строк без себестоимости: N» when some have none —
 *   never an empty place. A tech, and sales without view_costs, see neither.
 * - debt 1: a quantity typed as 1.23455 is shown as 1.2346 — the number the sum counts — on the client page /p/.
 * Seeded estimates, no module. By testID; waits on what it checks.
 */
const { waited } = require("../sheet.cjs");
const DB_KEY = "octo.db.v5";
const FULL = "e-e2e-175a";
const PART = "e-e2e-175b";
const TOKEN = "tok_e2e_175_0123456789abcdef";
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const seen = async (id, what) => {
    h.expect(await waited(tid(id).first().waitFor({ timeout: 8000 })), what);
  };

  await h.go("/today");
  await p.evaluate(({ k, full, part, token }) => {
    const s = JSON.parse(localStorage.getItem(k));
    const base = s.db.estimates.find((e) => e.doc && e.customerId);
    const line = (id, x) => ({ id, group: "labor", name: id, quantity: "1", unit: "ea", unitPriceCents: 10000, ...x });
    const docOf = (lines) => { const d = JSON.parse(JSON.stringify(base.doc)); d.options = [{ ...d.options[0], lines }]; d.settings = { ...d.settings, discount: null }; return d; };
    const clean = { token: undefined, sentAt: undefined, viewedAt: undefined, approval: undefined, countersign: undefined, linkRevokedAt: undefined, depositPaidAt: undefined, marginPct: null };
    s.db.estimates.push(
      // every line has a cost: 1.23455 → 1.2346 × $100.00 = $123.46, cost $61.73 → margin 50.0%
      { ...base, ...clean, id: full, number: "EST-0175A", status: "sent", token, sentAt: new Date().toISOString(), totalCents: 12346,
        doc: docOf([line("Install", { quantity: "1.23455", unitCostCents: 5000 })]) },
      // a tech added two lines: they have no cost
      { ...base, ...clean, id: part, number: "EST-0175B", status: "draft", totalCents: 30000,
        doc: docOf([line("Install", { unitCostCents: 5000 }), line("Extra A"), line("Extra B")]) },
    );
    localStorage.setItem(k, JSON.stringify(s));
  }, { k: DB_KEY, full: FULL, part: PART, token: TOKEN });

  // the office: the margin from the document
  await h.go(`/estimate/${FULL}`);
  await seen("est-margin", "the margin is shown although the server has none");
  h.expect(/50(\.0)?\s?%/.test(await tid("est-margin").first().innerText()), "the margin counted from the costs: 50%");
  h.expect((await tid("est-margin-missing").count()) === 0, "no «not counted» when every line has a cost");
  await h.shot("margin");

  // the office: why it is not counted
  await h.go(`/estimate/${PART}`);
  await seen("est-margin-missing", "«Маржа не посчитана» instead of an empty place");
  h.expect(/:\s*2\b/.test(await tid("est-margin-missing").first().innerText()), "how many lines have no cost: 2");
  h.expect((await tid("est-margin").count()) === 0, "no margin figure when a line has no cost");
  await h.shot("missing");

  // a tech: neither
  await setRole(h, "tech");
  await h.go(`/estimate/${PART}`);
  await h.expectText(/EST-0175B/, "the tech opens the estimate");
  h.expect((await tid("est-margin-missing").count()) === 0 && (await tid("est-margin").count()) === 0, "a tech sees no margin at all");
  await setRole(h, "director");

  // who may not see costs (sales without view_costs: db.costsVisible false) — no margin, no «not counted» (review PR-A №1)
  await setRole(h, "sales");
  await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.db.costsVisible = false; localStorage.setItem(k, JSON.stringify(s)); }, DB_KEY);
  await h.go(`/estimate/${PART}`);
  await h.expectText(/EST-0175B/, "sales opens the estimate");
  h.expect((await tid("est-margin-missing").count()) === 0 && (await tid("est-margin").count()) === 0, "no margin without the right to see costs");
  await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); delete s.db.costsVisible; localStorage.setItem(k, JSON.stringify(s)); }, DB_KEY);
  await setRole(h, "director");

  // the client page: the quantity the sum counts
  await h.go(`/p/${TOKEN}`);
  await h.expectText(/1\.2346/, "the client page shows 1.2346");
  const body = await h.text();
  h.expect(!/1\.23455/.test(body), "never the raw 1.23455");
  h.expect(/\$123\.46/.test(body), "the sum of 1.2346 × $100.00");
  await h.shot("client-qty");
};
