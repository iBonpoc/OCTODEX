/**
 * e2e 343 — the estimate's action bar and a series of deletions (DS §8.9, §15.2, §8.3; #1307 part «в»), every view, by testID:
 * - 390 (v2 #2350): the pinned bar is ONE row — «Итого» on the left, the one step on the right, ≥ 40 high; «Сохранить и
 *   отправить» is in «⋯» (the tech has none, «Отправит офис» stands); 820 / 1280: no bar, the step stands in the column;
 * - three lines deleted one after another: ONE toast «Удалено позиций: 3» (the count grows, the toast is not replaced);
 *   a price changed between the deletions stays after «Вернуть», and all three lines are back on their places; another
 *   toast between two deletions ends the series;
 * - the empty description of the open row is one line high, grows with the text and comes back down when it is erased.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const box = async (sel) => (await vis(sel).first().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const lineIds = async () => (await p.locator('[data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-line-", ""));
  const phone = h.layout.width < 820;

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });

  // the bar (v2 #2350, the founder 21.11 «одна компактная строка»): ONE row — «Итого $…» on the left, the one step on the right
  // («Добавить позицию» while there is no line), the button at least 40 high; «Сохранить и отправить» is an item of «⋯», not in
  // the bar. From 820 there is no pinned bar: no «Итого» in it, the step stands in the column after the totals.
  if (phone) {
    const bar = '[data-testid="est-bar-add-bar"]';
    const [bb, tot, add] = [await box(bar), await box(`${bar} [data-testid="est-bar-total"]`), await box(`${bar} [data-testid="est-bar-add"]`)];
    const vh = p.viewportSize().height;
    h.expect(bb.height > 0 && vh - (bb.y + bb.height) >= 0 && vh - (bb.y + bb.height) < 40, `the bar is pinned at the bottom (${Math.round(bb.y + bb.height)} of ${vh})`);
    h.expect(Math.abs(tot.y + tot.height / 2 - (add.y + add.height / 2)) < 8 && tot.x < add.x, `one row: «Итого» left, the step right (${Math.round(tot.x)},${Math.round(tot.y)} / ${Math.round(add.x)},${Math.round(add.y)})`);
    h.expect(add.height >= 39.5, `the step is at least 40 high (${add.height})`);
    h.expect((await vis(`${bar} [data-testid="ue-save-send"]`).count()) === 0, "«Сохранить и отправить» is not in the bar");
  } else {
    h.expect((await vis('[data-testid="est-bar-total"]').count()) === 0, "no pinned bar from 820: no «Итого» of the bar");
    const [dep, add] = [await box('[data-testid="est-deposit-row"]'), await box('[data-testid="est-bar-add"]')];
    h.expect(add.height > 0 && add.y > dep.y, "from 820 the step stands in the column, after the totals");
  }
  h.expect(!(await line.editorMenuHas(h, "ue-save-send")), "«Отправить» is not in «⋯» (one place: the round ➤, #2403)");

  // the empty description: one line; it grows with the text
  await tid("est-add-new").getByRole("button").click();
  const a = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  const desc = vis(`[data-testid="est-line-${a}"] textarea`).first();
  // the field's frame (the bordered box around the text), not the text itself
  const frame = (loc) => loc.evaluate((el) => el.parentElement.getBoundingClientRect().height);
  const h0 = await frame(desc);
  const name = await frame(vis(`[data-testid="est-name-${a}"] input`).first());
  h.expect(Math.abs(h0 - name) < 1, `the empty description is one line, as the name field (${h0} vs ${name})`);
  await desc.fill("Line one\nLine two\nLine three");
  await p.waitForFunction((id) => {
    const el = document.querySelector(`[data-testid="est-line-${id}"] textarea`);
    return el && el.parentElement.getBoundingClientRect().height > 70;
  }, a, { timeout: 3000 });
  // the text erased: one line again (a textarea's height must come back down)
  await desc.fill("");
  await p.waitForFunction(([id, hh]) => {
    const el = document.querySelector(`[data-testid="est-line-${id}"] textarea`);
    return el && Math.abs(el.parentElement.getBoundingClientRect().height - hh) < 1;
  }, [a, name], { timeout: 3000 });
  await desc.fill("Cleaned and flushed");
  await vis(`[data-testid="est-name-${a}"] input`).first().fill("Gutter clean (тестовые)");
  await vis(`[data-testid="est-price-${a}"] input`).first().fill("10");
  await h.shot("desc");
  await line.fold(h);
  await line.addCustom(h, "Downspout (тестовые)", 20);
  await line.addCustom(h, "Guard (тестовые)", 30);
  await line.addCustom(h, "Haul-away (тестовые)", 40);
  const before = await lineIds();
  h.expect(before.length === 4, `four lines (${before.length})`);

  // three deletions in a row, a price changed between them: one toast that counts
  const [x, y, keep, z] = before;
  // (visual v2 №5: a folded row has no trash — a swipe on a phone, «⋯ → Удалить» of its menu on the web)
  const del = async (id) => {
    await line.menu(h, id);
    await tid(`est-act-delete-${id}`).click();
  };
  await del(x);
  await p.waitForFunction((id) => !document.querySelector(`[data-testid="est-line-${id}"]`), x, { timeout: 3000 });
  await del(y);
  await p.waitForFunction(() => /Удалено позиций: 2/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });
  await tid(`est-line-${keep}`).click();
  await vis(`[data-testid="est-price-${keep}"] input`).first().fill("35");
  await line.fold(h);
  await del(z);
  await p.waitForFunction(() => /Удалено позиций: 3/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });
  h.expect((await p.getByTestId("toast-text").count()) === 1, "one toast");
  // #2428: the toast stands ABOVE the pinned bar («Итого» · «Готово», or its capsule) on a phone — never on it
  if (phone) {
    const tb = await box('[data-testid="toast"]');
    const bb2 = await box('[data-testid="ue-save-bar"], [data-testid="ue-save-capsule"]');
    h.expect(tb.height > 0 && bb2.height > 0 && tb.y + tb.height <= bb2.y + 0.5, `the toast stands above the bar (${Math.round(tb.y + tb.height)} ≤ ${Math.round(bb2.y)})`);
  }
  await h.shot("series");
  h.expect(await line.undo(h), "«Вернуть» pressed");
  await p.waitForFunction((n) => document.querySelectorAll('[data-testid^="est-line-"]').length === n, before.length, { timeout: 3000 });
  h.expect((await lineIds()).join() === before.join(), "all three back, each on its place");
  h.expect(/\$35\b/.test(await tid(`est-sum-${keep}`).innerText()), "the price changed between the deletions stays ($35)");

  // another toast between two deletions ends the series: the next deletion is «Позиция удалена», not «Удалено позиций: 2»
  await del(x);
  await p.waitForFunction(() => /Позиция удалена/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });
  await line.menu(h, keep);
  await tid(`est-act-duplicate-${keep}`).click();
  await p.waitForFunction(() => !/Позиция удалена/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });
  await del(y);
  await p.waitForFunction(() => /Позиция удалена/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });

  // the tech saves, the office sends (#1113): no «Сохранить и отправить» in «⋯», «Отправит офис» stands (every width)
  await h.seed("octo.role.v1", "tech");
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  h.expect(!(await line.editorMenuHas(h, "ue-save-send")) && (await tid("est-send-top").count()) === 0, "the tech: no «Отправить»");
  h.expect(/Отправит офис/.test(await tid("est-bar-office").innerText()), "the tech: «Отправит офис»");
  await h.shot("tech");
  await h.seed("octo.role.v1", "director");
};
