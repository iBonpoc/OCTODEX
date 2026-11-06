const { addDays, atMinute, dayKey, todayKey } = require("../companyTime.cjs");
/**
 * Wave 5 «План» — events and days off (docs/specs/13-app-structure.md §3.2, §2.4; docs/specs/03 §11 PR-B).
 * The office: «Записать в план» → «Событие»: a named event of the whole company at a time → in the Feed and in the data;
 * «Выходной»: «Сохранить» is off until a person is chosen; two days «Весь день» → on both days of the Feed. A card opens
 * the form again: a new name saves on the same event; «Удалить» → «Отменить» brings it back (rule 5). A tech has no «＋» and
 * cannot open an event. One yellow per form (rule 2). Days and times are the company's (companyTime.cjs).
 */
const { expectOneAccent } = require("../accent.cjs");

const openAdd = async (h) => {
  const p = h.page;
  await p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible').first().click(); await p.waitForTimeout(400);
  await p.getByTestId("fab-planAdd").locator("visible=true").click(); await p.waitForTimeout(400);
};

exports.run = async (h) => {
  const p = h.page;
  const today = todayKey();
  await h.go("/plan");
  await h.clickText("Лента"); await p.waitForTimeout(300);

  // an event of the whole company, today at the default 9:00 AM for 60 min
  await openAdd(h);
  await h.sheet().getByText("Событие", { exact: true }).click(); await p.waitForTimeout(400);
  await h.expectText(/Новое событие/, "the event form");
  await h.expectText(/Нужно название/, "a name is needed first");
  h.expect(await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().isDisabled(), "«Сохранить» is off without a name");
  await h.sheet().getByPlaceholder("Например: собрание бригады").fill("T68 crew meeting");
  await expectOneAccent(h, "the event form", '[aria-modal="true"]');
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  await h.expectText(/Событие сохранено/, "the toast");
  let db = await h.db();
  const ev = (db.calendarEvents || []).find((e) => e.title === "T68 crew meeting");
  h.expect(ev && ev.kind === "event" && !ev.userId && !ev.allDay && ev.startsAt === atMinute(today, 9 * 60) && ev.endsAt === atMinute(today, 10 * 60), `the event of the company, 9–10 AM today (${JSON.stringify(ev)})`);
  await h.expectText(/9:00 AM · T68 crew meeting/, "the event is in the Feed");

  // a day off: «Сохранить» off until a person; 2 days, all day → both days in the Feed
  await openAdd(h);
  await h.sheet().getByText("Выходной", { exact: true }).click(); await p.waitForTimeout(400);
  await h.expectText(/Выберите, чей это выходной/, "a day off needs a person");
  h.expect(await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().isDisabled(), "«Сохранить» is off without a person");
  await h.sheet().getByRole("radio", { name: "Ivan Sokolov", exact: true }).click(); await p.waitForTimeout(200);
  await h.sheet().getByRole("button", { name: "Дней +1", exact: true }).click(); await p.waitForTimeout(200);
  await h.shot("timeoff-form");
  await expectOneAccent(h, "the day-off form, all day", '[aria-modal="true"]');
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  await h.expectText(/Выходной сохранён/, "the toast");
  db = await h.db();
  const off = db.calendarEvents.find((e) => e.kind === "time_off" && e.userId === "m-ivan");
  h.expect(off && off.allDay && off.startsAt === atMinute(today, 0) && off.endsAt === atMinute(addDays(today, 2), 0), `two days off of Ivan from the company's midnight (${JSON.stringify(off)})`);
  const feed = await p.getByTestId("plan-feed").last().innerText();
  h.expect((feed.match(/Выходной · Ivan Sokolov/g) || []).length === 2, "the day off is on both days of the Feed");

  // a card opens the form: a new name saves on the same event
  await p.getByText(/T68 crew meeting/).first().click(); await p.waitForTimeout(400);
  h.expect((await h.sheet().getByPlaceholder("Например: собрание бригады").inputValue()) === "T68 crew meeting", "the card opens the form with its name");
  await h.sheet().getByPlaceholder("Например: собрание бригады").fill("T68 crew meeting moved");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(db.calendarEvents.filter((e) => e.kind === "event" && /^T68/.test(e.title || "")).map((e) => `${e.id}:${e.title}`).join() === `${ev.id}:T68 crew meeting moved`, "the same event, renamed");

  // the two days off of Ivan open with 2 days and stay 2 days after a save
  await p.getByText(/Выходной · Ivan Sokolov/).first().click(); await p.waitForTimeout(400);
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
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(db.calendarEvents.some((e) => e.id === ev.id), "«Отменить» brings it back");
  h.expect(dayKey(ev.startsAt) === today, "on the company's today");

  // a tech: no «＋», an event card does not open a form
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/plan");
  h.expect((await p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible').count()) === 0, "tech: no «＋»");
  await p.getByText(/T68 crew meeting moved/).first().click(); await p.waitForTimeout(400);
  h.expect((await p.locator('[aria-modal="true"]').count()) === 0, "tech: an event does not open a form");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
