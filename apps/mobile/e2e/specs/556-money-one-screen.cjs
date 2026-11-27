/**
 * e2e 556 — «Деньги» is ONE screen (#3025, founder 26.11: «нажимаю кнопку меню Деньги — одна вкладка… нажимаю „Все“ внутри — другая
 * вкладка Деньги с другим видом и уже без карточек KPI… что-то поломалось»). Every view, the director, by testID:
 * - the tab «Деньги» (phone) opens the lists «Сметы · Счета · Оплаты» on «Счета» (/invoice) — not an overview of tiles that repeats
 *   «Главная» (no `money-tile-owed`, the old overview's yellow tile);
 * - an old link /finance comes to the same screen;
 * - «Счета» in the side menu (820/1280) is that screen too.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const oneScreen = async (how) => {
    await tid("invoice-list").waitFor({ timeout: 8000 });
    await tid("invoice-list-chips-invoices").waitFor({ timeout: 4000 });
    h.expect(new URL(p.url()).pathname === "/invoice", `${how}: the lists of «Деньги» (${new URL(p.url()).pathname})`);
    h.expect((await p.getByTestId("money-tile-owed").locator("visible=true").count()) === 0, `${how}: no overview tiles repeating «Главная»`);
  };

  await h.go("/");
  if (h.layout.width < 820) {
    await tid("tab-finance").click();
    await oneScreen("the tab «Деньги»");
  }
  await h.go("/finance");
  await oneScreen("an old link /finance");
  await h.shot("money");
};
