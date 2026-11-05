/**
 * Wave 2a of the app shell (docs/specs/13 §2.1–§2.3, §4; 13а): the same 5 tabs for every role, ☰ by rights,
 * the old «Продажи» and «Ещё» addresses, Calls and Messages from what the app recorded, the company crumb.
 */
const TABS = ["Главная", "План", "Сообщения", "Звонки", "Клиенты"];
const HOME = { director: "/today", dispatcher: "/triage", sales: "/leads", tech: "/visits" };
/** ☰ by role (13 §4): [must have, must not have] */
const MENU = {
  director: [["Создать", "Лиды", "Работы", "Сметы", "Счета", "Каталог", "Деньги", "Команда", "Настройки компании", "Мои настройки"], []],
  dispatcher: [["Лиды", "Работы", "Сметы", "Счета", "Деньги", "Мои настройки"], ["Команда", "Настройки компании"]],
  sales: [["Лиды", "Сметы", "Счета", "Мои настройки"], ["Деньги", "Команда", "Настройки компании"]],
  tech: [["Работы", "Сметы", "Каталог", "Мои настройки"], ["Лиды", "Счета", "Деньги", "Команда", "Настройки компании"]],
};
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

/** the visible ☰ (the tab navigator keeps visited tabs mounted, hidden, with their own ☰) */
const menuButton = async (p) => {
  const all = p.getByRole("button", { name: "Меню", exact: true });
  // a screen opened by a tab may still be rendering: wait up to 3 s
  for (let t = 0; t < 15; t++, await p.waitForTimeout(200))
    for (let i = (await all.count()) - 1; i >= 0; i--) if (await all.nth(i).isVisible()) return all.nth(i);
  throw new Error("no visible ☰");
};
exports.run = async (h) => {
  const p = h.page;
  const menu = () => p.getByRole("dialog", { name: "Меню" });
  const openMenu = async () => {
    await (await menuButton(p)).click();
    await menu().waitFor({ timeout: 3000 });
  };
  await h.go("/today");

  for (const role of ["director", "dispatcher", "sales", "tech"]) {
    await setRole(h, role);
    await h.go("/plan");
    // the same 5 tabs, no «Ещё», no «Продажи»
    for (const name of TABS) h.expect((await p.getByRole("tab", { name, exact: true }).count()) === 1, `${role}: tab «${name}»`);
    for (const name of ["Ещё", "Продажи", "Разбор", "Выезды", "Сегодня"]) h.expect((await p.getByRole("tab", { name, exact: true }).count()) === 0, `${role}: no tab «${name}»`);
    // «Главная» opens the role's own home
    await p.getByRole("tab", { name: "Главная", exact: true }).click();
    await p.waitForTimeout(600);
    h.expect(path(h) === HOME[role], `${role}: «Главная» → ${HOME[role]} (got ${path(h)})`);
    h.expect((await p.getByRole("tab", { name: "Главная", selected: true }).count()) === 1, `${role}: «Главная» is lit on the home screen`);

    // ☰ by rights
    await openMenu();
    const text = await menu().innerText();
    const [has, hasNot] = MENU[role];
    for (const it of has) h.expect(new RegExp(`(^|\\n)${it}(\\n|$)`).test(text), `${role}: ☰ has «${it}»`);
    for (const it of hasNot) h.expect(!new RegExp(`(^|\\n)${it}(\\n|$)`).test(text), `${role}: ☰ has no «${it}»`);
    if (role === "director") { await p.waitForTimeout(600); await h.shot("menu-director"); }
    await menu().getByRole("button", { name: "Закрыть", exact: true }).click();
    await p.waitForTimeout(400);
    h.expect((await menu().count()) === 0, `${role}: ☰ closes`);
  }

  // ☰ → «Счета» opens the invoices list on /leads and marks it in the menu
  await setRole(h, "director");
  await h.go("/today");
  await openMenu();
  await menu().getByRole("button", { name: "Счета", exact: true }).click();
  await p.waitForTimeout(700);
  h.expect(p.url().includes("/leads?tab=invoices"), `☰ Счета → /leads?tab=invoices (${p.url()})`);
  await h.expectText(/Нужно действие · \d+/, "the invoices list is open");
  await openMenu();
  h.expect((await menu().locator('[aria-current="page"]').innerText()).includes("Счета"), "«Счета» is marked as the current item");
  await menu().getByRole("button", { name: "Закрыть", exact: true }).click();

  // old addresses keep working: /inbox?tab=… → /leads?tab=…
  await h.go("/inbox?tab=estimates");
  h.expect(p.url().includes("/leads?tab=estimates"), `/inbox → /leads (${p.url()})`);

  // Calls: the demo's call to a lead, with who made it; the technician sees only his own
  const db = await h.db();
  const call = db.activities.find((a) => a.kind === "call");
  h.expect(call, "the demo has a call");
  const lead = db.leads.find((l) => l.id === call.subjectId);
  await p.getByRole("tab", { name: "Звонки", exact: true }).click();
  await p.waitForTimeout(600);
  h.expect(path(h) === "/calls", `tab «Звонки» → /calls (${path(h)})`);
  await h.expectText(new RegExp(lead.name), "the call is listed by the lead's name");
  await h.shot("calls");
  await p.getByText(lead.name, { exact: true }).first().click();
  await p.waitForTimeout(700);
  h.expect(p.url().includes(`/lead/${lead.id}`), `a call opens its lead (${p.url()})`);
  await setRole(h, "tech");
  await h.go("/calls");
  const mine = db.activities.filter((a) => a.kind === "call" && a.actorId === db.me).length;
  h.expect((await p.locator('[data-testid^="comms-"]').count()) === mine, `tech: only his own calls (${mine})`);
  await h.go("/messages");
  await h.expectText(/Сообщения/, "Messages opens for the technician");

  // the company crumb ends with the section's own name (failed before: «Настройки компании» twice)
  await setRole(h, "director");
  await h.go("/company/address");
  const trail = await p.getByRole("toolbar", { name: "Где вы" }).last().innerText();
  h.expect(/Адрес и часовой пояс/.test(trail), `trail ends with the section: ${trail.replace(/\n/g, " ")}`);
  h.expect(!/Настройки компании[\s\S]*Настройки компании/.test(trail), "«Настройки компании» once in the trail");
};
