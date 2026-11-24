const { dayKey, todayKey } = require("../companyTime.cjs");
const { expectOneAccent } = require("../accent.cjs");
/** Today: period switch (Today / Week / Month) changes money tiles; sales funnel shows leads → sent → signed; money received is the «Получено» card. */
/** S8b (docs/specs/07 §2.2 А, founder 05.11): an employee signs the contract for the company on the estimate screen. */
async function countersign(h, estimateId) {
  await h.go(`/estimate/${estimateId}`);
  const pad = await require("../estimateMenu.cjs").countersignPad(h.page);
  await pad.scrollIntoViewIfNeeded(); await h.page.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await h.page.mouse.move(bb.x + 30, bb.y + 90); await h.page.mouse.down();
  for (let i = 0; i < 20; i++) await h.page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await h.page.mouse.up();
  await h.page.getByRole("button", { name: "Подписать договор" }).last().click(); await h.page.waitForTimeout(700);
}

const today = require("../today.cjs");
/** the count a funnel row shows (GroupRow `today-f-<key>`, its value is the last number of the row) */
async function funnelCount(p, key) {
  const t = await p.getByTestId(`today-f-${key}`).locator("visible=true").first().innerText();
  const m = t.replace(/\n/g, " ").match(/(\d+)\s*$/);
  return m ? Number(m[1]) : NaN;
}

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await expectOneAccent(h, "Today");
  // v2 (#2350): the period, «Получено» and the funnel are in the folded «Подробнее»
  await today.openDetails(p);
  await h.expectText(/Воронка продаж/, "funnel card");
  // spec 24 A (founder 07.11): the funnel is counts; money received lives in «Получено» (the old «Деньги получены» row repeated it)
  for (const key of ["leads", "sent", "signed"]) h.expect(Number.isFinite(await funnelCount(p, key)), `funnel row ${key} shows a count`);
  h.expect(/^Получено: \$/.test((await p.getByRole("button", { name: /^Получено: \$/ }).first().getAttribute("aria-label")) ?? ""), "«Получено» card");
  // what is owed is the «Должны» tile of «Требует действия» (v2: the sum of all open invoices; was «Счетов: N»)
  const owed = await p.getByTestId("tile-owed").locator("visible=true").first().getAttribute("aria-label");
  h.expect(/\$[\d,]+/.test(owed ?? ""), `the owed tile shows the open invoices' sum (${owed})`);

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
  await today.period(p, "today");
  h.expect((await funnelCount(p, "signed")) >= 1, "signed count today");
  for (const [key, period] of [["week", "Неделя"], ["month", "Месяц"]]) {
    await today.period(p, key);
    h.expect((await funnelCount(p, "signed")) >= 1, `signed count in ${period}`);
    await h.shot(`period-${period}`);
  }
  // The choice is remembered; back to «today».
  await p.evaluate(() => localStorage.setItem("octo.todayPeriod.v1", JSON.stringify("today")));
  await h.go("/today");
  await today.openDetails(p);
  h.expect((await funnelCount(p, "signed")) >= 1, "signed count today after reload");
  h.expect(leadsMonth > 0, "demo has leads");
};
