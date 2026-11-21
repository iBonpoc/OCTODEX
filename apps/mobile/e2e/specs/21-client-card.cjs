const { sheetGone } = require("../sheet.cjs");
const { listSearch, listSearchClear } = require("../listSearch.cjs");
const { expectOneAccent } = require("../accent.cjs");
const { objSection, objMore, objCreate } = require("../objectScreen.cjs");
const { listChip } = require("../listScreen.cjs");
/**
 * Client card C1 (docs/specs/04 §7.2) in the v2 Object template (#2350, features/client/ClientCard): number and contacts in the
 * header's panel («⌄»), tags, owes / paid in «Счета», the sections strip «Обзор · Работы · Сметы · Счета · Объекты · Журнал»,
 * people with several phones, tags and status sheets, search by a second phone, tech rights. Same steps at every width.
 * Found by testID (CHECKS §9 №2/№26). Files are not a section of the client in v2 (the visit and the job keep them).
 */
exports.run = async (h) => {
  const p = h.page;
  const S = "client-screen";
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const inner = (id) => p.getByTestId(id).first().innerText();
  const section = async (k) => {
    await objSection(p, S, k);
    await p.waitForTimeout(300);
  };
  const save = async () => { await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500); };

  await h.go("/client/c1");
  await expectOneAccent(h, "client card");
  // the header's panel (contacts, addresses, facts) — the number, the main person's phones first, then the spouse
  h.expect(/CLT-0001/.test(await inner("client-facts")), "client number in the header's panel");
  h.expect(/VIP/.test(await vis("screen-head-big").innerText()), "the first tag beside the name");
  const people = await inner("client-people");
  h.expect(/Контакты · 2[\s\S]*\(626\) 555-0142[\s\S]*\(626\) 555-0143[\s\S]*Tom Mitchell/.test(people), `the main person's contacts first, then Tom («Контакты · 2»): ${people.slice(0, 200)}`);

  // «Журнал»: the history; the address keeps the section
  await section("log");
  h.expect(/[?&]tab=log\b/.test(p.url()), `«Журнал» opens in place, the address keeps it (${p.url()})`);
  const log = await inner("client-feed");
  h.expect(/Смета подписана/.test(log) && /Оплата/.test(log), "history: estimate signed, payment (office)");
  // «Счета»: owes / paid / still to bill once each, the invoice and the receipt
  await section("money");
  const money = await inner("client-money");
  h.expect(/\$0[\s\S]*Долг[\s\S]*\$582[\s\S]*Оплачено/.test(money), `owes / paid (one word each, #1417): ${money.slice(0, 120)}`);
  h.expect(/INV-0105/.test(money) && /RCT-0102/.test(money), "invoices: invoice and receipt");

  // «＋ → Новая задача» — the one task form (TaskSheet), the client is already «к чему»; open tasks live in «Журнал»
  await section("log");
  await objCreate(p, S, "client-create-task");
  await h.expectText(/К чему.*Sarah Mitchell/, "the form is tied to the client");
  await h.sheet().getByPlaceholder("Например: перезвонить и уточнить объём").fill("Call in spring about painting");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await sheetGone(p);
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.tasks.some((x) => x.title === "Call in spring about painting"), null, { timeout: 5000 });
  const taskId = (await h.db()).tasks.find((x) => x.title === "Call in spring about painting").id;
  await vis(`client-task-${taskId}`).waitFor({ timeout: 5000 });
  // recipe E (06 §3): the tick closes the task; «Отменить» in the toast takes it back
  const savedOpen = () => p.waitForFunction((id) => !JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.tasks.find((x) => x.id === id)?.doneAt, taskId, { timeout: 5000 }).then(() => true, () => false);
  await vis(`client-task-done-btn-${taskId}`).click();
  await p.getByTestId(`client-task-${taskId}`).locator("visible=true").first().waitFor({ state: "hidden", timeout: 5000 });
  await h.expectText(/Задача выполнена/, "the toast says done");
  h.expect(/Выполненные · 1/.test(await inner("client-tasks-done")), "the done task is counted under «Выполненные»");
  // «Отменить» works only toastArmMs after the toast showed (ui/toastArm.ts), as in e2e 90
  // «Отменить» of that toast (the toasts stack: «Задача сохранена» is under it); it counts once armed (ui/toastArm.ts)
  await p.getByTestId("toast").filter({ hasText: "Задача выполнена" }).locator('[data-testid="toast-undo"][aria-busy="false"]').first().click();
  await vis(`client-task-${taskId}`).waitFor({ timeout: 5000 });
  h.expect(await savedOpen(), "«Отменить» took the tick back");

  // People: «⋯ → Контакты» opens the sheet; «⊕ Добавить телефон» of the spouse; the new phone is saved and shown
  await h.go("/client/c1");
  await objMore(p, S, "client-act-people");
  await h.sheet().getByTestId("people-sheet").waitFor({ timeout: 5000 });
  await h.sheet().getByTestId("people-1-phones-add").click();
  await h.sheet().getByTestId("people-1-phones-row-1-value").locator("input").fill("6265550199");
  await h.sheet().getByTestId("people-save").click();
  await sheetGone(p);
  // an old address of the people section still opens the client
  await h.go("/client/c1?s=people");
  h.expect(/\(626\) 555-0199/.test(await inner("client-people")), "new phone in the people list");
  await h.go("/client/c1");

  // Tags sheet (rows with a check, «Готово · N») from «⋯ → Метки»: add Favorite
  await objMore(p, S, "client-act-tags");
  await h.sheet().getByText("Избранный", { exact: true }).click();
  await h.sheet().getByTestId("tags-done").click();
  await sheetGone(p);
  // the store is written to disk a moment after the tap: wait for the saved tags (VIP, Постоянный, Избранный — in order)
  h.expect(await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.customers.find((c) => c.id === "c1")?.tagIds?.length === 3, null, { timeout: 5000 }).then(() => true, () => false), "three tags saved");
  h.expect(/VIP/.test(await vis("screen-head-big").innerText()), "the first tag still beside the name");

  // the status at the header — the one StatusPicker (DS §9 А10): archive at once; "do not service" asks for a reason
  await vis("client-header-status").click();
  await h.sheet().getByRole("radio", { name: "В архиве" }).click();
  await sheetGone(p);
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.customers.find((c) => c.id === "c1")?.status === "archived", null, { timeout: 5000 });
  h.expect(/В архиве/.test(await inner("client-header-status")), "archived from the picker");
  await vis("client-header-status").click();
  await h.sheet().getByRole("radio", { name: "Не обслуживаем" }).click();
  await h.sheet().getByPlaceholder("Почему не обслуживаем").waitFor({ timeout: 5000 });
  h.expect(await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().isDisabled(), "save needs a reason");
  await h.sheet().getByPlaceholder("Почему не обслуживаем").fill("Did not pay twice");
  await save();
  h.expect(/Не обслуживаем/.test(await inner("client-header-status")), "the status «Не обслуживаем» in the header");
  h.expect(/Did not pay twice/.test(await inner("client-plate")), "the reason on the card");
  await h.shot("card");

  // list: search by the spouse's new phone; tags are chips of the strip (v2)
  await h.go("/clients");
  await listSearch(p, "555-0199");
  await vis("client-row-c1").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("client-row-c2").locator("visible=true").count()) === 0, "found by a second person's phone, only Sarah");
  await listSearchClear(p);
  await listChip(p, "clients", /^Избранный/).click();
  await vis("client-row-c3").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("client-row-c2").locator("visible=true").count()) === 0, "filter by tag: Linda, not David");

  // tech: own clients only, no money
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/client/c2");
  const txt = await h.text();
  h.expect(/David Kim/.test(txt) && !/Долг/.test(txt) && !/Оплачено/.test(txt), "tech sees own client without money");
  // the client's work (an old `?s=jobs`): the rows are there, the sums are not (value only for the office)
  await h.go("/client/c2?s=jobs");
  await p.locator('[data-testid^="client-job-"], [data-testid^="client-visit-"]').locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(!/\$\d/.test(await h.text()), "tech: no sums on the client's work");
  await h.go("/client/c7");
  await h.expectText(/Ничего не найдено/, "tech does not open other clients");
};
