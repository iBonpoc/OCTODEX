const { planShowDone } = require("../planFilters.cjs");
const { addDays, atMinute, todayKey } = require("../companyTime.cjs");
/**
 * Wave 5 «План» — Лента (docs/specs/13-app-structure.md §3.2): visits, tasks with a time, events and days off in one list
 * by the company's days; «all day» first; a run of empty days is one row «… · свободно»; done ones hidden until
 * «Показывать выполненные»; «Не назначено» (today and tomorrow) on top for the office only — the same rule as «Требует
 * внимания». A tech sees his own and the company's, not a colleague's day off. One yellow per screen (rule 2).
 */
const { expectOneAccent } = require("../accent.cjs");

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

  // the office: «Лента» — today's task and event, tomorrow's day off of Ivan («Весь день»)
  await h.go("/plan");
  await h.clickText("Лента"); await p.waitForTimeout(400);
  const feed = p.getByTestId("plan-feed").last();
  h.expect(/^Сегодня · /.test((await feed.innerText()).trim()), "the Feed starts today");
  await h.expectText(/T67 call the supplier/, "a task with a time is in the Feed");
  await h.expectText(/T67 team meeting/, "an event is in the Feed");
  // ListCard (10а): the name «Выходной», «Весь день» under it, the person in the «who» fact
  const offCard = feed.getByRole("button", { name: "Выходной", exact: true }).filter({ hasText: "Весь день" });
  h.expect((await offCard.count()) > 0, "a day off, all day");
  h.expect((await offCard.filter({ hasText: "Ivan Sokolov" }).count()) > 0, "the day off names the person");
  h.expect((await feed.getByRole("button").filter({ hasText: "Событие" }).filter({ hasText: "Вся компания" }).count()) > 0, "a company event says so");
  let body = await h.text();
  h.expect(body.indexOf("T67 call the supplier") < body.indexOf("T67 team meeting"), "today by time: 10:00 before 12:00");
  const soon = p.getByTestId("plan-unassigned-soon").last();
  const soonText = await soon.innerText();
  h.expect(soonText.includes(client.name) && (await soon.getByRole("button", { name: client.name, exact: true }).filter({ hasText: "6:15" }).filter({ hasText: "Завтра" }).count()) > 0, "«Не назначено» on top for the office: our visit tomorrow (the day under the name, 24 §B)");
  await expectOneAccent(h, "the Plan feed (office)");
  await h.shot("plan-feed");

  // a task marked done hides; «Показывать выполненные» brings it back as «Выполнено»
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.tasks.find((t) => t.id === "t67").doneAt = new Date().toISOString();
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/plan"); await p.waitForTimeout(300);
  h.expect(!/T67 call the supplier/.test(await h.text()), "a done task hides (the Feed is remembered)");
  await planShowDone(p, true);
  await h.expectText(/T67 call the supplier/, "«Показывать выполненные» shows it");
  await h.expectText(/Выполнено/, "as done");
  await expectOneAccent(h, "the Plan feed with done ones shown");

  // the Day keeps its own block of its day; the top one is not shown twice
  await h.clickText("День"); await p.waitForTimeout(300);
  h.expect((await p.getByTestId("plan-unassigned-soon").count()) === 0, "Day: no top «Не назначено» block");
  await h.clickText("Лента"); await p.waitForTimeout(300);

  // an empty day: a week far ahead
  for (let i = 0; i < 8; i++) { await p.getByRole("button", { name: "Вперёд" }).last().click(); await p.waitForTimeout(150); }
  // a run of empty days is one row (24 §B), not «На этот день ничего нет» on every day
  await h.expectText(/ – .* · свободно/, "a run of empty days is one row «… – … · свободно»");
  h.expect((await p.getByText("На этот день ничего нет").count()) === 0, "no «На этот день ничего нет» any more");
  h.expect((await p.getByTestId("plan-free").locator("visible=true").count()) === 1, "a whole free week is one row");

  // a tech: his own and the company's; no «Не назначено», no colleague's day off
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/plan");
  await h.expectText(/T67 team meeting/, "tech: the company's event");
  body = await h.text();
  // ListCard (10а): a day off is a card named «Выходной» with the person in the «who» fact
  h.expect((await p.getByTestId("plan-feed").last().getByRole("button", { name: "Выходной", exact: true }).filter({ hasText: "Ivan Sokolov" }).count()) === 0, "tech: no colleague's day off");
  h.expect(!/Не назначено · \d/.test(body), "tech: no «Не назначено»");
  h.expect((await p.getByRole("button", { name: client.name, exact: true }).filter({ hasText: "6:15" }).count()) === 0, "tech: no visit he is not on");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
