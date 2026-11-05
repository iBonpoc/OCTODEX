/**
 * Client card C1 (docs/specs/04 §7.2): number, tags, owes / paid total, tabs, people with several phones,
 * tags and status sheets, search by a second phone, tech rights. Same steps at every width (sheets are a dialog
 * on 820 / 1280, but every control used here is the same).
 */
exports.run = async (h) => {
  const p = h.page;
  const tab = (name) => p.getByRole("tab", { name: new RegExp(`^${name}`) }).click().then(() => p.waitForTimeout(400));
  const save = async () => { await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500); };

  await h.go("/client/c1");
  await h.expectText(/CLT-0001/, "client number in the header");
  await h.expectText(/VIP[\s\S]*Постоянный/, "tags, translated, in order");
  await h.expectText(/Должен[\s\S]*\$0[\s\S]*Оплатил всего[\s\S]*\$582\b/, "owes / paid total");
  await h.expectText(/Tom Mitchell[\s\S]*Супруг\(а\)/, "second person with a role");
  await h.expectText(/\(626\) 555-0143/, "second phone of the main person");

  await tab("История");
  await h.expectText(/Смета подписана/, "history: estimate signed");
  await h.expectText(/Оплата/, "history: payment (office)");
  await tab("Документы");
  await h.expectText(/INV-0105/, "documents: invoice");
  await h.expectText(/RCT-0102/, "documents: receipt");
  await tab("Задачи");
  await h.expectText(/Задач нет/, "tasks: empty state");
  await p.getByPlaceholder("Новая задача").fill("Call in spring about painting");
  await h.click("Добавить");
  await h.expectText(/Call in spring about painting/, "task added");
  await tab("Файлы");
  await h.expectText(/Фото с выездов|Файлов нет/, "files tab renders");
  await tab("Обзор");

  // People: + Phone is a button; the new phone of the spouse is saved and shown
  await p.getByRole("button", { name: "Изменить", exact: true }).last().click();
  await p.waitForTimeout(500);
  await h.sheet().getByRole("button", { name: "Телефон", exact: true }).last().click();
  await h.sheet().getByPlaceholder("Телефон").last().fill("6265550199");
  await save();
  await h.expectText(/\(626\) 555-0199/, "new phone on the card");

  // Tags sheet: add Favorite
  await p.getByRole("button", { name: "VIP", exact: true }).first().click();
  await p.waitForTimeout(500);
  await h.sheet().getByRole("checkbox", { name: "Избранный" }).click().catch(async () => h.sheet().getByText("Избранный", { exact: true }).click());
  await save();
  await h.expectText(/VIP[\s\S]*Постоянный[\s\S]*Избранный/, "tag added");

  // Status sheet: do not service needs a reason
  await p.getByRole("button", { name: /^Статус клиента/ }).click();
  await p.waitForTimeout(500);
  await h.sheet().getByRole("radio", { name: "Не обслуживаем" }).click();
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

  // tech: own clients only, no money
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/client/c2");
  const txt = await h.text();
  h.expect(/David Kim/.test(txt) && !/Должен/.test(txt) && !/Оплатил всего/.test(txt), "tech sees own client without money");
  await h.go("/client/c7");
  await h.expectText(/Ничего не найдено/, "tech does not open other clients");
};
