const { planMaster, planShowDone } = require("../planFilters.cjs");
const { addDays, atMinute, minuteOf, todayKey, weekday } = require("../companyTime.cjs");
/**
 * 6-3 (17-job §12.2) and 24 §B: «Неделя» and «Месяц» count what the Feed shows — a task with a time, an event, a day off,
 * not only visits — with the same «Показывать выполненные». The Week has a strip of 7 days (the Month's cell); a picked
 * person's day off is the word «выходной»; the picked day is not yellow (one yellow per screen). Counts are compared
 * before and after our own rows, so the demo's own plan does not matter.
 */
const { expectOneAccent } = require("../accent.cjs");
const ACC = "rgb(251, 255, 0)";
// design-tokens ink: #F2F3F5 dark, #15161A light
const INKS = ["rgb(242, 243, 245)", "rgb(21, 22, 26)"];

exports.run = async (h) => {
  const p = h.page;
  // the day cell (Week strip, Month): its screen-reader label says «В плане: N» (24 §B, review of #267)
  const dayCell = (k) => p.getByTestId(`plan-day-${k}`).locator("visible=true").first();
  const countOf = async (k) => Number((String(await dayCell(k).getAttribute("aria-label")).match(/В плане: (\d+)/) || [])[1]);
  const today = todayKey();
  // a day of this week other than today (the week runs Monday–Sunday: on a Sunday take Saturday)
  const tomorrow = weekday(today) === 0 ? addDays(today, -1) : addDays(today, 1);
  await h.go("/today");
  await p.evaluate(() => {
    localStorage.setItem("octo.planMode.v1", JSON.stringify("week"));
    localStorage.setItem("octo.planWho.v1", JSON.stringify("all"));
  });
  await h.go("/plan");
  await p.waitForTimeout(300);
  h.expect((await p.getByTestId("plan-week-strip").locator("visible=true").count()) === 1, "the Week has a strip of 7 days");
  const n0 = await countOf(today);

  // our rows: a task at 10, an event at 12, our own done visit today; Ivan is off the next day of the week
  await p.evaluate(([today0, at10, at1030, at12, at13, tm0, tm1]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const prop = raw.db.properties[0];
    raw.db.tasks = [...(raw.db.tasks || []), { id: "t109", subjectType: "job", subjectId: "j1", title: "T109 order gutters", startsAt: at10, endsAt: at1030, assigneeId: raw.db.me }];
    raw.db.calendarEvents = [...(raw.db.calendarEvents || []),
      { id: "ev109", kind: "event", title: "T109 safety meeting", startsAt: at12, endsAt: at13, allDay: false },
      { id: "off109", kind: "time_off", userId: "m-ivan", title: "", startsAt: tm0, endsAt: tm1, allDay: true }];
    raw.db.visits = [...raw.db.visits, { id: "v109", propertyId: prop.id, kind: "inspection", techId: raw.db.me, assigneeIds: [raw.db.me], start: at10, durationMin: 30, step: "done", closed: true, scope: [], checklist: [], photos: [], amountDueCents: 0 }];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [today, atMinute(today, 10 * 60), atMinute(today, 10 * 60 + 30), atMinute(today, 12 * 60), atMinute(today, 13 * 60), atMinute(tomorrow, 0), atMinute(addDays(tomorrow, 1), 0)]);
  await h.go("/plan");
  await p.waitForTimeout(300);
  h.expect((await p.getByRole("button", { name: "Убрать фильтр: Выполненные" }).locator("visible=true").count()) === 0, "«Выполненные» is off");
  const n1 = await countOf(today);
  h.expect(n1 === n0 + 2, `the Week counts the task and the event, not the done visit (${n0} → ${n1})`);
  await h.expectText(/T109 order gutters/, "the task is in the Week's day");
  await h.expectText(/T109 safety meeting/, "the event is in the Week's day");
  await expectOneAccent(h, "the Week");
  await h.shot("week");

  // the same switch as the Feed: done ones counted when shown
  await planShowDone(p, true);
  h.expect((await countOf(today)) === n0 + 3, "«Выполненные»: the done visit counts too");
  await planShowDone(p, false);

  // Ivan's plan: tomorrow is his day off — said in a word, no colour
  await planMaster(p, "Ivan");
  const strip = p.getByTestId("plan-week-strip").locator("visible=true").first();
  const tCell = strip.getByTestId(`plan-day-${tomorrow}`);
  h.expect((await tCell.count()) === 1, "the strip has the day off");
  h.expect(/вых\./.test(await tCell.innerText()), "Ivan's day off: «вых.» in the strip (the whole word does not fit a phone cell)");
  await h.shot("week-dayoff");
  h.expect(/выходной/.test(String(await tCell.getAttribute("aria-label"))), "… and the screen reader hears it");
  await planMaster(p, null);

  // the Month: the same count, the picked day is an ink frame, not the accent
  await h.clickText("Месяц"); await p.waitForTimeout(300);
  h.expect((await countOf(today)) === n1, "the Month counts the same as the Week");
  const border = await dayCell(today).evaluate((el) => {
    const all = [el, ...el.querySelectorAll("*")];
    return all.map((x) => getComputedStyle(x).borderTopColor);
  });
  h.expect(!border.includes(ACC), "the picked day is not yellow");
  h.expect(border.some((b) => INKS.includes(b)), "the picked day is an ink frame");
  await expectOneAccent(h, "the Month");
  await h.shot("month");

  // tap a day of the strip → that Day
  await h.clickText("Неделя"); await p.waitForTimeout(300);
  await p.getByTestId("plan-week-strip").locator("visible=true").first().getByTestId(`plan-day-${today}`).click();
  await p.waitForTimeout(300);
  h.expect((await p.getByTestId("plan-week-strip").locator("visible=true").count()) === 0, "a strip day leaves the Week");
  h.expect((await p.getByRole("radio", { name: /^Сегодня/ }).locator("visible=true").count()) > 0, "… for the Day: its day chips");

  // «＋» of a free row (review of #267: it opened the form at a fixed 9:00): the form takes its own first free time on
  // that day — the company opens at 8:00 (demo hours), nobody is on a day 8 weeks ahead
  await h.clickText("Неделя"); await p.waitForTimeout(300);
  for (let i = 0; i < 8; i++) { await p.getByRole("button", { name: "Вперёд" }).last().click(); await p.waitForTimeout(150); }
  const plus = p.getByTestId("plan-free").locator("visible=true").first().getByRole("button");
  h.expect((await plus.count()) === 1, "a free row has its «＋»");
  await plus.click(); await p.waitForTimeout(400);
  await h.sheet().getByText("Осмотр — выберите объект").waitFor();
  await h.sheet().locator('[role="button"]').filter({ hasText: /,/ }).first().click(); await p.waitForTimeout(400);
  const form = await h.sheet().innerText();
  h.expect(/ · 8:00 AM–8:45 AM/.test(form), "the form opens at the first free time of that day (8:00), not a fixed 9:00");
  h.expect((await p.getByRole("button", { name: "Записать на оценку" }).locator("visible=true").last().getAttribute("aria-disabled")) !== "true", "«Записать на оценку» is on");
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await h.go("/plan"); await p.waitForTimeout(300);

  // 24 §B, the cut names: a late visit's chip says only «Опаздывает» (the detail is in the subtitle); a job number is the
  // last part of a subtitle (cut first). Our own late visit: 40 minutes ago, not left (skipped in the company's first hour)
  if (minuteOf(Date.now()) >= 60) {
    await p.evaluate((start) => {
      const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
      const prop = raw.db.properties[0];
      raw.db.visits = [...raw.db.visits.filter((v) => v.id !== "v109late"), { id: "v109late", propertyId: prop.id, kind: "inspection", techId: raw.db.me, assigneeIds: [raw.db.me], start, durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 }];
      localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    }, new Date(Date.now() - 40 * 60_000).toISOString());
    await h.go("/plan"); await p.waitForTimeout(300);
    await h.clickText("Неделя"); await p.waitForTimeout(300);
    h.expect((await p.getByText("Опаздывает · не выехал", { exact: true }).locator("visible=true").count()) === 0, "no long «Опаздывает · не выехал» chip");
    h.expect((await p.getByText("Опаздывает", { exact: true }).locator("visible=true").count()) > 0, "the chip says «Опаздывает»");
    await h.expectText(/ · не выехал · /, "the detail is in the subtitle");
  }
  await h.clickText("Неделя"); await p.waitForTimeout(300);
  const subs = await p.getByTestId("plan-feed").locator("visible=true").first().innerText();
  const withJob = subs.split("\n").filter((l) => /JOB-\d+/.test(l));
  h.expect(withJob.length > 0, "at least one subtitle carries a job number (the check below is not blind)");
  h.expect(withJob.every((l) => /JOB-\d+$/.test(l.trim())), "a job number ends its subtitle");

};
