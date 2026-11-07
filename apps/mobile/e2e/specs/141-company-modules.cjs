/**
 * e2e 141 — «Компания → Модули» (docs/specs/33-gutters-module.md П15.4 C2b; S0b; founder О1–О2). Every view.
 * - director: «Компания» has the «Модули» card → /company/modules: the Gutters card «Не подключён», «7 дней бесплатно,
 *   потом $30 в месяц»; «Подключить» → «Пробный · осталось 7 дн.» (saved with a trial end ~7 days on); «Отменить» takes it
 *   back; on again → «Отключить» → «Отключён» + «Включить снова» → the trial again (the same end: never restarted);
 * - the trial over (the stored end moved into the past) → «Пробный период закончился», the «nothing is saved» note,
 *   «Подключить» off with «Оплата — скоро»;
 * - the step «Направления» links to the page; the office (dispatcher) sees it read-only: the note, no buttons.
 * Waits on the stored data by condition (the phone's copy is written with a pause), finds things by testID.
 */
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const DAY = 86_400_000;

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
  h.expect(/7 дней бесплатно, потом \$30 в месяц/.test(card), `the price (${card})`);
  h.expect((await tid("module-gutters-disable").count()) === 0, "nothing to switch off yet");
  await h.shot("off");

  // «Подключить» → the 7-day trial; «Отменить» takes it back
  const t0 = await p.evaluate(() => Date.now()); // the page's clock (e2e/clock.cjs), not the runner's
  await tid("module-gutters-enable").getByRole("button").click();
  await waitStatus(/^Пробный · осталось 7 дн\.$/, "the trial started");
  let db = await waitDb((d) => gut(d) && gut(d).enabled, "switched on is saved");
  const ends = Date.parse(gut(db).trialEndsAt);
  h.expect(Math.abs(ends - (t0 + 7 * DAY)) < 60_000, `the trial ends in 7 days (${gut(db).trialEndsAt})`);
  await h.shot("trial");
  await p.getByRole("button", { name: /Отменить/ }).first().click();
  await waitStatus(/^Не подключён$/, "«Отменить» takes it back");
  await waitDb((d) => !gut(d), "nothing stored after «Отменить»");

  // on again → off → on again: the same trial end
  await tid("module-gutters-enable").getByRole("button").click();
  await waitStatus(/^Пробный/, "on again");
  db = await waitDb((d) => gut(d) && gut(d).enabled, "on again is saved");
  const end = gut(db).trialEndsAt;
  await tid("module-gutters-disable").getByRole("button").click();
  await waitStatus(/^Отключён$/, "switched off");
  await waitDb((d) => gut(d) && gut(d).enabled === false, "off is saved, the row stays");
  await tid("module-gutters-enable").waitFor({ timeout: 3000 });
  h.expect(/Включить снова/.test(await tid("module-gutters-enable").innerText()), "«Включить снова» while the trial runs");
  await h.shot("disabled");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitStatus(/^Пробный/, "back on: the trial");
  db = await waitDb((d) => gut(d) && gut(d).enabled, "back on is saved");
  h.expect(gut(db).trialEndsAt === end, `the trial is never restarted (${gut(db).trialEndsAt} vs ${end})`);

  // the trial over: the stored end in the past → «Пробный период закончился», payment «скоро»
  await p.waitForTimeout(600); // the phone's copy is written with a pause: let it land before editing it
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.company.modules.gutters.trialEndsAt = new Date(Date.now() - 86_400_000).toISOString();
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
