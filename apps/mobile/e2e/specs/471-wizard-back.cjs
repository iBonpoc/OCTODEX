/**
 * e2e 471 — #2002 (founder 17.11: «кнопка дальше и кнопка назад… вспомнил, что сделал ошибку»): the company setup wizard has
 * «‹ Назад» next to the main button from the 2nd step. Every view, by testID and the store.
 * - Step 1 has no «Назад»; outside the wizard there is none.
 * - What is typed on a step is kept by «Назад» (saved quietly), and the step before opens with its own fields.
 * - The required field of the step before is asked again there: an empty name keeps «Сохранить и дальше» off.
 * - A list step (licenses) goes back too.
 * #2007 (founder 17.11: «один и тот же экран показывается дважды»):
 * С3 ДАНО у компании уже есть направление (выбрано на «Чем вы занимаетесь?»), КОГДА на шаге «Логотип и цвет» нажимаю
 *    «Сохранить и дальше», ТОГДА открывается «Документы и оплата» — шаг «Направления» не повторяется; шагов 7, а не 8.
 * С4 ДАНО направлений нет, ТОГДА шаг «Направления» в мастере есть (шагов 8).
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const path = () => new URL(p.url()).pathname + new URL(p.url()).search;

  // step 1: no «Назад»
  await h.go("/company/profile?wizard=1");
  await tid("co-save").waitFor({ timeout: 8000 });
  h.expect((await tid("co-wizard-back").count()) === 0, "step 1 has no «Назад»");

  // step 2: type a street, «Назад» → step 1; the street is kept
  await h.go("/company/address?wizard=1");
  await tid("co-wizard-back").waitFor({ timeout: 8000 });
  const street = p.getByPlaceholder(/улица|Street|Улица/i).locator("visible=true").first();
  await street.fill("471 Back Street");
  const back = tid("co-wizard-back");
  const bb = await back.boundingBox();
  const sb = await tid("co-save").boundingBox();
  h.expect(bb.x < sb.x && Math.abs(bb.y - sb.y) <= 2, `«Назад» on the left of «Сохранить и дальше», in one row (${bb.x},${bb.y} / ${sb.x},${sb.y})`);
  await back.locator('[role="button"]').first().click();
  await p.waitForURL((u) => u.pathname === "/company/profile" && u.search.includes("wizard=1"), { timeout: 8000 });
  h.expect(true, `«Назад» opened step 1 (${path()})`);
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.company?.address?.line1 === "471 Back Street", null, { timeout: 8000 });
  h.expect(true, "what was typed on step 2 is kept");
  await h.shot("step1-after-back");

  // the required field of step 1 is asked again: an empty name keeps the main button off
  const name = tid("co-group-profile").locator("input").first();
  const was = await name.inputValue();
  await name.fill("");
  h.expect((await tid("co-save").locator('[role="button"]').first().getAttribute("aria-disabled")) === "true", "an empty name: «Сохранить и дальше» is off");
  await name.fill(was);

  // forward again: step 2 shows the kept street
  await tid("co-save").locator('[role="button"]').first().click();
  await p.waitForURL((u) => u.pathname === "/company/address", { timeout: 8000 });
  await p.getByPlaceholder(/улица|Street|Улица/i).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByPlaceholder(/улица|Street|Улица/i).locator("visible=true").first().inputValue()) === "471 Back Street", "step 2 shows the kept street");

  // a list step goes back too
  await h.go("/company/licenses?wizard=1");
  await tid("co-wizard-back").waitFor({ timeout: 8000 });
  await tid("co-wizard-back").locator('[role="button"]').first().click();
  await p.waitForURL((u) => u.pathname === "/company/contacts" && u.search.includes("wizard=1"), { timeout: 8000 });
  h.expect(true, "licenses → «Назад» → contacts");
  await h.shot("list-step");

  // outside the wizard: no «Назад»
  await h.go("/company/address");
  await tid("co-save").waitFor({ timeout: 8000 });
  h.expect((await tid("co-wizard-back").count()) === 0, "outside the wizard there is no «Назад»");

  // С3: the directions were chosen at the first run (the demo has them): «Направления» is not asked again
  await h.go("/company/brand?wizard=1");
  await tid("co-save").waitFor({ timeout: 8000 });
  h.expect(/из 7/.test(await p.locator("body").innerText()), "С3 the wizard has 7 steps when a direction is chosen");
  await tid("co-save").locator('[role="button"]').first().click();
  await p.waitForURL((u) => u.pathname === "/company/documents", { timeout: 8000 });
  h.expect(true, "С3 «Логотип и цвет» → «Документы и оплата»: no second «Направления»");
  await tid("co-wizard-back").locator('[role="button"]').first().click();
  await p.waitForURL((u) => u.pathname === "/company/brand", { timeout: 8000 });
  h.expect(true, "С3 «Назад» from «Документы» skips it too");

  // С4: no directions yet — the step is there
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.company, null, { timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw.db.serviceCategories = (raw.db.serviceCategories || []).map((x) => ({ ...x, archivedAt: x.archivedAt || "2026-11-01T00:00:00.000Z" }));
  await h.seed("octo.db.v5", raw);
  await h.go("/company/brand?wizard=1");
  await tid("co-save").waitFor({ timeout: 8000 });
  h.expect(/из 8/.test(await p.locator("body").innerText()), "С4 no direction: 8 steps");
  await tid("co-save").locator('[role="button"]').first().click();
  await p.waitForURL((u) => u.pathname === "/company/trades", { timeout: 8000 });
  h.expect(true, "С4 «Логотип и цвет» → «Направления»");
};
