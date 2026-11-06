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

const { menuApi } = require("../menu.cjs");
exports.run = async (h) => {
  const p = h.page;
  const m = menuApi(h);
  const menu = m.menu;
  const openMenu = m.open;
  const wide = h.layout.width >= 820;
  // phone: the 5 bottom tabs; 820/1280: the same places on the side rail (13 §2.5)
  const SIDE = { Главная: "home", План: "plan", Сообщения: "messages", Звонки: "calls", Клиенты: "clients" };
  const place = (name) => (wide ? p.getByTestId(`side-${SIDE[name]}`) : p.getByRole("tab", { name, exact: true }));
  const lit = async (name) => (wide ? (await place(name).getAttribute("aria-current")) === "page" : (await p.getByRole("tab", { name, selected: true }).count()) === 1);
  await h.go("/today");

  for (const role of ["director", "dispatcher", "sales", "tech"]) {
    await setRole(h, role);
    await h.go("/plan");
    // the same 5 tabs, no «Ещё», no «Продажи»
    for (const name of TABS) h.expect((await place(name).count()) === 1, `${role}: tab «${name}»`);
    for (const name of ["Ещё", "Продажи", "Разбор", "Выезды", "Сегодня"]) h.expect((await p.getByRole("tab", { name, exact: true }).count()) === 0, `${role}: no tab «${name}»`);
    // «Главная» opens the role's own home
    await place("Главная").click();
    await p.waitForTimeout(600);
    h.expect(path(h) === HOME[role], `${role}: «Главная» → ${HOME[role]} (got ${path(h)})`);
    h.expect(await lit("Главная"), `${role}: «Главная» is lit on the home screen`);

    // ☰ by rights
    await openMenu();
    const text = await menu().innerText();
    const [has, hasNot] = MENU[role];
    for (const it of has) h.expect(new RegExp(`(^|\\n)${it}(\\n|$)`).test(text), `${role}: ☰ has «${it}»`);
    for (const it of hasNot) h.expect(!new RegExp(`(^|\\n)${it}(\\n|$)`).test(text), `${role}: ☰ has no «${it}»`);
    if (role === "director") { await p.waitForTimeout(600); await h.shot("menu-director"); }
    await m.close();
    if (!m.desktop) h.expect((await menu().count()) === 0, `${role}: ☰ closes`);
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
  await m.close();

  // the list switched by its own segment, then ☰ «Счета» again: the list follows (failed before: the address kept ?tab)
  await h.clickText("Сметы");
  await p.waitForTimeout(400);
  h.expect(p.url().includes("tab=estimates"), `the segment writes the address (${p.url()})`);
  await openMenu();
  h.expect((await menu().locator('[aria-current="page"]').innerText()).includes("Сметы"), "☰ marks «Сметы» after the segment");
  await menu().getByRole("button", { name: "Счета", exact: true }).click();
  await p.waitForTimeout(600);
  await h.expectText(/Нужно действие · \d+/, "☰ «Счета» switches the list back");

  // a ☰ item opened from a tab goes on top: browser / system back returns (failed before: replace closed the app)
  await h.go("/today");
  await openMenu();
  await menu().getByRole("button", { name: "Работы", exact: true }).click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/jobs", `☰ → Работы (${path(h)})`);
  await p.goBack();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/today", `back from Jobs returns Home (${path(h)})`);

  // a click (mouse) outside the drawer closes it (failed before: touch only); the 1280 side menu has no drawer
  if (!m.desktop) {
    await openMenu();
    const vw = h.layout.width;
    await p.mouse.click(vw - 10, 400);
    await p.waitForTimeout(500);
    h.expect((await menu().count()) === 0, "a click outside closes ☰");
  }

  // the client page /p has no staff menu
  await h.go("/p/demo0handyman0estimate0000000001");
  h.expect((await p.getByRole("button", { name: "Меню", exact: true }).count()) === 0 && (await p.getByTestId("side-nav").count()) === 0, "no ☰ and no side menu on the client page");

  // old addresses keep working: /inbox?tab=… → /leads?tab=…
  await h.go("/inbox?tab=estimates");
  h.expect(p.url().includes("/leads?tab=estimates"), `/inbox → /leads (${p.url()})`);

  // Calls: the demo's call to a lead, with who made it; the technician sees only his own
  const db = await h.db();
  const call = db.activities.find((a) => a.kind === "call");
  h.expect(call, "the demo has a call");
  const lead = db.leads.find((l) => l.id === call.subjectId);
  await place("Звонки").click();
  await p.waitForTimeout(600);
  h.expect(path(h) === "/calls", `tab «Звонки» → /calls (${path(h)})`);
  await h.expectText(new RegExp(lead.name), "the call is listed by the lead's name");
  await h.shot("calls");
  await p.getByText(lead.name, { exact: true }).first().click();
  await p.waitForTimeout(700);
  h.expect(p.url().includes(`/lead/${lead.id}`), `a call opens its lead (${p.url()})`);
  // an office call to a client the technician has no visit at — the office sees it, he does not
  const busy = new Set(db.visits.filter((v) => v.techId === db.me || (v.assigneeIds || []).includes(db.me)).map((v) => db.properties.find((x) => x.id === (v.propertyId ?? db.jobs.find((j) => j.id === v.jobId)?.propertyId))?.customerId));
  const stranger = db.customers.find((c) => !busy.has(c.id));
  const other = db.members.find((m) => m.id !== db.me);
  await p.evaluate(([a]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.activities = [a, ...raw.db.activities];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [{ id: "e2e-call", subjectType: "customer", subjectId: stranger.id, kind: "call", at: new Date().toISOString(), actorId: other.id }]);
  await h.go("/calls");
  h.expect((await p.locator('[data-testid="comms-e2e-call"]').count()) === 1, "the office sees the call to any client");
  await setRole(h, "tech");
  await h.go("/calls");
  h.expect((await p.locator('[data-testid="comms-e2e-call"]').count()) === 0, "tech: not a call to a client he has no visit at");
  await h.go("/messages");
  await h.expectText(/Сообщения/, "Messages opens for the technician");

  // the company crumb ends with the section's own name (failed before: «Настройки компании» twice)
  await setRole(h, "director");
  await h.go("/company/address");
  const trail = await p.getByRole("toolbar", { name: "Где вы" }).last().innerText();
  h.expect(/Адрес и часовой пояс/.test(trail), `trail ends with the section: ${trail.replace(/\n/g, " ")}`);
  h.expect(!/Настройки компании[\s\S]*Настройки компании/.test(trail), "«Настройки компании» once in the trail");
};
