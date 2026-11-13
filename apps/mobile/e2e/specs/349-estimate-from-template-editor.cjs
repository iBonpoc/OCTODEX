/**
 * e2e 349 — «Из шаблона…» in the editor (DS §8.13, spec 39 §11.9, #1117), every view, by testID:
 * - the empty editor: «Из шаблона…» under the add buttons → the template's lines (sections as sections), the first open with
 *   the cursor in «Кол-во»; a note typed before stays (only adds — code review); no «Вернуть»; the button is gone after;
 * - a typed estimate: «⋯ → Добавить из шаблона…» only adds — the lines at the end, «Добавлено позиций: 2 · Вернуть»;
 *   an edit made after it stays when «Вернуть» takes the template's lines out.
 */
const DB_KEY = "octo.db.v5";
const TPL = "00000000-0000-4000-8000-000000000349";

exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const { sheetGone } = require("../sheet.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();
  const lineIds = async () => (await p.locator('[data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-line-", ""));

  await h.go("/today");
  const l = (id, name, cents, sectionId) => ({ id, name, group: "service", quantity: "1", unit: "ea", unitPriceCents: cents, ...(sectionId ? { sectionId } : {}) });
  // the template goes in through h.seed (a page without the app: the running app would write its own over it, CHECKS §9 №12)
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  const sec = "00000000-0000-4000-8000-0000000004c1";
  raw.db.estimateTemplates = [{
    id: TPL, name: "Guards only (тестовые)",
    doc: {
      options: [{ id: "00000000-0000-4000-8000-0000000004a1", name: "Good", sections: [{ id: sec, title: "Guards" }], lines: [l("00000000-0000-4000-8000-0000000004b1", "Guards (тестовые)", 4000, sec), l("00000000-0000-4000-8000-0000000004b2", "Install guards (тестовые)", 2500, sec)] }],
      settings: { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: true, labor: true, material: true } }, deposit: { kind: "none" }, caHic: true },
    },
  }];
  await h.seed(DB_KEY, raw);

  // a new estimate: «С чего начать?» — «Пустая смета»
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-start-blank").click();
  await sheetGone(p);
  // the empty editor: «Из шаблона…» under the add buttons
  const [add, from] = [await tid("est-add-new").boundingBox(), await tid("est-from-template").boundingBox()];
  h.expect(from.y > add.y, "«Из шаблона…» under «＋ Новая позиция · Из каталога»");
  await h.shot("empty");
  // a note typed in the empty estimate: the template must not take it away
  await tid("est-notes-row").click();
  await tid("est-notes-field").locator("textarea, input").first().fill("Gate code 1234");
  await tid("est-nt-done").getByRole("button").click();
  await sheetGone(p);
  await tid("est-from-template").getByRole("button").click();
  await tid(`est-start-${TPL}`).waitFor({ timeout: 5000 });
  h.expect((await count("est-start-blank")) === 0, "asked for a template: the list of templates only");
  await tid(`est-start-${TPL}`).click();
  await sheetGone(p);
  const [a] = await lineIds();
  await p.waitForFunction((id) => document.activeElement?.closest(`[data-testid="est-qty-${id}"]`), a, { timeout: 5000 });
  h.expect((await lineIds()).length === 2, "the template's two lines");
  h.expect((await p.locator('[data-testid^="est-section-"]').locator("visible=true").count()) >= 1, "its section came as a section");
  h.expect((await count("toast-undo")) === 0, "the empty estimate: no «Вернуть»");
  h.expect(/Gate code 1234/.test(await tid("est-notes-row").innerText()), "the note typed before stays");
  h.expect((await count("est-from-template")) === 0, "«Из шаблона…» is gone after the first line");
  await line.fold(h);

  // a typed estimate: «⋯ → Добавить из шаблона…» only adds
  await tid("est-menu").getByRole("button").click();
  await tid("est-menu-template").click();
  await tid(`est-start-${TPL}`).waitFor({ timeout: 5000 });
  await tid(`est-start-${TPL}`).click();
  await sheetGone(p);
  // «Вернуть» is there (by testID), four lines: the template's at the end, the typed ones first
  await tid("toast-undo").waitFor({ timeout: 3000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-line-"]').length === 4, null, { timeout: 3000 });
  const ids = await lineIds();
  h.expect(ids[0] === a, "the template's lines at the end; the typed ones stay first");
  // the cursor in «Кол-во» of the first line that came
  await p.waitForFunction((id) => document.activeElement?.closest(`[data-testid="est-qty-${id}"]`), ids[2], { timeout: 5000 });
  // an edit right after it (inside the toast's 5 s): the first line's price
  await tid(`est-line-${a}`).click();
  await p.locator(`[data-testid="est-price-${a}"] input`).locator("visible=true").first().fill("41");
  await line.fold(h);
  h.expect((await count("toast-undo")) === 1, "«Вернуть» still there");
  // «Вернуть»: the template's lines go, the edit stays
  h.expect(await line.undo(h), "«Вернуть» pressed");
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-line-"]').length === 2, null, { timeout: 3000 });
  h.expect(/\$41\b/.test(await tid(`est-sum-${a}`).innerText()), "the edit made after it stays");
  await h.shot("undone");
};
