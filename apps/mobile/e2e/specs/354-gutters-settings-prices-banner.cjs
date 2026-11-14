/**
 * e2e 354 — «Настройки водостоков» и «Цены и прайс»: состояние экрана одним баннером (#1426, дизайн-аудит 14.11; DS Б9, §15.3).
 * Every view.
 * - the module off: settings and prices say it with ONE banner (`Banner` warn) whose one action is «Подключить» — not a two-line chip
 *   with the button apart; «Подключить» leads to «Модули»;
 * - the module on, nothing in the price list: ONE warn banner «Нет в прайсе: N» with «Создать позиции сразу (N)»; the cards say «—»
 *   and never repeat «нет в прайсе» (it was 24 same orange chips);
 * - one row made while others are missing: its card says «тестовая цена» (no test-price banner then; rule 9);
 * - made: the banner says «Тестовые цены: N» (the state by its name); the cards do not repeat «тестовая цена» while all are test;
 * - a tech (read only): the «read only» banner, and every test price marked on its card.
 * Finds things by testID; waits on what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const STATES = ["gpr-locked", "gpr-ro", "gpr-missing-n", "gpr-all-found"];
  const banners = async () => {
    let n = 0;
    for (const id of STATES) n += await tid(id).count();
    return n;
  };
  const text = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");

  // the module off: settings — one banner with «Подключить»
  await h.go("/module/gutters/settings");
  await tid("gset-locked").waitFor({ timeout: 8000 });
  h.expect(/Модуль не подключён/.test(await tid("gset-locked").innerText()), "the settings say the module is off in the banner");
  await tid("gset-locked-action").getByRole("button", { name: "Подключить" }).waitFor({ timeout: 3000 });
  await h.shot("settings-locked");

  // prices, off: one banner, nothing to make
  await h.go("/module/gutters/prices");
  await tid("gpr-locked").waitFor({ timeout: 8000 });
  h.expect((await banners()) === 1, `one state banner on the prices (${await banners()})`);
  h.expect((await tid("gpr-missing-n-action").count()) === 0, "off: nothing to make");
  // «Подключить» from the banner → «Модули», on
  await tid("gpr-locked-action").getByRole("button", { name: "Подключить" }).click();
  await p.waitForURL(/\/company\/modules/, { timeout: 8000 });
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });

  // on, nothing in the price list: one warn banner with the number and its action; the cards do not repeat it
  await h.go("/module/gutters/prices");
  await tid("gpr-missing-n").waitFor({ timeout: 8000 });
  h.expect((await banners()) === 1, `one state banner (${await banners()})`);
  h.expect(/Нет в прайсе: \d+/.test(await tid("gpr-missing-n").innerText()), "the banner says how many are missing");
  await tid("gpr-missing-n-action").getByRole("button", { name: /Создать позиции сразу \(\d+\)/ }).waitFor({ timeout: 3000 });
  const misses = await p.locator('[data-testid^="gpr-miss-"]').locator("visible=true").count();
  h.expect(misses > 10, `the cards are there (${misses})`);
  h.expect(!/нет в прайсе/.test(await text()), "no card repeats «нет в прайсе» (the banner says it once)"); // i18n-old: ok — the old chip must be gone
  // the banner's action is not repeated on every row: one row is made from its card (a tap → the sheet with «Создать с тестовой ценой»)
  h.expect((await p.locator('[data-testid^="gpr-miss-"]').locator("visible=true").getByRole("button", { name: "Создать с тестовой ценой" }).count()) === 0, "no «Создать с тестовой ценой» button on the rows");
  await h.shot("prices-missing");

  // one row made with a test price while others are still missing: no «Тестовые цены» banner (the missing one is more urgent) —
  // so the card itself says «тестовая цена» (rule 9: a test price is never shown unmarked)
  const first = p.locator('[data-testid^="gpr-miss-"]').locator("visible=true").first();
  const key = (await first.getAttribute("data-testid")).slice("gpr-miss-".length);
  await first.click();
  await tid("gpr-bind-make").getByRole("button").click();
  await tid(`gpr-test-${key}`).waitFor({ timeout: 8000 });
  h.expect(/тестовая цена/.test(await tid(`gpr-test-${key}`).innerText()), "a test price under the «missing» banner is marked on its card");
  await tid("gpr-missing-n").waitFor({ timeout: 5000 });

  // made: «Тестовые цены: N» — one banner again
  await tid("gpr-missing-n-action").getByRole("button").click();
  await tid("gpr-all-found").waitFor({ timeout: 8000 });
  h.expect((await banners()) === 1, `one state banner after «Создать» (${await banners()})`);
  h.expect(/Тестовые цены: \d+/.test(await tid("gpr-all-found").innerText()), "the banner names the state: the test prices left to set");
  // its number is the price list's test items — the one made from a card before + the ones «Создать позиции сразу» made (its toast)
  const shown = Number((await tid("gpr-all-found").innerText()).match(/Тестовые цены: (\d+)/)[1]);
  // the store is written to the phone a moment later: wait for the saved list to have them, then compare
  const testItems = await p.waitForFunction((n) => {
    const db = (JSON.parse(localStorage.getItem("octo.db.v5") || "null") || {}).db || {};
    const c = (db.catalog || []).filter((x) => x.placeholder && x.attributes && Object.keys(x.attributes).length).length;
    return c >= n ? c : false;
  }, shown, { timeout: 8000 }).then((r) => r.jsonValue());
  h.expect(shown === testItems, `«Тестовые цены: ${shown}» = the test items in the price list (${testItems})`);
  // all of them test: the cards do not repeat «тестовая цена» (DS Б9: only while own and test prices are mixed)
  h.expect(!/тестовая цена/.test(await text()), "no card repeats «тестовая цена» while all prices are test ones");
  await h.shot("prices-made");

  // a tech reads the prices: the «read only» banner is the one shown — every test price is marked on its card
  await h.seed("octo.role.v1", "tech");
  await h.go("/module/gutters/prices");
  await tid("gpr-ro").waitFor({ timeout: 8000 });
  const tests = await p.locator('[data-testid^="gpr-test-"]').locator("visible=true").count();
  const marked = await p.locator('[data-testid^="gpr-test-"]').locator("visible=true").filter({ hasText: "тестовая цена" }).count();
  h.expect(tests > 10 && marked === tests, `read only: every test price is marked on its card (${marked} of ${tests})`);
  await h.seed("octo.role.v1", "director");
};
