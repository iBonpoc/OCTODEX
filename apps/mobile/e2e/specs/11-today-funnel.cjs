const { dayKey, todayKey } = require("../companyTime.cjs");
const { expectOneAccent } = require("../accent.cjs");
/** Today: period switch (Today / Week / Month) changes money tiles; sales funnel shows leads → sent → signed; money received is the «Получено» card. */
/** S8b (docs/specs/07 §2.2 А, founder 05.11): an employee signs the contract for the company on the estimate screen. */
async function countersign(h, estimateId) {
  await h.go(`/estimate/${estimateId}`);
  const pad = h.page.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded(); await h.page.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await h.page.mouse.move(bb.x + 30, bb.y + 90); await h.page.mouse.down();
  for (let i = 0; i < 20; i++) await h.page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await h.page.mouse.up();
  await h.page.getByRole("button", { name: "Подписать договор" }).last().click(); await h.page.waitForTimeout(700);
}

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await expectOneAccent(h, "Today");
  await h.expectText(/Воронка продаж/, "funnel card");
  // spec 24 A (founder 07.11): the funnel is counts; money received lives in «Получено» (the old «Деньги получены» row repeated it)
  for (const label of ["Новые лиды", "Сметы отправлены", "Сметы подписаны", "Получено"]) await h.expectText(new RegExp(label), label);
  await h.expectText(/Счетов: \d+/, "awaiting is all open invoices (spec 24: «Счетов: N»)");

  // A card payment today must show up in «Получено» for today, week and month.
  const before = await h.db();
  const leadsMonth = before.leads.length;
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.sign("Linda Alvarez");
  await countersign(h, "e6");
  await h.go("/today");
  const db = await h.db();
  const signedToday = db.estimates.filter((e) => e.status === "approved" && e.approvedAt && dayKey(e.approvedAt) === todayKey()); // the company's today (П4b)
  h.expect(signedToday.length >= 1, "an estimate signed today");
  await h.expectText(/Смет: [1-9]/, "signed count today");
  for (const period of ["Неделя", "Месяц"]) {
    await h.clickText(period);
    await h.expectText(/Смет: [1-9]/, `signed count in ${period}`);
    await h.shot(`period-${period}`);
  }
  // The choice is remembered; back to «today».
  await p.evaluate(() => localStorage.setItem("octo.todayPeriod.v1", JSON.stringify("today")));
  await h.go("/today");
  await h.expectText(/Смет: [1-9]/, "signed count today after reload");
  h.expect(leadsMonth > 0, "demo has leads");
};
