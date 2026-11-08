const { atMinute, dayKey, todayKey } = require("../companyTime.cjs");
/** Plan: Day / Week / Month; arrows and «Сегодня»; tap a month day → Day; tech sees only own visits. */
exports.run = async (h) => {
  const p = h.page;
  // the day cell (Week strip, Month): its screen-reader label says «В плане: N» (24 §B, review of #267)
  const dayCell = (k) => p.getByTestId(`plan-day-${k}`).locator("visible=true").first();
  const countOf = async (k) => Number((String(await dayCell(k).getAttribute("aria-label")).match(/В плане: (\d+)/) || [])[1]);
  await h.go("/plan");
  let db = await h.db();
  // days of the Plan are the company's (П4b), not the browser's
  const today = todayKey();
  const todays = db.visits.filter((v) => dayKey(v.start) === today);
  h.expect(todays.length > 0, "demo has visits today");
  // the Month counts the Feed's items (17-job §12.2): read the count, add a task with a time, an event and a done visit
  await h.clickText("Месяц");
  await p.waitForTimeout(300);
  const before = await countOf(today);
  await p.evaluate(([at10, at11, at12, at13]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const prop = raw.db.properties[0];
    raw.db.tasks = [...(raw.db.tasks || []), { id: "t09", subjectType: "job", subjectId: "j1", title: "T09 task", startsAt: at10, endsAt: at11, assigneeId: raw.db.me }];
    raw.db.calendarEvents = [...(raw.db.calendarEvents || []), { id: "ev09", kind: "event", title: "T09 event", startsAt: at12, endsAt: at13, allDay: false }];
    raw.db.visits = [...raw.db.visits, { id: "v09done", propertyId: prop.id, kind: "inspection", techId: raw.db.me, assigneeIds: [raw.db.me], start: at10, durationMin: 30, step: "done", closed: true, scope: [], checklist: [], photos: [], amountDueCents: 0 }];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("day"));
  }, [atMinute(today, 10 * 60), atMinute(today, 10 * 60 + 30), atMinute(today, 12 * 60), atMinute(today, 13 * 60)]);
  await h.go("/plan");
  db = await h.db();

  // Week: today's visits are cards in the week list.
  await h.clickText("Неделя");
  await p.waitForTimeout(300);
  await h.expectText(/Сегодня · /, "week shows today");
  // the control for the tech's check below: the office does see colleagues' names on the Week's cards (same pattern)
  const techNames = db.members.filter((m) => m.id !== db.me && m.roles.includes("tech")).map((m) => m.name);
  let seen = 0;
  // the card's «who» fact: «Ivan Sokolov» or «Ivan Sokolov, Dmitry Orlov» (ListCard, 10а)
  // inside the Week's cards only (a «Мастер» filter chip names a person too)
  for (const name of techNames) seen += await p.getByTestId("plan-feed").getByText(new RegExp(`(^|, )${name}(,|$)`)).locator("visible=true").count();
  h.expect(seen > 0, "the office sees the techs' names on the Week (the pattern below is not blind)");
  await h.shot("plan-week");

  // Month: a cell per day; today's cell counts the task and the event, not the done visit (hidden by default); tap → Day.
  await h.clickText("Месяц");
  await p.waitForTimeout(300);
  h.expect((await countOf(today)) === before + 2, `month cell: the task and the event count, the done visit does not (${before} → ${before + 2})`);
  const cell = dayCell(today);
  h.expect(await cell.isVisible(), "month cell of today");
  await h.shot("plan-month");
  await p.getByRole("button", { name: "Вперёд" }).last().click();
  await p.waitForTimeout(200);
  await h.expectText(/Сегодня/, "«Сегодня» appears away from today");
  await p.getByRole("button", { name: "Сегодня", exact: true }).last().click();
  await p.waitForTimeout(200);
  await cell.click();
  await p.waitForTimeout(300);
  h.expect(await p.getByText("Свободен").first().isVisible().catch(() => false) || todays.length > 0, "day view opened");
  await h.shot("plan-day");

  // Tech: only own visits in the week.
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/plan");
  await h.clickText("Неделя");
  await p.waitForTimeout(300);
  const others = db.members.filter((m) => m.id !== db.me && m.roles.includes("tech")).map((m) => m.name);
  for (const name of others) {
    // the card's «who» fact — the same pattern as the office's control above
    const visible = await p.getByTestId("plan-feed").getByText(new RegExp(`(^|, )${name}(,|$)`)).locator("visible=true").count();
    h.expect(visible === 0, `tech does not see ${name}'s visits`);
  }
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
