/**
 * Wave 2a of the app shell (docs/specs/13 v2 §2.1–§2.3, §4; 13а), prototype v2 (sections.ts TAB_ORDER): the bottom tabs
 * Главная · План · Клиенты · Деньги · Лиды (the tech has no «Деньги»), «Ещё» behind the root header's avatar (phone) /
 * the side menu (820/1280) by rights, the old «Продажи» and «Ещё» addresses, Calls and Messages from what the app
 * recorded, the company crumb.
 */
const TABS = { director: ["Главная", "План", "Клиенты", "Деньги", "Лиды"], dispatcher: ["Главная", "План", "Клиенты", "Деньги", "Лиды"], sales: ["Главная", "План", "Клиенты", "Деньги", "Лиды"], tech: ["Главная", "План", "Клиенты", "Лиды"] };
/** 820/1280: no bottom tabs — the places on the side rail; «Ещё» is not there */
const WIDE_PLACES = ["Главная", "План", "Сообщения", "Клиенты", "Звонки", "Лиды"];
const HOME = { director: "/today", dispatcher: "/triage", sales: "/leads", tech: "/visits" };
/** ☰ by role (13 §4): [must have, must not have]; on the phone «Лиды» is a tab, not a row of «Ещё» (see below) */
const MENU = {
  director: [["Лиды", "Работы", "Звонки", "Сметы", "Счета", "Каталог", "Оплаты", "Отчёты", "Расходы", "Команда", "Настройки компании", "Настройки приложения", "Помощь и поддержка"], []],
  // spec 26 §3: the office sees «Настройки компании» (read-only)
  dispatcher: [["Лиды", "Работы", "Сметы", "Счета", "Оплаты", "Отчёты", "Расходы", "Настройки компании", "Настройки приложения", "Помощь и поддержка"], ["Команда"]],
  sales: [["Лиды", "Сметы", "Счета", "Настройки приложения", "Помощь и поддержка"], ["Оплаты", "Отчёты", "Расходы", "Команда", "Настройки компании"]],
  tech: [["Лиды", "Работы", "Сметы", "Каталог", "Настройки приложения", "Помощь и поддержка"], ["Счета", "Оплаты", "Отчёты", "Расходы", "Команда", "Настройки компании"]],
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
  const SIDE = { Главная: "home", План: "plan", Сообщения: "messages", Звонки: "calls", Клиенты: "clients", Лиды: "leads" };
  const phone = m.phone;
  const place = (name) => (wide ? p.getByTestId(`side-${SIDE[name]}`) : p.getByRole("tab", { name, exact: true }));
  const lit = async (name) => (wide ? (await place(name).getAttribute("aria-current")) === "page" : (await p.getByRole("tab", { name, selected: true }).count()) === 1);
  await h.go("/today");

  for (const role of ["director", "dispatcher", "sales", "tech"]) {
    await setRole(h, role);
    await h.go("/plan");
    // v2: the 5 tabs (the tech 4); no «Звонки» tab (until the own number), no «Продажи», «Сообщения» and «Ещё» are not tabs
    for (const name of wide ? WIDE_PLACES : TABS[role]) h.expect((await place(name).count()) === 1, `${role}: place «${name}»`);
    for (const name of ["Звонки", "Продажи", "Разбор", "Выезды", "Сегодня", "Ещё", "Сообщения", ...(role === "tech" ? ["Деньги"] : [])]) h.expect((await p.getByRole("tab", { name, exact: true }).count()) === 0, `${role}: no tab «${name}»`);
    // no ☰ in the header on the phone (variant Б)
    if (phone) h.expect((await p.getByRole("button", { name: "Меню", exact: true }).count()) === 0, `${role}: no ☰ on the phone`);
    // «Главная» opens the role's own home
    await place("Главная").click();
    await p.waitForTimeout(600);
    h.expect(path(h) === HOME[role], `${role}: «Главная» → ${HOME[role]} (got ${path(h)})`);
    h.expect(await lit("Главная"), `${role}: «Главная» is lit on the home screen`);

    // «Ещё» / the side menu by rights
    await openMenu();
    const text = await menu().innerText();
    const [has0, hasNot0] = MENU[role];
    const has = phone ? has0.filter((x) => x !== "Лиды") : has0;
    const hasNot = phone ? [...hasNot0, "Лиды"] : hasNot0;
    for (const it of has) h.expect(new RegExp(`(^|\\n)${it}(\\n|$)`).test(text), `${role}: the menu has «${it}»`);
    if (role === "director" && !phone) h.expect(/(^|\n)Создать(\n|$)/.test(text), "820/1280: «＋ Создать» in the side menu");
    for (const it of hasNot) h.expect(!new RegExp(`(^|\\n)${it}(\\n|$)`).test(text), `${role}: ☰ has no «${it}»`);
    if (role === "director") { await p.waitForTimeout(600); await h.shot("menu-director"); }
    await m.close();
    if (m.tablet) h.expect((await menu().count()) === 0, `${role}: the drawer closes`);
  }

  // «Счета» opens the one invoices list /invoice (18 §1: «Не оплачен · Просрочен» first) and marks it in the menu
  await setRole(h, "director");
  await h.go("/today");
  await openMenu();
  await menu().getByRole("button", { name: "Счета", exact: true }).click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/invoice", `Счета → /invoice (${p.url()})`);
  // v2: the list opens with the overdue group first
  await p.getByTestId("invoice-list-group-overdue").locator("visible=true").first().waitFor({ timeout: 5000 });
  const groups = await p.locator('[data-testid^="invoice-list-group-"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  h.expect(groups[0] === "invoice-list-group-overdue", `the invoices list opens on the overdue group (${groups.join(", ")})`);
  // phone: the bar lights the tab a screen was opened from (tabBarRule litSection) — «Ещё» is no tab, so none is lit
  if (phone) h.expect((await p.locator('[data-testid="tab-bar"]:visible [role="tab"][aria-selected="true"]').count()) === 0, "phone: «Счета» from «Ещё» lights no tab");
  await openMenu();
  if (!phone) h.expect((await menu().locator('[aria-current="page"]').innerText()).includes("Счета"), "«Счета» is marked as the current item");
  await m.close();

  // «Сметы» is a section of its own (founder 07.11, spec 31 §7а): its own screen, no Leads · Estimates · Invoices switch
  await openMenu();
  await menu().getByRole("button", { name: "Сметы", exact: true }).click();
  await p.waitForTimeout(600);
  h.expect(path(h) === "/estimates", `Сметы → /estimates (${p.url()})`);
  await p.getByTestId("est-list-groups").locator("visible=true").first().waitFor({ timeout: 5000 });
  const leadsTabs = await p.locator('[role="tab"][aria-label="Лиды"]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 0 && !e.closest('[data-testid="tab-bar"]')).length);
  h.expect(leadsTabs === 0, "no Leads · Estimates · Invoices switch on the screen");

  // a ☰ item opened from a tab goes on top: browser / system back returns (failed before: replace closed the app)
  await h.go("/today");
  await openMenu();
  await menu().getByRole("button", { name: "Работы", exact: true }).click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/jobs", `☰ → Работы (${path(h)})`);
  await p.goBack();
  await p.waitForTimeout(700);
  // phone: Jobs was opened from the «Ещё» tab — back returns there
  h.expect(path(h) === (phone ? "/more" : "/today"), `back from Jobs returns where it was opened (${path(h)})`);

  // a click (mouse) outside the drawer closes it (failed before: touch only); the 1280 side menu has no drawer
  if (m.tablet) {
    await openMenu();
    const vw = h.layout.width;
    await p.mouse.click(vw - 10, 400);
    await p.waitForTimeout(500);
    h.expect((await menu().count()) === 0, "a click outside closes ☰");
  }

  // the client page /p has no staff menu
  await h.go("/p/demo0handyman0estimate0000000001");
  h.expect((await p.getByRole("button", { name: "Меню", exact: true }).count()) === 0 && (await p.getByTestId("side-nav").count()) === 0, "no ☰ and no side menu on the client page");

  // old addresses keep working: /inbox?tab=estimates → /leads?tab=estimates → the «Сметы» section (spec 31 §7а)
  await h.go("/inbox?tab=estimates");
  await p.waitForTimeout(600);
  h.expect(path(h) === "/estimates", `/inbox?tab=estimates → /estimates (${p.url()})`);
  await h.go("/leads?tab=invoices");
  await p.waitForTimeout(600);
  h.expect(path(h) === "/invoice", `/leads?tab=invoices → /invoice (${p.url()})`);

  // Calls: the demo's call to a lead, with who made it; the technician sees only his own
  const db = await h.db();
  const call = db.activities.find((a) => a.kind === "call");
  h.expect(call, "the demo has a call");
  const lead = db.leads.find((l) => l.id === call.subjectId);
  // «Звонки»: a tile in «Ещё» on the phone, a place on the side menu on 820/1280
  if (phone) {
    await openMenu();
    await menu().getByRole("button", { name: "Звонки", exact: true }).click();
  } else await place("Звонки").click();
  await p.waitForTimeout(600);
  h.expect(path(h) === "/calls", `«Звонки» → /calls (${path(h)})`);
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

  // the company crumb ends with the section's own name (failed before: «Настройки компании» twice); v2: the phone has
  // no trail — one «‹ Настройки компании» and the section's own title
  await setRole(h, "director");
  await h.go("/company/address");
  if (phone) {
    const up = p.getByTestId("hdr-back").locator("visible=true").first();
    await up.waitFor({ timeout: 5000 });
    h.expect((await up.getAttribute("aria-label")) === "Назад: Настройки компании", `phone: back to «Настройки компании» (${await up.getAttribute("aria-label")})`);
    const title = await p.getByTestId("screen-title").locator("visible=true").first().innerText();
    h.expect(/Адрес и часовой пояс/.test(title), `phone: the section's own title (${title})`);
  } else {
    const trail = await p.getByRole("toolbar", { name: "Где вы" }).last().innerText();
    h.expect(/Адрес и часовой пояс/.test(trail), `trail ends with the section: ${trail.replace(/\n/g, " ")}`);
    h.expect(!/Настройки компании[\s\S]*Настройки компании/.test(trail), "«Настройки компании» once in the trail");
  }
};
