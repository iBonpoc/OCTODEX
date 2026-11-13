/**
 * e2e 344 — the list folds while a row is carried (DS §14.6, decision 13.11, #1307 part «б»), every view, by testID, with the mouse:
 * - «Подробно» and an open row: a row taken by «≡» — the open row folds and EVERY row is short («Кратко»: no «× qty») while it is held;
 * - the held row stays under the pointer after the list folded;
 * - the open row has «≡» in its header right of «⋯», its name field takes the row's width;
 * - let go: the row flashes, the list is «Подробно» again, the row stands in its new place, the toast «Позиция перенесена» with «Вернуть».
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (sel) => p.locator(sel).locator("visible=true").count();
  const ids = async () => (await p.locator('[data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-line-", ""));

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  for (const [n, v] of [["Alpha (тестовые)", 10], ["Bravo (тестовые)", 20], ["Charlie (тестовые)", 30], ["Delta (тестовые)", 40]]) await line.addCustom(h, n, v, 2);
  await tid("est-row-view").getByText("Подробно", { exact: true }).click();
  const [a, b, , d] = await ids();
  await tid(`est-times-${a}`).waitFor({ timeout: 3000 });
  // an open row in the middle
  await tid(`est-line-${b}`).click();
  await tid(`est-collapse-${b}`).waitFor({ timeout: 3000 });

  // the open row draws «≡» in its header, right of «⋯» (DS §8.3): the fields take the whole width
  const [col, hdl, menu, row] = [await tid(`est-collapse-${b}`).boundingBox(), await tid(`sort-handle-l:${b}`).boundingBox(), await tid(`est-menu-${b}`).boundingBox(), await tid(`est-line-${b}`).boundingBox()];
  h.expect(Math.abs(hdl.y + hdl.height / 2 - (col.y + col.height / 2)) < 12 && hdl.x > menu.x, `«≡» in the header, right of «⋯» (≡ ${Math.round(hdl.x)},${Math.round(hdl.y)} · «Свернуть» y ${Math.round(col.y)})`);
  const nameBox = await p.locator(`[data-testid="est-name-${b}"]`).locator("visible=true").first().boundingBox();
  h.expect(nameBox.x + nameBox.width > row.x + row.width - 12, `the name field takes the row's width (${Math.round(nameBox.x + nameBox.width)} of ${Math.round(row.x + row.width)})`);
  await h.shot("open-handle");

  // take D by its handle and hold it
  const hd = tid(`sort-handle-l:${d}`);
  await hd.scrollIntoViewIfNeeded();
  const hb = await hd.boundingBox();
  const x = hb.x + hb.width / 2;
  const y0 = hb.y + hb.height / 2;
  await p.mouse.move(x, y0);
  await p.mouse.down();
  await p.mouse.move(x, y0 - 12, { steps: 4 });
  await p.getByTestId("sort-bar").first().waitFor({ timeout: 3000 });
  // the list has folded and settled (the page scrolled the row's place under the pointer)
  await p.getByTestId("sort-folded").first().waitFor({ state: "attached", timeout: 3000 });
  // the whole list is short: the open row folded, no «× qty» anywhere
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-times-"]').length === 0 && document.querySelectorAll('[data-testid^="est-collapse-"]').length === 0, null, { timeout: 3000 });
  h.expect(true, "the list folded: every row short, the open row folded");
  // the held row is under the pointer (the fold moved the rows above it)
  await p.waitForFunction(([id, py]) => {
    const r = document.querySelector(`[data-testid="est-line-${id}"]`)?.getBoundingClientRect();
    return r && r.top - 24 <= py && py <= r.bottom + 24;
  }, [d, y0 - 12], { timeout: 2000 }).catch(() => {});
  const held = await p.getByTestId(`est-line-${d}`).first().boundingBox();
  h.expect(held && held.y - 24 <= y0 - 12 && y0 - 12 <= held.y + held.height + 24, `the held row is under the pointer (row ${held && Math.round(held.y)}–${held && Math.round(held.y + held.height)}, pointer ${Math.round(y0 - 12)})`);
  await h.shot("held");

  // carry it to the very top of the list and let go (the list's own top: a row above may stand shifted to make room)
  const top = await p.getByTestId("sort-bar").first().evaluate((el) => el.parentElement.getBoundingClientRect().top);
  await p.mouse.move(x, top + 4, { steps: 12 });
  await p.mouse.up();
  await p.waitForFunction((first) => document.querySelector('[data-testid^="est-line-"]')?.getAttribute("data-testid") === `est-line-${first}`, d, { timeout: 4000 });
  await p.waitForFunction(() => /Позиция перенесена/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });
  // the landed row flashes (a frame `acc` that fades)
  await p.getByTestId(`sort-flash-l:${d}`).first().waitFor({ state: "attached", timeout: 2000 });
  // «Подробно» again
  await tid(`est-times-${a}`).waitFor({ timeout: 3000 });
  // the list unfolded and the landed row is still under the pointer (the page scrolled to keep it)
  const py = top + 4;
  await p.waitForFunction(([id, y]) => {
    const r = document.querySelector(`[data-testid="est-line-${id}"]`)?.getBoundingClientRect();
    return r && r.top - 24 <= y && y <= r.bottom + 24;
  }, [d, py], { timeout: 2000 }).catch(() => {});
  const land = await p.getByTestId(`est-line-${d}`).first().boundingBox();
  h.expect(land.y - 24 <= py && py <= land.y + land.height + 24, `after the unfold the row is under the pointer (row ${Math.round(land.y)}–${Math.round(land.y + land.height)}, pointer ${Math.round(py)})`);
  h.expect((await count('[data-testid="toast-undo"]')) === 1, "the toast has «Вернуть»");
  await h.shot("landed");
};
