/** "Today": every number opens exactly what it counts (same count on the screen), back returns to "Today" (founder 05.11). */
exports.run = async (h) => {
  const p = h.page;
  for (const period of ["Месяц", "Сегодня"]) {
    await h.go("/today");
    await p.getByRole("button", { name: period, exact: true }).first().click().catch(() => p.getByText(period, { exact: true }).first().click());
    await p.waitForTimeout(300);
    for (const label of ["Новые лиды", "Сметы отправлены", "Сметы подписаны"]) {
      const row = p.getByRole("button", { name: new RegExp(`^${label}`) }).first();
      const rowText = (await row.innerText()).replace(/\n/g, " ");
      await row.click(); await p.waitForTimeout(500);
      h.expect(/\/figures\//.test(p.url()), `${label} opens its figure (${p.url()})`);
      await h.expectText(new RegExp(`${label}`), "title");
      const sub = await h.text();
      const m = sub.match(/(Месяц|Сегодня) · (\d+)/);
      h.expect(!!m, `count on the figure screen (${sub.slice(0, 160)})`);
      // the same number is on the tile row (unit test figures.test.ts checks equality for every period)
      h.expect(new RegExp(`(^|\\D)${m[2]}(\\D|$)`).test(rowText), `${label}: tile "${rowText}" shows ${m[2]}`);
      await p.getByRole("button", { name: /Сегодня/ }).first().click(); await p.waitForTimeout(500);
      h.expect(/\/today/.test(p.url()), `back from ${label} → Today (${p.url()})`);
    }
  }
  // money tiles
  await h.go("/today");
  await p.getByRole("button", { name: /^Ждёт оплаты/ }).first().click(); await p.waitForTimeout(500);
  h.expect(/\/figures\/awaiting/.test(p.url()), "awaiting opens unpaid invoices");
  await p.getByRole("button", { name: /Сегодня/ }).first().click(); await p.waitForTimeout(500);
  h.expect(/\/today/.test(p.url()), "back → Today");
};
