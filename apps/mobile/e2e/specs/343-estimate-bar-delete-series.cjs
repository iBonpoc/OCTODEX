/**
 * e2e 343 — the estimate's action bar and a series of deletions (DS §8.9, §15.2, §8.3; #1307 part «в»), every view, by testID:
 * - 390: the pinned bar has the buttons IN ONE ROW — «Сохранить» on the left, «Сохранить и отправить» on the right, widths
 *   2 : 3, each 44 high; the tech has one «Сохранить» across the bar; 820 / 1280: no bar, the buttons stand in the column;
 * - three lines deleted one after another: ONE toast «Удалено позиций: 3» (the count grows, the toast is not replaced);
 *   a price changed between the deletions stays after «Вернуть», and all three lines are back on their places;
 * - the empty description of the open row is one line high and grows with the text.
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

  // the bar: one row 2 : 3, 44 high (a phone); no bar on a wide screen
  if (phone) {
    const bar = '[data-testid="est-actionbar"]';
    const [save, send] = [await box(`${bar} [data-testid="ue-save"] [role="button"]`), await box(`${bar} [data-testid="ue-save-send"] [role="button"]`)];
    h.expect(Math.abs(save.y - send.y) < 2 && save.x < send.x, `one row: «Сохранить» left, «Сохранить и отправить» right (${Math.round(save.x)},${Math.round(save.y)} / ${Math.round(send.x)},${Math.round(send.y)})`);
    const ratio = save.width / send.width;
    h.expect(ratio > 0.6 && ratio < 0.74, `widths 2 : 3 (${Math.round(save.width)} : ${Math.round(send.width)})`);
    h.expect(save.height >= 43.5 && send.height >= 43.5, `44 high (${save.height}, ${send.height})`);
  } else {
    h.expect((await vis('[data-testid="est-actionbar"]').count()) === 0, "no pinned bar from 820");
    await tid("ue-save").waitFor({ timeout: 3000 });
  }

  // the empty description: one line; it grows with the text
  await tid("est-add-new").getByRole("button").click();
  const a = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  const desc = vis(`[data-testid="est-line-${a}"] textarea`).first();
  // the field's frame (the bordered box around the text), not the text itself
  const frame = (loc) => loc.evaluate((el) => el.parentElement.getBoundingClientRect().height);
  const h0 = await frame(desc);
  const name = await frame(vis(`[data-testid="est-name-${a}"] input`).first());
  h.expect(Math.abs(h0 - name) < 2, `the empty description is one line, as the name field (${h0} vs ${name})`);
  await desc.fill("Line one\nLine two\nLine three");
  await p.waitForFunction((id) => {
    const el = document.querySelector(`[data-testid="est-line-${id}"] textarea`);
    return el && el.parentElement.getBoundingClientRect().height > 70;
  }, a, { timeout: 3000 });
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
  await tid(`est-trash-${x}`).getByRole("button").click();
  await p.waitForFunction((id) => !document.querySelector(`[data-testid="est-line-${id}"]`), x, { timeout: 3000 });
  await tid(`est-trash-${y}`).getByRole("button").click();
  await p.waitForFunction(() => /Удалено позиций: 2/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });
  await tid(`est-line-${keep}`).click();
  await vis(`[data-testid="est-price-${keep}"] input`).first().fill("35");
  await line.fold(h);
  await tid(`est-trash-${z}`).getByRole("button").click();
  await p.waitForFunction(() => /Удалено позиций: 3/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });
  h.expect((await p.getByTestId("toast-text").count()) === 1, "one toast");
  await h.shot("series");
  h.expect(await line.undo(h), "«Вернуть» pressed");
  await p.waitForFunction((n) => document.querySelectorAll('[data-testid^="est-line-"]').length === n, before.length, { timeout: 3000 });
  h.expect((await lineIds()).join() === before.join(), "all three back, each on its place");
  h.expect(/\$35\b/.test(await tid(`est-sum-${keep}`).innerText()), "the price changed between the deletions stays ($35)");

  // the tech: one «Сохранить» across the bar
  if (phone) {
    await h.seed("octo.role.v1", "tech");
    await h.go("/estimate/new?customerId=c2&propertyId=p2");
    await tid("est-actionbar").waitFor({ timeout: 8000 });
    h.expect((await vis('[data-testid="est-actionbar"] [data-testid="ue-save-send"]').count()) === 0, "the tech: no «Сохранить и отправить»");
    const [bar, save] = [await box('[data-testid="est-actionbar"]'), await box('[data-testid="est-actionbar"] [data-testid="ue-save"] [role="button"]')];
    h.expect(save.width > bar.width * 0.85, `the tech's «Сохранить» across the bar (${Math.round(save.width)} of ${Math.round(bar.width)})`);
  }
};
