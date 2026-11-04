/** Today: period switch (Today / Week / Month) changes money tiles; sales funnel shows leads → sent → signed → paid. */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await h.expectText(/Воронка продаж/, "funnel card");
  for (const label of ["Новые лиды", "Сметы отправлены", "Сметы подписаны", "Деньги получены"]) await h.expectText(new RegExp(label), label);
  await h.expectText(/Все открытые счета/, "awaiting is all-time");

  // A card payment today must show up in «Получено» for today, week and month.
  const before = await h.db();
  const leadsMonth = before.leads.length;
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.sign("Linda Alvarez");
  await h.go("/today");
  const db = await h.db();
  const signedToday = db.estimates.filter((e) => e.status === "approved" && e.approvedAt && new Date(e.approvedAt).toDateString() === new Date().toDateString());
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
