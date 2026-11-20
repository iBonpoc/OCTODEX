/**
 * e2e 476 — #2007 (founder 17.11: «экран какой-то дублируется дважды»): after «Создать компанию» the first run asks «Чем вы
 * занимаетесь?» (auth/trade), and the wizard asked the same again at its step «Направления». Every view, by testID and the store.
 * С1 ДАНО у компании уже есть направление (выбрано на «Чем вы занимаетесь?»), КОГДА на шаге «Логотип и цвет» нажимаю
 *    «Сохранить и дальше», ТОГДА открывается «Документы и оплата» — «Направления» не повторяются; шагов 7, а не 8.
 * С2 ДАНО направлений нет, ТОГДА шаг «Направления» в мастере есть (шагов 8).
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const body = () => p.locator("body").innerText();

  // С1: the demo company has directions
  await h.go("/company/brand?wizard=1");
  await tid("co-save").waitFor({ timeout: 8000 });
  h.expect(/из 7/.test(await body()), "С1 the wizard has 7 steps when a direction is chosen");
  await tid("co-save").locator('[role="button"]').first().click();
  await p.waitForURL((u) => u.pathname === "/company/documents", { timeout: 8000 });
  h.expect(true, "С1 «Логотип и цвет» → «Документы и оплата»: no second «Направления»");
  h.expect(/Шаг 7 из 7/.test(await body()), "С1 «Документы и оплата» is step 7 of 7");
  await h.shot("documents-7");

  // С2: no directions yet — the step is there
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.company, null, { timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw.db.serviceCategories = (raw.db.serviceCategories || []).map((x) => ({ ...x, archivedAt: x.archivedAt || "2026-11-01T00:00:00.000Z" }));
  await h.seed("octo.db.v5", raw);
  await h.go("/company/brand?wizard=1");
  await tid("co-save").waitFor({ timeout: 8000 });
  h.expect(/из 8/.test(await body()), "С2 no direction: 8 steps");
  await tid("co-save").locator('[role="button"]').first().click();
  await p.waitForURL((u) => u.pathname === "/company/trades", { timeout: 8000 });
  h.expect(true, "С2 «Логотип и цвет» → «Направления»");
};
