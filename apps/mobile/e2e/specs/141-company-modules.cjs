/**
 * e2e 141 — «Компания → Модули» (docs/specs/33-gutters-module.md П15.4 C2b; S0b; founder О1–О2). Every view.
 * - director: «Компания» has the «Модули» card → /company/modules: the Gutters card «Не подключён», no price and no
 *   «7 дней бесплатно» in the demo (#2410); «Подключить» → «Без срока» (#2410: the demo has no trial — no end of the phone's own, no «N days
 *   left»); «Отменить» takes it back; on again → «Отключить» → «Отключён» + «Включить снова» → «Без срока» again
 *   (the 7-day trial and «never restarted» are the server's: db T90);
 * - a stored row with a term (unlimited: false — only e2e writes it) whose trial is over → «Пробный период закончился»,
 *   the «nothing is saved» note, «Подключить» off with «Оплата — скоро»;
 * - the step «Направления» links to the page; the office (dispatcher) sees it read-only: the note, no buttons.
 * Waits on the stored data by condition (the phone's copy is written with a pause), finds things by testID.
 */
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitDb = async (ok, what) => {
    let db = await h.db();
    for (let i = 0; i < 30 && !(db && ok(db)); i++) { await p.waitForTimeout(200); db = await h.db(); }
    h.expect(!!db && ok(db), what);
    return db;
  };
  const status = async () => (await tid("module-gutters-status").innerText()).trim();
  const waitStatus = async (re, what) => {
    let s = await status();
    for (let i = 0; i < 25 && !re.test(s); i++) { await p.waitForTimeout(200); s = await status(); }
    h.expect(re.test(s), `${what} (${s})`);
  };
  const gut = (db) => db.company.modules && db.company.modules.gutters;

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/company");
  await tid("company-modules").waitFor({ timeout: 5000 });
  await tid("company-modules").scrollIntoViewIfNeeded();
  await tid("company-modules").getByRole("button").click();
  await p.waitForURL(/\/company\/modules$/, { timeout: 5000 });
  await tid("module-gutters").waitFor({ timeout: 5000 });
  await waitStatus(/^Не подключён$/, "never switched on");
  const card = await tid("module-gutters").innerText();
  h.expect(!/дней бесплатно|в месяц/.test(card), `the demo shows no trial and no price (${card})`);
  h.expect((await tid("module-gutters-enable").innerText()).trim() === "Подключить", "«Подключить» without «7 дней бесплатно»");
  h.expect((await tid("module-gutters-disable").count()) === 0, "nothing to switch off yet");
  await h.shot("off");

  // «Подключить» → on with no term (the demo, #2410); «Отменить» takes it back
  await tid("module-gutters-enable").getByRole("button").click();
  await waitStatus(/^Без срока$/, "on, no term");
  let db = await waitDb((d) => gut(d) && gut(d).enabled, "switched on is saved");
  h.expect(!gut(db).trialEndsAt, `the demo starts no trial of its own (${gut(db).trialEndsAt})`);
  await h.shot("trial");
  await p.getByRole("button", { name: /Отменить/ }).first().click();
  await waitStatus(/^Не подключён$/, "«Отменить» takes it back");
  await waitDb((d) => !gut(d), "nothing stored after «Отменить»");

  // on again → off → «Включить снова»: no term again
  await tid("module-gutters-enable").getByRole("button").click();
  await waitStatus(/^Без срока$/, "on again");
  db = await waitDb((d) => gut(d) && gut(d).enabled, "on again is saved");
  await tid("module-gutters-disable").getByRole("button").click();
  await waitStatus(/^Отключён$/, "switched off");
  await waitDb((d) => gut(d) && gut(d).enabled === false, "off is saved, the row stays");
  await tid("module-gutters-enable").waitFor({ timeout: 3000 });
  h.expect(/Включить снова/.test(await tid("module-gutters-enable").innerText()), "«Включить снова», no new trial");
  await h.shot("disabled");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitStatus(/^Без срока$/, "back on: no term");
  await waitDb((d) => gut(d) && gut(d).enabled, "back on is saved");

  // a row with a term whose trial is over (e2e only: unlimited: false) → «Пробный период закончился», payment «скоро»
  await p.waitForTimeout(600); // the phone's copy is written with a pause: let it land before editing it
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.company.modules.gutters.trialEndsAt = new Date(Date.now() - 86_400_000).toISOString();
    raw.db.company.modules.gutters.unlimited = false;
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/company/modules");
  await tid("module-gutters").waitFor({ timeout: 5000 });
  await waitStatus(/^Пробный период закончился$/, "the trial is over");
  const over = await tid("module-gutters").innerText();
  h.expect(/ничего не сохраняется/.test(over), `the «nothing is saved» note (${over})`);
  await tid("module-gutters-pay").waitFor({ timeout: 3000 });
  h.expect(/Оплата — скоро/.test(await tid("module-gutters-pay").innerText()), "payment is «скоро»");
  h.expect(await tid("module-gutters-pay").getByRole("button").isDisabled(), "«Подключить» is off until the step «Оплаты»");
  h.expect((await tid("module-gutters-enable").count()) === 0, "no new trial");
  await h.shot("expired");

  // the step «Направления» links here
  await h.go("/company/trades");
  await tid("trades-modules").waitFor({ timeout: 5000 });
  await tid("trades-modules").getByRole("button").click();
  await p.waitForURL(/\/company\/modules$/, { timeout: 5000 });

  // the office: read-only
  await setRole(h, "dispatcher");
  await h.go("/company/modules");
  await tid("module-gutters").waitFor({ timeout: 5000 });
  await h.expectText(/Только просмотр — менять может директор/, "the read-only note for the office");
  h.expect((await tid("module-gutters-pay").count()) === 0 && (await tid("module-gutters-disable").count()) === 0, "no buttons for the office");
  await h.shot("office");
};
