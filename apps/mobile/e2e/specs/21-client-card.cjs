const { expectOneAccent } = require("../accent.cjs");
/**
 * Client card C1 (docs/specs/04 §7.2): number, tags, owes / paid total, rows with counters (13 §3.3), people with several phones,
 * tags and status sheets, search by a second phone, tech rights. Same steps at every width (sheets are a dialog
 * on 820 / 1280, but every control used here is the same).
 */
exports.run = async (h) => {
  const p = h.page;
  // rows with counters (13 §3.3): each opens its own list at /client/c1?s=<row>
  const row = async (name) => { await p.getByTestId("client-rows").getByRole("button", { name, exact: true }).click(); await p.waitForTimeout(500); };
  const save = async () => { await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500); };

  await h.go("/client/c1");
  await expectOneAccent(h, "client card");
  await h.expectText(/CLT-0001/, "client number in the header");
  await h.expectText(/VIP[\s\S]*Постоянный/, "tags, translated, in order");
  await h.expectText(/Должен[\s\S]*\$0[\s\S]*Оплатил всего[\s\S]*\$582\b/, "owes / paid total");
  await h.expectText(/Контакты[\s\S]*\(626\) 555-0142/, "the main person's contacts first");
  await h.expectText(/Люди[\s\S]*Tom Mitchell/, "the spouse in the row «Люди»");
  await h.expectText(/Выставлено всего/, "invoiced total");
  await h.expectText(/\(626\) 555-0143/, "second phone of the main person");

  await row("История");
  h.expect(p.url().includes("/client/c1?s=history"), `history row opens its list (${p.url()})`);
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
  await h.click("Готово");
  await h.expectText(/Выполненные · 1[\s\S]*Call in spring about painting/, "done task stays, under Done");
  await h.click("Вернуть");
  await h.expectText(/Call in spring about painting[\s\S]*Готово/, "task reopened");
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
  await p.getByPlaceholder("Имя, телефон или адрес").fill("555-0199");
  await p.waitForTimeout(400);
  await h.expectText(/Sarah Mitchell/, "found by a second person's phone");
  await p.getByPlaceholder("Имя, телефон или адрес").fill("");
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
  h.expect(/David Kim/.test(txt) && !/Должен/.test(txt) && !/Оплатил всего/.test(txt), "tech sees own client without money");
  await h.go("/client/c7");
  await h.expectText(/Ничего не найдено/, "tech does not open other clients");
};
