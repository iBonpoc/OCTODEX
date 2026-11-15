/**
 * e2e 303 — разделы сметы (РС-5a, DS §8.5, спека Р4–Р5), every view; finds by testID (rule 19):
 * «＋ Раздел» (the title is typed in the heading), «⋯ → Переместить» a row into it (its total follows), «Разложить по видам»
 * (and «Отменить»: only the layout goes back), a folded section keeps its count, «Удалить раздел» loses no row, and an
 * estimate with sections saves (the server's check of the sums passes). A long estimate (11 rows): the new section's title
 * is typed LETTER BY LETTER (a field out of sight lost the focus on the browser's scroll and closed after 0–1 letters, #1241),
 * the same for «Добавить подраздел»; «Переименовать» opens with the title as it is; «Из каталога сюда»; «Вернуть» of a delete
 * leaves a section made meanwhile whole.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => p.locator(sel).count();
  const sections = () => count('[data-testid^="est-section-"]');
  const undo = async (ok) => {
    await line.undo(h);
    return ok();
  };
  // the title typed like a person: letter by letter, then Enter; the field must stay open to the end
  const typeSectionName = async (name) => {
    const input = vis('[data-testid^="est-sec-name-"]').first().locator("input");
    await input.waitFor({ timeout: 5000 });
    await input.pressSequentially(name, { delay: 25 });
    await input.press("Enter");
    await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-sec-name-"]').length === 0, null, { timeout: 3000 });
  };
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Alpha work", 10);
  for (let i = 1; i <= 9; i++) await line.addCustom(h, `Extra ${i}`, 1);
  await line.addCatalog(h, "railing bracket", "Railing bracket");
  await line.fold(h);
  h.expect((await count('[data-testid^="est-line-"]')) === 11, "eleven rows");

  // «＋ Раздел»: the title is typed in the heading
  await tid("est-add-section").getByRole("button").click();
  await typeSectionName("Крыша");
  h.expect((await sections()) === 1, "one section");
  const sid = (await vis('[data-testid^="est-section-"]').first().getAttribute("data-testid")).replace("est-section-", "");
  { const ht = await tid(`est-section-${sid}`).innerText(); h.expect(/Крыша/.test(ht), `the title stands in the heading (${JSON.stringify(ht)})`); }

  // «⋯ → Переместить» the first row into it
  const first = (await vis('[data-testid^="est-line-"]').first().getAttribute("data-testid")).replace("est-line-", "");
  await tid(`est-line-${first}`).click();
  await tid(`est-menu-${first}`).getByRole("button").click();
  await tid(`est-act-move-${first}`).click();
  await h.sheet().getByText("Крыша").first().click();
  await p.waitForFunction((s) => !!document.querySelector(`[data-testid="est-section-${s}"]`), sid, { timeout: 3000 });
  const order = await p.locator('[data-testid^="est-section-"], [data-testid^="est-line-"], [data-testid="est-sec-loose"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  h.expect(order[0] === `est-section-${sid}` && order[1] === `est-line-${first}` && order[2] === "est-sec-loose", `the row stands under the heading, the other one is «без раздела» (${order.join(" ")})`);
  h.expect(/\$10/.test(await tid(`est-section-${sid}`).innerText()), "the section total follows ($10)");

  // «Разложить по видам» and «Отменить»: only the layout goes back
  await line.fold(h);
  await tid("est-group-by-kind").getByRole("button").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-section-"]').length >= 3, null, { timeout: 3000 });
  const back = await undo(async () => (await sections()) === 1);
  h.expect(back, "«Отменить» of the layout: one section again");
  h.expect((await count('[data-testid^="est-line-"]')) === 11, "no row lost");

  // a folded section keeps its heading and its count
  await tid(`est-sec-toggle-${sid}`).click();
  await p.waitForFunction((i) => !document.querySelector(`[data-testid="est-line-${i}"]`), first, { timeout: 3000 });
  h.expect(/Позиций: 1/.test(await tid(`est-section-${sid}`).innerText()), "folded: the count");
  await tid(`est-sec-toggle-${sid}`).click();

  const menuGone = () => p.waitForFunction(() => document.querySelectorAll('[role="menu"]').length === 0, null, { timeout: 3000 });
  const secMenu = async (id, act) => {
    await tid(`est-sec-menu-${id}`).getByRole("button").click();
    await tid(`est-sec-act-${act}-${id}`).click();
    await menuGone();
  };

  // «Добавить подраздел»: the same, letter by letter
  await secMenu(sid, "addSub");
  await typeSectionName("Кровля");
  h.expect((await sections()) === 2, "a subsection stands");
  const sub = (await p.locator('[data-testid^="est-section-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-section-", "")).find((x) => x !== sid);

  // «Переименовать»: the field opens with the title as it is now, and says what the client will read
  await secMenu(sub, "rename");
  const nameInput = vis('[data-testid^="est-sec-name-"]').first().locator("input");
  await nameInput.waitFor({ timeout: 5000 });
  h.expect((await nameInput.inputValue()) === "Кровля", "the rename opens with the title as it stands");
  h.expect(/Клиент увидит название так, как вы его написали/.test(await p.locator("body").innerText()), "the hint under the field");
  await nameInput.pressSequentially("Кровля 2", { delay: 20 });
  await nameInput.press("Enter");
  await p.waitForFunction((i) => /Кровля 2/.test(document.querySelector(`[data-testid="est-section-${i}"]`)?.textContent ?? ""), sub, { timeout: 3000 });

  // «Из каталога сюда»: the thing lands in that section
  await secMenu(sub, "catalogHere");
  await h.sheet().locator("input").first().fill("carpet");
  await h.sheet().getByText("Carpet removal").first().click();
  await vis('[data-testid^="est-qty-"]').first().locator("input").waitFor({ timeout: 3000 });
  await line.fold(h);
  const order2 = await p.locator('[data-testid^="est-section-"], [data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  h.expect(order2.indexOf(`est-section-${sub}`) >= 0 && /^est-line-/.test(order2[order2.indexOf(`est-section-${sub}`) + 1] ?? "") && (await count('[data-testid^="est-line-"]')) === 12, "the catalog thing stands under the subsection heading");

  // «Удалить раздел»: no row is lost; then another section is made, and «Вернуть» of the delete leaves it whole
  await secMenu(sid, "delete");
  await p.waitForFunction((i) => !document.querySelector(`[data-testid="est-section-${i}"]`), sid, { timeout: 3000 });
  h.expect((await count('[data-testid^="est-line-"]')) === 12, "deleted the section: every row stays");
  await tid("est-add-section").getByRole("button").click();
  await typeSectionName("Двор");
  const yard = (await p.locator('[data-testid^="est-section-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-section-", "")).find((x) => x !== sid && x !== sub);
  await secMenu(yard, "addHere");
  await vis('[data-testid^="est-name-"]').first().locator("input").fill("Yard work");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("5");
  await line.fold(h);
  h.expect(await line.undo(h), "the toast of the delete: «Вернуть» pressed");
  await p.waitForFunction((i) => !!document.querySelector(`[data-testid="est-section-${i}"]`), sid, { timeout: 3000 });
  h.expect(!!(await p.locator(`[data-testid="est-section-${yard}"]`).count()), "«Двор» is whole after the «Вернуть» of the delete");
  const yardOrder = await p.locator('[data-testid^="est-section-"], [data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid"), t: e.textContent })));
  const yi = yardOrder.findIndex((x) => x.id === `est-section-${yard}`);
  h.expect(yi >= 0 && /Yard work/.test(yardOrder[yi + 1]?.t ?? ""), "«Двор» keeps its row (Yard work)");

  // an estimate with sections saves: the sections are kept (the sums on the server are the lines' sums — see unit:estimateSections)
  const before = ((await h.db()).estimates ?? []).length;
  await tid("ue-save").getByRole("button").click();
  await p.waitForURL((u) => !/\/estimate\/new/.test(u.pathname), { timeout: 8000 });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).length === n + 1, before, { timeout: 5000 });
  const est = ((await h.db()).estimates ?? []).find((e) => e.doc?.options?.[0]?.sections?.some((x) => x.title === "Двор"));
  h.expect(!!est && est.doc.options[0].lines.length === 13, "the saved estimate keeps the sections and every row");
  h.expect(est.doc.options[0].sections.map((x) => x.title).sort().join("|") === "Двор|Кровля 2|Крыша", "all three sections are saved");
};
