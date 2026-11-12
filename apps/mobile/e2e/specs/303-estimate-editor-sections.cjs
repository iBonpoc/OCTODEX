/**
 * e2e 303 — разделы сметы (РС-5a, DS §8.5, спека Р4–Р5), every view; finds by testID (rule 19):
 * «＋ Раздел» (the title is typed in the heading), «⋯ → Переместить» a row into it (its total follows), «Разложить по видам»
 * (and «Отменить»: only the layout goes back), a folded section keeps its count, «Удалить раздел» loses no row, and an
 * estimate with sections saves (the server's check of the sums passes).
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => p.locator(sel).count();
  const sections = () => count('[data-testid^="est-section-"]');
  const undo = async (ok) => {
    const btn = p.getByRole("button", { name: /Отменить/ }).locator("visible=true");
    for (let i = 0; i < 10 && (await btn.count()) > 0; i++) {
      await btn.last().click();
      if (await p.waitForFunction(() => !Array.from(document.querySelectorAll("button, [role=button]")).some((e) => /Отменить/.test(e.getAttribute("aria-label") || e.textContent || "")), null, { timeout: 400 }).then(() => true, () => false)) break;
    }
    return ok();
  };
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Alpha work", 10);
  await line.addCatalog(h, "railing bracket", "Railing bracket");
  await line.fold(h);
  h.expect((await count('[data-testid^="est-line-"]')) === 2, "two rows");

  // the title: the whole title in one go (a typed-by-letter title is cut by a blur that commits it),
  // Enter by the keyboard (a blur commits the same title, so a field that has already gone is no failure)
  const typeSectionName = async (name) => {
    await vis('[data-testid^="est-sec-name-"]').first().locator("input").fill(name);
    await p.keyboard.press("Enter");
  };
  // «＋ Раздел»: the title is typed in the heading
  await tid("est-add-section").getByRole("button").click();
  await typeSectionName("Крыша");
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-sec-name-"]').length === 0, null, { timeout: 3000 });
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
  h.expect((await count('[data-testid^="est-line-"]')) === 2, "no row lost");

  // a folded section keeps its heading and its count
  await tid(`est-sec-toggle-${sid}`).click();
  await p.waitForFunction((i) => !document.querySelector(`[data-testid="est-line-${i}"]`), first, { timeout: 3000 });
  h.expect(/Позиций: 1/.test(await tid(`est-section-${sid}`).innerText()), "folded: the count");
  await tid(`est-sec-toggle-${sid}`).click();

  // «Удалить раздел»: no row is lost
  await tid(`est-sec-menu-${sid}`).getByRole("button").click();
  await tid(`est-sec-act-delete-${sid}`).click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-section-"]').length === 0, null, { timeout: 3000 });
  h.expect((await count('[data-testid^="est-line-"]')) === 2, "deleted the section: both rows stay");

  // (the menu that deleted it gives the focus back to its button: wait until it is gone, else it takes the focus from the next field)
  await p.waitForFunction(() => document.querySelectorAll('[role="menu"]').length === 0, null, { timeout: 3000 });
  // an estimate with a section saves: the server's check of the sums passes (no 22023), the sections are kept
  await tid("est-add-section").getByRole("button").click();
  await typeSectionName("Двор");
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-section-"]').length === 1, null, { timeout: 3000 });
  const before = ((await h.db()).estimates ?? []).length;
  await tid("ue-save").getByRole("button").click();
  await p.waitForURL((u) => !/\/estimate\/new/.test(u.pathname), { timeout: 8000 });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).length === n + 1, before, { timeout: 5000 });
  const est = ((await h.db()).estimates ?? []).find((e) => e.doc?.options?.[0]?.sections?.some((x) => x.title === "Двор"));
  h.expect(!!est && est.doc.options[0].lines.length === 2, "the saved estimate keeps the section and both rows");
};
