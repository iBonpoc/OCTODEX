/**
 * e2e 521 — «Деньги», the overview of the tab (visual-v2 №6, #2344), every view, by testID:
 * - the tab «Деньги» opens /finance: the yellow tile «Должны · счета» with what the live invoices owe, «Сметы открыты», the three small
 *   tiles; «К оплате» — the overdue invoice first, its «Срок» in the bad word; «Оплачены сегодня» with today's payments;
 * - the tiles and «Все ›» open the lists (the segment «Сметы · Счета · Оплаты» is there, not on the overview).
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/finance");
  await tid("money-tile-owed").waitFor({ timeout: 8000 });
  const db = await h.db();
  const live = db.invoices.filter((i) => i.totalCents > i.paidCents);
  const owed = live.reduce((s, i) => s + i.totalCents - i.paidCents, 0);
  // #3029/#3030 (founder 27.11): a KPI tile is an overview — whole dollars (was #2888 «with cents»)
  const sum = `$${Math.floor((owed + 50) / 100).toLocaleString("en-US")}`;
  h.expect((await tid("money-tile-owed").innerText()).includes(sum), `«Должны» says ${sum}`);
  await tid("money-tile-estimates").waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("money-tiles-small").locator("visible=true").count()) === 1, "the three small tiles");
  // «К оплате»: the overdue one first, «−N дн»
  const rows = p.locator('[data-testid^="money-topay-i"]').locator("visible=true");
  h.expect((await rows.count()) >= 1, "«К оплате» has rows");
  h.expect(/Просрочен \d+ дн/.test(await rows.first().innerText()), "the first row is overdue: «Просрочен N дн»");
  h.expect((await p.locator('[data-testid^="money-paid-"]').locator("visible=true").count()) >= 1, "«Оплачены сегодня» has today's payments");
  // the segment «Сметы · Счета · Оплаты» (Segmented `est-list-chips`: its tabs are `est-list-chips-<key>`)
  h.expect((await p.locator('[data-testid^="est-list-chips"]').locator("visible=true").count()) === 0, "no segment on the overview");
  await h.shot("overview");
  // «Все ›» → the invoices
  await tid("money-topay-all").click();
  await p.waitForURL(/\/invoice/, { timeout: 5000 });
  await h.go("/finance");
  await tid("money-tile-estimates").click();
  await p.waitForURL(/\/estimates/, { timeout: 5000 });
  await tid("est-list-chips-estimates").waitFor({ timeout: 5000 });
};
