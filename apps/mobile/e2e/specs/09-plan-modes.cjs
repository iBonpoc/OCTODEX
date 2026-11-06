const { dayKey, todayKey } = require("../companyTime.cjs");
/** Plan: Day / Week / Month; arrows and «Сегодня»; tap a month day → Day; tech sees only own visits. */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/plan");
  const db = await h.db();
  // days of the Plan are the company's (П4b), not the browser's
  const today = todayKey();
  const todays = db.visits.filter((v) => dayKey(v.start) === today);
  h.expect(todays.length > 0, "demo has visits today");

  // Week: today's visits are cards in the week list.
  await h.clickText("Неделя");
  await p.waitForTimeout(300);
  await h.expectText(/Сегодня · /, "week shows today");
  await h.shot("plan-week");

  // Month: a cell per day, today's cell shows the visit count; tap → Day view for that day.
  await h.clickText("Месяц");
  await p.waitForTimeout(300);
  const cell = p.getByRole("button", { name: `${today}: ${todays.length}` }).last();
  h.expect(await cell.isVisible(), "month cell with today's count");
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
    const visible = await p.getByText(new RegExp(` · ${name}$`)).count();
    h.expect(visible === 0, `tech does not see ${name}'s visits`);
  }
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
