const { listSearch, listSearchClear } = require("../listSearch.cjs");
const { expectOneAccent } = require("../accent.cjs");
/**
 * Client card C1 (docs/specs/04 §7.2): number, tags, owes / paid total, rows with counters (13 §3.3), people with several phones,
 * tags and status sheets, search by a second phone, tech rights. Same steps at every width (sheets are a dialog
 * on 820 / 1280, but every control used here is the same).
 */
exports.run = async (h) => {
  const p = h.page;
  // the client's sections are view tabs (#1343, DS §9 А1п): a tab shows its list in place; «Люди» is a row on «Обзор»
  const TAB = { "История": "history", "Счета и квитанции": "invoices", "Задачи": "tasks", "Файлы": "files" };
  const row = async (name) => {
    if (name === "Люди") await p.getByTestId("client-people").locator("visible=true").first().getByRole("button").first().click();
    else {
      const k = TAB[name];
      const pill = p.getByTestId(`client-tabs-${k}`).locator("visible=true").first();
      await pill.scrollIntoViewIfNeeded();
      await pill.click();
      await p.getByTestId(`client-tab-${k}`).locator("visible=true").first().waitFor({ timeout: 4000 });
    }
    await p.waitForTimeout(300);
  };
  const save = async () => { await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500); };

  await h.go("/client/c1");
  await expectOneAccent(h, "client card");
  await h.expectText(/CLT-0001/, "client number in the header");
  await h.expectText(/VIP[\s\S]*Постоянный/, "tags, translated, in order");
  await h.expectText(/Долг[\s\S]*\$0[\s\S]*Оплачено[\s\S]*\$582\b/, "owes / paid (one word each, #1417)");
  await h.expectText(/Контакты[\s\S]*\(626\) 555-0142/, "the main person's contacts first");
  await h.expectText(/Люди[\s\S]*Tom Mitchell/, "the spouse in the row «Люди»");
  await h.expectText(/Выставлено/, "invoiced");
  await h.expectText(/\(626\) 555-0143/, "second phone of the main person");

  await row("История");
  h.expect(/[?&]tab=history\b/.test(p.url()), `«История» opens in place, the address keeps it (${p.url()})`);
  await h.expectText(/Смета подписана/, "history: estimate signed");
  await h.expectText(/Оплата/, "history: payment (office)");
  await h.go("/client/c1");
  await row("Счета и квитанции");
  await h.expectText(/INV-0105/, "invoices: invoice");
  await h.expectText(/RCT-0102/, "invoices: receipt");
  await h.go("/client/c1");
  await row("Задачи");
  await h.expectText(/Задач нет/, "tasks: empty state");
  // wave 6: the one task form (TaskSheet) — the client is already «к чему»
  await h.click("Новая задача");
  await h.expectText(/К чему.*Sarah Mitchell/, "the form is tied to the client");
  await h.sheet().getByPlaceholder("Например: перезвонить и уточнить объём").fill("Call in spring about painting");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  await h.expectText(/Call in spring about painting/, "task added");
  // recipe E (06 §3): the tick on the left closes the task; «Отменить» in the toast takes it back
  const taskId = (await h.db()).tasks.find((x) => x.title === "Call in spring about painting").id;
  // the store is written to disk a moment after the tap: wait for the saved task, not for seconds
  const savedOpen = () => p.waitForFunction((id) => !JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.tasks.find((x) => x.id === id)?.doneAt, taskId, { timeout: 5000 }).then(() => true, () => false);
  const openCard = p.getByTestId(`client-task-${taskId}`).locator("visible=true");
  const doneCard = p.getByTestId(`client-task-done-${taskId}`).locator("visible=true");
  await openCard.getByRole("button", { name: "Готово", exact: true }).click();
  await doneCard.waitFor({ timeout: 5000 });
  await h.expectText(/Задача выполнена/, "the toast says done");
  await h.expectText(/Выполненные · 1[\s\S]*Call in spring about painting/, "done task stays, under Done");
  // «Отменить» works only toastArmMs after the toast showed (ui/toastArm.ts), as in e2e 90
  await p.waitForTimeout(500);
  await h.click("Отменить");
  await openCard.waitFor({ timeout: 5000 });
  h.expect(await savedOpen(), "«Отменить» took the tick back");
  // close again, then the tick of the done task reopens it
  await openCard.getByRole("button", { name: "Готово", exact: true }).click();
  await doneCard.waitFor({ timeout: 5000 });
  await doneCard.getByRole("button", { name: "Вернуть", exact: true }).click();
  await openCard.waitFor({ timeout: 5000 });
  await h.expectText(/Задача снова открыта/, "the toast says reopened");
  h.expect((await savedOpen()) && (await doneCard.count()) === 0, "task reopened");
  await h.go("/client/c1");
  await row("Файлы");
  await h.expectText(/Фото с выездов|Файлов нет/, "files list renders");

  // People: + Phone is a button; the new phone of the spouse is saved and shown
  await h.go("/client/c1");
  await row("Люди");
  await p.getByRole("button", { name: "Люди", exact: true }).last().click();
  await p.waitForTimeout(500);
  await h.sheet().getByRole("button", { name: "Телефон", exact: true }).last().click();
  await h.sheet().getByPlaceholder("Телефон").last().fill("6265550199");
  await save();
  await h.expectText(/\(626\) 555-0199/, "new phone in the people list");
  await h.go("/client/c1");

  // Tags sheet: add Favorite
  await p.getByRole("button", { name: "VIP", exact: true }).first().click();
  await p.waitForTimeout(500);
  await h.sheet().getByRole("checkbox", { name: "Избранный" }).click().catch(async () => h.sheet().getByText("Избранный", { exact: true }).click());
  await save();
  await h.expectText(/VIP[\s\S]*Постоянный[\s\S]*Избранный/, "tag added");

  // Status menu at the label (not a sheet): archive at once; "do not service" asks for a reason
  await p.getByRole("button", { name: /^Статус клиента/ }).click();
  await p.waitForTimeout(400);
  await p.getByRole("menuitem", { name: "В архиве" }).click();
  await p.waitForTimeout(400);
  await h.expectText(/В архиве/, "archived from the menu");
  await p.getByRole("button", { name: /^Статус клиента/ }).click();
  await p.waitForTimeout(400);
  await p.getByRole("menuitem", { name: "Не обслуживаем" }).click();
  await p.waitForTimeout(500);
  h.expect(await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().isDisabled(), "save needs a reason");
  await h.sheet().getByPlaceholder("Почему не обслуживаем").fill("Did not pay twice");
  await save();
  await h.expectText(/Не обслуживаем[\s\S]*Причина: Did not pay twice/, "status + reason on the card");
  await h.shot("card");

  // list: search by the spouse's new phone; the status shows on the card
  await h.go("/clients");
  await listSearch(p, "555-0199");
  await p.waitForTimeout(400);
  await h.expectText(/Sarah Mitchell/, "found by a second person's phone");
  await listSearchClear(p);
  // tags sit behind «Фильтр» in a sheet (spec 31: the button next to the search; 1280 — «Метки ▾» in the row)
  await p.getByRole("button", { name: /^Фильтры, включено: 0$/ }).click();
  await p.waitForTimeout(400);
  await h.sheet().getByRole("checkbox", { name: /^Избранный( · \d+)?$/ }).click();
  await h.sheet().getByText("Готово", { exact: true }).click();
  await p.waitForTimeout(400);
  const fav = await h.text();
  h.expect(/Linda Alvarez/.test(fav) && !/David Kim/.test(fav), "filter by tag");

  // tech: own clients only, no money
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/client/c2");
  const txt = await h.text();
  h.expect(/David Kim/.test(txt) && !/Долг/.test(txt) && !/Оплачено/.test(txt), "tech sees own client without money");
  // the client's jobs: the cards are there, the sums are not (value only for the office)
  await h.go("/client/c2?s=jobs");
  await p.locator('[data-testid^="client-job-"]').locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(!/\$\d/.test(await h.text()), "tech: no sums on the client's job cards");
  await h.go("/client/c7");
  await h.expectText(/Ничего не найдено/, "tech does not open other clients");
};
