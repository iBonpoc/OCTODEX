const { planShowDone } = require("../planFilters.cjs");
const { addDays, atMinute, todayKey, weekday } = require("../companyTime.cjs");
/**
 * Wave 5 «План» — what was the Лента (docs/specs/13-app-structure.md §3.2) is the Week of v2 (#2350, BUILD-SPEC §2.2: «День ·
 * Неделя · Месяц», a kept «Лента» opens as the Week): visits, tasks with a time, events and days off in one list by the company's
 * days; a run of empty days is one row «… · свободно»; done ones hidden until «Показывать выполненные»; «Не назначено» (today
 * and tomorrow) for the office only — the same rule as «Требует внимания» — a row under the day that opens its sheet. A tech
 * sees his own and the company's, not a colleague's day off. One yellow per screen (rule 2).
 */
const { expectOneAccent } = require("../accent.cjs");
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const seed = {
    task: { id: "t67", subjectType: "job", subjectId: "j1", title: "T67 call the supplier", startsAt: atMinute(today, 10 * 60), endsAt: atMinute(today, 10 * 60 + 30) },
    event: { id: "ev67", kind: "event", title: "T67 team meeting", startsAt: atMinute(today, 12 * 60), endsAt: atMinute(today, 13 * 60), allDay: false },
    off: { id: "off67", kind: "time_off", userId: "m-ivan", title: "", startsAt: atMinute(tomorrow, 0), endsAt: atMinute(addDays(tomorrow, 1), 0), allDay: true },
    // our own visit with nobody on it, tomorrow 6:15 — «Не назначено · завтра» does not depend on the demo
    visit: { id: "v67", techId: null, assigneeIds: [], start: atMinute(tomorrow, 6 * 60 + 15), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, kind: "inspection" },
  };
  await p.evaluate((s) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    s.task.assigneeId = raw.db.me;
    raw.db.tasks = [...(raw.db.tasks || []), s.task];
    raw.db.calendarEvents = [...(raw.db.calendarEvents || []), s.event, s.off];
    s.visit.propertyId = raw.db.properties[0].id;
    raw.db.visits = [...raw.db.visits, s.visit];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, seed);
  const db = await h.db();
  const client = db.customers.find((c) => c.id === db.properties[0].customerId);

  // the office: the Week — today's task and event, tomorrow's day off of Ivan («Весь день»)
  await h.seed("octo.planMode.v1", "feed"); // an old «Лента» opens as the Week
  await h.go("/plan");
  const feed = p.getByTestId("plan-week-list").locator("visible=true").first();
  await feed.waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId(`plan-week-day-${today}`).locator("visible=true").count()) === 1, "the Week has today's day");
  await h.expectText(/T67 call the supplier/, "a task with a time is in the Week");
  await h.expectText(/T67 team meeting/, "an event is in the Week");
  h.expect((await feed.getByRole("button").filter({ hasText: "Событие" }).filter({ hasText: "Вся компания" }).count()) > 0, "a company event says so");
  let body = await h.text();
  h.expect(body.indexOf("T67 call the supplier") < body.indexOf("T67 team meeting"), "today by time: 10:00 before 12:00");
  // «Не назначено · N» (today and tomorrow): the row under the day opens the sheet with our visit tomorrow
  const soonRow = p.getByTestId("plan-unassigned").locator("visible=true").first();
  await soonRow.getByRole("button").first().click();
  const soon = p.getByTestId("plan-unassigned-sheet").locator("visible=true").first();
  await soon.waitFor({ timeout: 5000 });
  const soonText = await soon.innerText();
  h.expect(soonText.includes(client.name) && /Завтра · 6:15/.test(soonText.replace(/\s+/g, " ")), `«Не назначено» for the office: our visit tomorrow (${soonText.slice(0, 200)})`);
  await pressEscUntilClosed(p);
  await sheetGone(p);
  // tomorrow (a Sunday's tomorrow is the next week): Ivan's day off — «Выходной», «Весь день», the person
  const sunday = weekday(today) === 0;
  if (sunday) await p.getByTestId("plan-month-next").locator("visible=true").first().click();
  const offCard = feed.getByRole("button", { name: /(^|, )Выходной(,|$)/ }).filter({ hasText: "Весь день" });
  h.expect((await offCard.count()) > 0, "a day off, all day");
  h.expect((await offCard.filter({ hasText: "Ivan Sokolov" }).count()) > 0, "the day off names the person");
  if (sunday) await p.getByTestId("plan-month-today").locator("visible=true").first().click();
  await expectOneAccent(h, "the Plan week (office)");
  await h.shot("plan-feed");

  // a task marked done hides; «Показывать выполненные» brings it back as «Выполнено»
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.tasks.find((t) => t.id === "t67").doneAt = new Date().toISOString();
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/plan"); await p.waitForTimeout(300);
  h.expect(!/T67 call the supplier/.test(await h.text()), "a done task hides (the Week is remembered)");
  await planShowDone(p, true);
  await h.expectText(/T67 call the supplier/, "«Показывать выполненные» shows it");
  await h.expectText(/Выполнено/, "as done");
  await expectOneAccent(h, "the Plan week with done ones shown");

  // an empty week: 8 weeks ahead
  for (let i = 0; i < 8; i++) { await p.getByTestId("plan-month-next").locator("visible=true").first().click(); await p.waitForTimeout(150); }
  // a run of empty days is one row (24 §B), not «На этот день ничего нет» on every day
  await h.expectText(/ – .* · свободно/, "a run of empty days is one row «… – … · свободно»");
  h.expect((await p.getByText("На этот день ничего нет").count()) === 0, "no «На этот день ничего нет» any more");
  h.expect((await p.getByTestId("plan-free").locator("visible=true").count()) === 1, "a whole free week is one row");

  // a tech: his own and the company's; no «Не назначено», no colleague's day off
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/plan");
  await h.expectText(/T67 team meeting/, "tech: the company's event");
  body = await h.text();
  // the Week's rows (a tech's event row opens nothing — read the list's text): no «Выходной · Весь день · Ivan Sokolov»
  if (sunday) await p.getByTestId("plan-month-next").locator("visible=true").first().click();
  const techWeek = (await p.getByTestId("plan-week-list").locator("visible=true").first().innerText()).replace(/\s+/g, " ");
  h.expect(!/Выходной Весь день · Ivan Sokolov/.test(techWeek) && !/Весь день · Ivan Sokolov/.test(techWeek), `tech: no colleague's day off (${techWeek.slice(0, 200)})`);
  h.expect(!/Не назначено · \d/.test(body), "tech: no «Не назначено»");
  h.expect((await p.getByTestId("plan-row-v67").count()) === 0, "tech: no visit he is not on");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
