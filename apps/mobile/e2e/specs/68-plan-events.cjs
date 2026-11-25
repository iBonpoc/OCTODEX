const { addDays, atMinute, dayKey, todayKey, weekday } = require("../companyTime.cjs");
const { pressUndo } = require("../gutters.cjs");
/**
 * Wave 5 «План» — events and days off (docs/specs/13-app-structure.md §3.2, §2.4; docs/specs/03 §11 PR-B).
 * The office: «＋» of the Plan → «Событие»: a named event of the whole company at a time → in the Week (v2: «Лента» is gone,
 * its items are the Week's) and in the data;
 * «Выходной»: «Сохранить» with no person says «Выберите, чей это выходной» (#2220: nothing before a try); two days «Весь день» → on both days of the Feed. A card opens
 * the form again: a new name saves on the same event; «Удалить» → «Отменить» brings it back (rule 5). A tech has no «＋» and
 * cannot open an event. One yellow per form (rule 2). Days and times are the company's (companyTime.cjs).
 */
const { expectOneAccent } = require("../accent.cjs");

// v2: «＋» of the Plan's header (`plan-create`) → «Событие» / «Выходной» opens its form at once
const openAdd = async (h, item) => {
  const p = h.page;
  await p.getByTestId("plan-create").locator("visible=true").first().getByRole("button").first().click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ timeout: 3000 });
  await p.getByTestId(item).locator("visible=true").first().click();
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().waitFor({ timeout: 5000 });
};

exports.run = async (h) => {
  const p = h.page;
  const today = todayKey();
  await h.go("/plan");
  await h.clickText("Неделя"); await p.waitForTimeout(300);

  // an event of the whole company, today at the default 9:00 AM for 60 min
  await openAdd(h, "plan-create-event");
  await h.expectText(/Новое событие/, "the event form");
  // #2220: nothing is said before a try, «Сохранить» is live; tried without a name — «Нужно название» (e2e 516 in detail)
  h.expect(!(await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().isDisabled()), "«Сохранить» is live on a new form");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await h.expectText(/Нужно название/, "a name is needed — said after a try");
  await h.sheet().getByPlaceholder("Например: собрание бригады").fill("T68 crew meeting");
  await expectOneAccent(h, "the event form", '[aria-modal="true"]');
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  await h.expectText(/Событие сохранено/, "the toast");
  let db = await h.db();
  const ev = (db.calendarEvents || []).find((e) => e.title === "T68 crew meeting");
  h.expect(ev && ev.kind === "event" && !ev.userId && !ev.allDay && ev.startsAt === atMinute(today, 9 * 60) && ev.endsAt === atMinute(today, 10 * 60), `the event of the company, 9–10 AM today (${JSON.stringify(ev)})`);
  // ListCard (10а): the event's name, «9:00 / AM» on the left
  await h.expectText(/T68 crew meeting/, "the event is in the Week");
  h.expect((await p.getByRole("button", { name: /(^|, )T68 crew meeting(,|$)/ }).filter({ hasText: "9:00" }).count()) > 0, "at 9:00 AM");

  // a day off: «Сохранить» off until a person; 2 days, all day → both days in the Feed
  await openAdd(h, "plan-create-time-off");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await h.expectText(/Выберите, чей это выходной/, "a day off needs a person — said after a try");
  await h.sheet().getByRole("radio", { name: "Ivan Sokolov", exact: true }).click(); await p.waitForTimeout(200);
  await h.sheet().getByRole("button", { name: "Дней +1", exact: true }).click(); await p.waitForTimeout(200);
  await h.shot("timeoff-form");
  await expectOneAccent(h, "the day-off form, all day", '[aria-modal="true"]');
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  await h.expectText(/Выходной сохранён/, "the toast");
  db = await h.db();
  const off = db.calendarEvents.find((e) => e.kind === "time_off" && e.userId === "m-ivan");
  h.expect(off && off.allDay && off.startsAt === atMinute(today, 0) && off.endsAt === atMinute(addDays(today, 2), 0), `two days off of Ivan from the company's midnight (${JSON.stringify(off)})`);
  const offCards = p.getByTestId("plan-week-list").locator("visible=true").first().getByRole("button", { name: /(^|, )Выходной(,|$)/ }).filter({ hasText: "Ivan Sokolov" });
  // both days of the Week (a Sunday's tomorrow is the next week)
  const inWeek = weekday(today) === 0 ? 1 : 2;
  h.expect((await offCards.count()) === inWeek, `the day off is on both days of the Week (${await offCards.count()} of ${inWeek})`);

  // a card opens the form: a new name saves on the same event
  await p.getByText(/T68 crew meeting/).first().click(); await p.waitForTimeout(400);
  h.expect((await h.sheet().getByPlaceholder("Например: собрание бригады").inputValue()) === "T68 crew meeting", "the card opens the form with its name");
  await h.sheet().getByPlaceholder("Например: собрание бригады").fill("T68 crew meeting moved");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(db.calendarEvents.filter((e) => e.kind === "event" && /^T68/.test(e.title || "")).map((e) => `${e.id}:${e.title}`).join() === `${ev.id}:T68 crew meeting moved`, "the same event, renamed");

  // the two days off of Ivan open with 2 days and stay 2 days after a save
  await offCards.first().click(); await p.waitForTimeout(400);
  await h.expectText(/Дней/, "all day: the number of days");
  await h.sheet().getByPlaceholder("Необязательно: отпуск, врач…").fill("T68 vacation");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  const off2 = db.calendarEvents.find((e) => e.id === off.id);
  h.expect(off2.title === "T68 vacation" && off2.startsAt === off.startsAt && off2.endsAt === off.endsAt, `the same two days, a new name (${JSON.stringify(off2)})`);

  // «Со временем»: a day off at 9:00 for 60 min
  await p.getByText(/T68 vacation/).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("radio", { name: "Со временем", exact: true }).click(); await p.waitForTimeout(200);
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  const off3 = db.calendarEvents.find((e) => e.id === off.id);
  h.expect(!off3.allDay && off3.startsAt === atMinute(today, 9 * 60) && off3.endsAt === atMinute(today, 10 * 60), `«Со временем»: 9–10 AM (${JSON.stringify(off3)})`);

  // «Удалить» → «Отменить» brings it back (rule 5)
  await p.getByText(/T68 crew meeting moved/).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Удалить", exact: true }).click(); await p.waitForTimeout(400);
  await h.expectText(/Удалено/, "the toast");
  db = await h.db();
  h.expect(!db.calendarEvents.some((e) => e.id === ev.id), "the event is gone");
  await pressUndo(p); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(db.calendarEvents.some((e) => e.id === ev.id), "«Отменить» brings it back");
  h.expect(dayKey(ev.startsAt) === today, "on the company's today");

  // a tech: no «＋», an event card does not open a form
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/plan");
  await p.getByTestId("plan").locator("visible=true").first().waitFor();
  h.expect((await p.getByTestId("plan-create").locator("visible=true").count()) === 0, "tech: no «＋»");
  await p.getByText(/T68 crew meeting moved/).first().click(); await p.waitForTimeout(400);
  h.expect((await p.locator('[aria-modal="true"]').count()) === 0, "tech: an event does not open a form");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
