/**
 * e2e 348 — «Сметы → ＋ → Из шаблона…» (DS §8.13, spec 39 §11.9, #1117), every view, by testID:
 * - no templates: the sheet says how one is made (no «Пустая смета» in it);
 * - a template: the sheet is the list of templates; picked → the client is asked → the first line from the template is open,
 *   the cursor in its «Кол-во»; Enter («›») goes to «Кол-во» of the next one;
 * - the template's 10.25 % tax does not come: the total is the sum of the lines; saved with these quantities.
 */
const DB_KEY = "octo.db.v5";
const TPL = "00000000-0000-4000-8000-000000000348";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();
  const lineIds = async () => (await p.locator('[data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-line-", ""));
  const focusedQty = () => p.evaluate(() => document.activeElement?.closest('[data-testid^="est-qty-"]')?.getAttribute("data-testid") ?? null);
  const seed = (tpls) => p.evaluate(({ k, tpls }) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.db.estimateTemplates = tpls;
    localStorage.setItem(k, JSON.stringify(s));
  }, { k: DB_KEY, tpls });
  const { sheetGone } = require("../sheet.cjs");
  const openMenu = async () => {
    await tid("est-list-add").getByRole("button").click();
    await tid("est-list-add-template").click();
  };

  await h.go("/today");
  await seed([]);
  // no templates: «Из шаблона…» leads to how one is made
  await h.go("/estimates");
  await openMenu();
  await tid("est-start-none").waitFor({ timeout: 8000 });
  h.expect((await count("est-start-blank")) === 0, "asked for a template: no «Пустая смета» in the sheet");
  await h.shot("none");

  // a template with a tax: two lines (тестовые цены)
  const line = (id, name, qty, cents) => ({ id, name, group: "service", quantity: qty, unit: "ea", unitPriceCents: cents });
  await seed([{
    id: TPL, name: "Gutter clean (тестовые)",
    doc: {
      options: [{ id: "00000000-0000-4000-8000-0000000003a1", name: "Good", lines: [line("00000000-0000-4000-8000-0000000003b1", "Clean gutters (тестовые)", "1", 5000), line("00000000-0000-4000-8000-0000000003b2", "Flush downspouts (тестовые)", "2", 3000)] }],
      settings: { discount: null, tax: { enabled: true, rateBps: 1025, groups: { service: true, labor: true, material: true } }, deposit: { kind: "none" }, caHic: true },
    },
  }]);
  await h.go("/estimates");
  await openMenu();
  await tid(`est-start-${TPL}`).waitFor({ timeout: 8000 });
  h.expect((await count("est-start-blank")) === 0, "the list of templates only");
  await h.shot("list");
  await tid(`est-start-${TPL}`).click();
  // the client is asked next; then the first line is open with the cursor in its «Кол-во»
  await tid("est-client-pick-p2").click();
  await sheetGone(p);
  const [a, b] = await lineIds();
  await tid(`est-collapse-${a}`).waitFor({ timeout: 5000 });
  await p.waitForFunction((id) => document.activeElement?.closest(`[data-testid="est-qty-${id}"]`), a, { timeout: 5000 });
  h.expect((await focusedQty()) === `est-qty-${a}`, "the cursor is in «Кол-во» of the first line");
  await p.keyboard.press("Control+A");
  await p.keyboard.type("4");
  // «›» (Enter on the web): the next line opens, the cursor in its «Кол-во»; the first folds
  await p.keyboard.press("Enter");
  await p.waitForFunction((id) => document.activeElement?.closest(`[data-testid="est-qty-${id}"]`), b, { timeout: 5000 });
  h.expect((await count(`est-collapse-${a}`)) === 0, "the first line folded");
  await p.keyboard.press("Control+A");
  await p.keyboard.type("3");
  await h.shot("second");
  await tid(`est-collapse-${b}`).getByRole("button").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-collapse-"]').length === 0, null, { timeout: 3000 });

  // no tax from the template: the total is the sum of the lines, 4 × $50 + 3 × $30 = $290
  // (the bar at the bottom on a phone, the totals beside the list from 820; with the tax it would be $319.73)
  await p.waitForFunction(() => /\$290\b/.test(document.body.innerText) && !/\$319/.test(document.body.innerText), null, { timeout: 3000 });
  await tid("ue-save").getByRole("button").click();
  await p.waitForFunction(({ k, tpl }) => (JSON.parse(localStorage.getItem(k))?.db?.estimates ?? []).some((e) => e.templateId === tpl), { k: DB_KEY, tpl: TPL }, { timeout: 8000 });
  const saved = await p.evaluate(({ k, tpl }) => JSON.parse(localStorage.getItem(k)).db.estimates.find((e) => e.templateId === tpl), { k: DB_KEY, tpl: TPL });
  h.expect(saved.doc.settings.tax.enabled === false, "saved without the template's tax");
  h.expect(JSON.stringify(saved.doc.options[0].lines.map((l) => String(l.quantity))) === JSON.stringify(["4", "3"]), `saved with the quantities typed (${saved.doc.options[0].lines.map((l) => l.quantity)})`);
};
