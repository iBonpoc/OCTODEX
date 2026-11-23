/**
 * e2e 344 — the list folds while a row is carried (DS §14.6, decision 13.11, #1307 part «б»), every view, by testID, with the mouse:
 * - «Подробно» and an open row: a row taken by «≡» — the open row folds and EVERY row is short («Кратко»: no «× qty») while it is held;
 * - the held row stays under the pointer after the list folded;
 * - the open row has «≡» in its head (the folded face, #2421), centred, right of the trash; its name field takes the row's width;
 * - let go: the row flashes, the list is «Подробно» again, the row stands in its new place, the toast «Позиция перенесена» with «Вернуть».
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const { waited } = require("../sheet.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (sel) => p.locator(sel).locator("visible=true").count();
  const ids = async () => (await p.locator('[data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-line-", ""));

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  for (const [n, v] of [["Alpha (тестовые)", 10], ["Bravo (тестовые)", 20], ["Charlie (тестовые)", 30], ["Delta (тестовые)", 40]]) await line.addCustom(h, n, v, 2);
  await line.editorMenu(h, "est-row-view"); // «⋯ → Строки подробно» (v2: an item of the header menu)
  const [a, b, , d] = await ids();
  // «Подробно» (v2): the row's line reads «$10.00 × 2 ea» («Кратко» reads «2 ea × $10.00»)
  await p.waitForFunction((id) => /^\$[\d,.]+ × /.test((document.querySelector(`[data-testid="est-times-${id}"]`)?.textContent || "").trim()), a, { timeout: 3000 });
  // an open row in the middle
  await tid(`est-line-${b}`).click();
  await tid(`est-collapse-${b}`).waitFor({ timeout: 3000 });

  // the open row draws «≡» in its head (#2421: the folded face), centred on it, right of the trash (DS §8.3): the fields take the whole width
  // the list puts «≡» on the head's middle once the head told its height (a layout event): wait for it, no fixed pause
  await p
    .waitForFunction((id) => {
      const a = document.querySelector(`[data-testid="sort-handle-l:${id}"]`)?.getBoundingClientRect();
      const b = document.querySelector(`[data-testid="est-collapse-${id}"]`)?.getBoundingClientRect();
      return !!a && !!b && Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 2;
    }, b, { timeout: 3000 })
    .catch(() => {});
  const [col, hdl, trash, row] = [await tid(`est-collapse-${b}`).boundingBox(), await tid(`sort-handle-l:${b}`).boundingBox(), await tid(`est-trash-${b}`).boundingBox(), await tid(`est-line-${b}`).boundingBox()];
  h.expect(Math.abs(hdl.y + hdl.height / 2 - (col.y + col.height / 2)) < 2 && hdl.x >= trash.x + trash.width - 1, `«≡» in the head, centred, right of the trash (≡ ${Math.round(hdl.x)},${Math.round(hdl.y)},${Math.round(hdl.height)} · head ${Math.round(col.y)},${Math.round(col.height)} · trash ${Math.round(trash.x + trash.width)})`);
  const nameBox = await p.locator(`[data-testid="est-name-${b}"]`).locator("visible=true").first().boundingBox();
  // #2387: the open row keeps the card's inset space[4] (16) on both sides — the field runs to it, not short of it
  h.expect(nameBox.x + nameBox.width > row.x + row.width - 16 - 4, `the name field takes the row's width inside its inset (${Math.round(nameBox.x + nameBox.width)} of ${Math.round(row.x + row.width)})`);
  await h.shot("open-handle");

  // take D by its handle and hold it
  const hd = await line.grip(h, `l:${d}`);
  await line.toMiddle(h, hd);
  const hb = await hd.boundingBox();
  const x = hb.x + hb.width / 2;
  const y0 = hb.y + hb.height / 2;
  await p.mouse.move(x, y0);
  await p.mouse.down();
  await p.mouse.move(x, y0 - 12, { steps: 4 });
  // the list has folded and settled (the page scrolled the row's place under the pointer, as far as it could)
  await p.getByTestId("sort-folded").first().waitFor({ state: "attached", timeout: 3000 });
  // the whole list is short («Кратко»): the open row folded, no «$price × qty» of «Подробно» anywhere
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid^="est-times-"]')].some((e) => /^\$[\d,.]+ × /.test((e.textContent || "").trim())) && document.querySelectorAll('[data-testid^="est-collapse-"]').length === 0, null, { timeout: 3000 });
  h.expect(true, "the list folded: every row short, the open row folded");
  // the held row is seen: inside the list (not cut off past its end, not over a neighbour), and under the pointer unless the page
  // could not scroll that far (it stands on its own place then)
  const seen = await p.evaluate(([id, py]) => {
    const row = document.querySelector(`[data-testid="est-line-${id}"]`)?.getBoundingClientRect();
    const list = document.querySelector('[data-testid="sort-folded"]')?.parentElement?.getBoundingClientRect();
    let e = document.querySelector('[data-testid^="est-line-"]');
    while (e && !(e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== "visible")) e = e.parentElement;
    const atTop = !e || e.scrollTop <= 1;
    // or at its end: the page could not scroll the row's place up to the pointer either (SortableList afterFold)
    const atEnd = !!e && e.scrollTop >= e.scrollHeight - e.clientHeight - 1;
    const under = !!row && row.top - 24 <= py && py <= row.bottom + 24;
    const inside = !!row && !!list && row.top >= list.top - 8 && row.bottom <= list.bottom + 8;
    return { inside, under, atTop, atEnd, row: row && [Math.round(row.top), Math.round(row.bottom)], list: list && [Math.round(list.top), Math.round(list.bottom)] };
  }, [d, y0 - 12]);
  h.expect(seen.inside && (seen.under || seen.atTop || seen.atEnd), `the held row is seen (${JSON.stringify(seen)}, pointer ${Math.round(y0 - 12)})`);
  await h.shot("held");

  // carry it to the very top of the list and let go (the list's own top: a row above may stand shifted to make room)
  const top = await p.getByTestId("sort-folded").first().evaluate((el) => el.parentElement.getBoundingClientRect().top);
  await line.carry(h, `l:${d}`, x, y0 - 12, top + 8);
  await p.mouse.up();
  await p.waitForFunction((first) => document.querySelector('[data-testid^="est-line-"]')?.getAttribute("data-testid") === `est-line-${first}`, d, { timeout: 4000 });
  await p.waitForFunction(() => /Позиция перенесена/.test(document.querySelector('[data-testid="toast-text"]')?.textContent || ""), null, { timeout: 3000 });
  // the landed row flashes (a frame `acc` that fades)
  await p.getByTestId(`sort-flash-l:${d}`).first().waitFor({ state: "attached", timeout: 2000 });
  // «Подробно» again
  await p.waitForFunction((id) => /^\$[\d,.]+ × /.test((document.querySelector(`[data-testid="est-times-${id}"]`)?.textContent || "").trim()), a, { timeout: 3000 });
  // the list unfolded and the landed row is still under the pointer (the page scrolled to keep it)
  const py = top + 4;
  const landed = await waited(p.waitForFunction(([id, y]) => {
    const r = document.querySelector(`[data-testid="est-line-${id}"]`)?.getBoundingClientRect();
    return r && r.top - 24 <= y && y <= r.bottom + 24;
  }, [d, py], { timeout: 2000 }));
  const land = await p.getByTestId(`est-line-${d}`).first().boundingBox();
  h.expect(landed, `after the unfold the row is under the pointer (row ${Math.round(land.y)}–${Math.round(land.y + land.height)}, pointer ${Math.round(py)})`);
  h.expect((await count('[data-testid="toast-undo"]')) === 1, "the toast has «Вернуть»");
  await h.shot("landed");
};
