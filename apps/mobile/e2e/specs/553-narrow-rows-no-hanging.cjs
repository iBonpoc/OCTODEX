/**
 * e2e 553 — rows that do not hang their parts on lines of their own (#2954, founder 26.11: «почему это всё в отдельной строке?»;
 * DS §8.7а, А14а), every view, by testID:
 * С1 ДАНО форма «Новый клиент» ТОГДА «＋» телефона и e-mail стоит в той же строке, что последнее значение (после 🗑), а не строкой ниже;
 *    единственная пустая строка — без 🗑; набрано — 🗑 есть; «＋» добавил строку — «＋» перешёл в новую последнюю строку, 🗑 одной колонкой.
 * С2 ДАНО смета EST-0006 ТОГДА строка «Депозит» — одной строкой на всех ширинах (founder 26.11: «Депозит, маленький переключатель…
 *    Текстовое поле 10% и итоговая сумма»): слово · тумблер · поле · сумма; тумблеры строк стоят столбиком.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const box = (id) => tid(id).boundingBox();
  const mid = (b) => b.y + b.height / 2;
  const count = (id) => p.getByTestId(id).locator("visible=true").count();

  // С1: the new client's form
  await h.go("/client/edit");
  await tid("client-form").waitFor({ timeout: 8000 });
  for (const g of ["client-phones", "client-emails"]) {
    if (!(await count(`${g}-row-0`))) continue;
    const [row, add] = [await box(`${g}-row-0`), await box(`${g}-add`)];
    h.expect(Math.abs(mid(add) - mid(row)) < 4, `С1 ${g}: «＋» on the value's line (row ${Math.round(mid(row))}, ＋ ${Math.round(mid(add))})`);
  }
  h.expect((await count("client-phones-row-0-remove")) === 0, "С1: a lone empty phone has no 🗑");
  await tid("client-phones-row-0-value").locator("input").fill("(818) 555-0553");
  await tid("client-phones-row-0-remove").waitFor({ timeout: 3000 });
  await tid("client-phones-add").click();
  await tid("client-phones-row-1").waitFor({ timeout: 3000 });
  const [r0, r1, add1, t0, t1] = [await box("client-phones-row-0"), await box("client-phones-row-1"), await box("client-phones-add"), await box("client-phones-row-0-remove"), await box("client-phones-row-1-remove")];
  h.expect(Math.abs(mid(add1) - mid(r1)) < 4 && mid(add1) > mid(r0) + 4, "С1: «＋» moved to the new last row");
  h.expect(Math.abs(t0.x - t1.x) < 2, `С1: the 🗑 stand in one column (${Math.round(t0.x)}, ${Math.round(t1.x)})`);
  await h.shot("client-form");

  // С2: the deposit row of an estimate
  await h.go("/estimate/new?id=e6");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await tid("est-deposit-row").scrollIntoViewIfNeeded();
  const [seg, field, sum] = [await box("est-deposit-row-mode-pct"), await box("est-deposit-row-field"), await box("est-deposit-row-sum")];
  const head = await box("est-deposit-row-head");
  // a phone (390) and 1280 hold it on one line; the 820 totals column is narrower than a phone's row — there, and only there, the
  // sum stays on the word's line and the toggle with its field go under it (DS §8.7а «две строки — только когда не входит»)
  const one = Math.abs(mid(seg) - mid(sum)) < 4;
  if (h.layout.width !== 820) h.expect(one, `С2: one line at ${h.layout.width} (toggle ${Math.round(mid(seg))}, sum ${Math.round(mid(sum))})`);
  if (one) {
    h.expect([seg, field, sum].every((b) => Math.abs(mid(b) - mid(head)) < 4), "С2: one line — the toggle, the field and the sum");
    h.expect(seg.x + seg.width <= field.x && field.x + field.width <= sum.x + 1, "С2: from left to right — the toggle, the field, the sum");
  } else {
    h.expect(Math.abs(mid(head) - mid(sum)) < 4 && sum.y + sum.height <= seg.y + 1 && Math.abs(mid(field) - mid(seg)) < 4, "С2: two lines — «word · sum», the toggle with its field under it");
  }
  const dSeg = await box("est-discount-row-mode-pct");
  h.expect(Math.abs(dSeg.x - seg.x) < 2, `С2: the toggles stand in one column (discount ${Math.round(dSeg.x)}, deposit ${Math.round(seg.x)})`);
  await h.shot("deposit");
};
