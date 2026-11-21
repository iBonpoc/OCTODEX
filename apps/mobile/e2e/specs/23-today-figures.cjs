/** "Today": every number opens exactly what it counts (same count on the screen), back returns to "Today" (founder 05.11). */
const today = require("../today.cjs");
const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();

exports.run = async (h) => {
  const p = h.page;
  // v2 (#2350): the period and the funnel are in the folded «Подробнее» (`today-details`, e2e/today.cjs)
  for (const [key, period] of [["month", "Месяц"], ["today", "Сегодня"]]) {
    for (const [row, label] of [["leads", "Новые лиды"], ["sent", "Сметы отправлены"], ["signed", "Сметы подписаны"]]) {
      await h.go("/today");
      await today.period(p, key);
      const el = vis(p, `today-f-${row}`);
      const rowText = (await el.innerText()).replace(/\n/g, " ");
      await el.click();
      await p.waitForURL(/\/figures\//);
      await h.expectText(new RegExp(label), "title");
      const sub = await h.text();
      const m = sub.match(new RegExp(`${period} · (\\d+)`));
      h.expect(!!m, `count on the figure screen (${sub.slice(0, 160)})`);
      // the same number is on the funnel row (unit test figures.test.ts checks equality for every period)
      h.expect(new RegExp(`(^|\\D)${m[1]}\\s*$`).test(rowText), `${label}: row "${rowText}" shows ${m[1]}`);
      // back to Today: «‹» on a phone (`hdr-back`), the trail's «Today» crumb from 820 (`crumb-/today`)
      await p.locator('[data-testid="hdr-back"], [data-testid="crumb-/today"]').locator("visible=true").first().click();
      await p.waitForURL(/\/today/);
    }
  }
  // money tile: «Должны» (v2 tile `tile-owed`) is the one path to debts (18 §1): the invoices list on what is owed, the same sum
  await h.go("/today");
  const tile = vis(p, "tile-owed");
  const owed = ((await tile.getAttribute("aria-label")) ?? "").match(/\$[\d,]+/)?.[0];
  h.expect(!!owed, `the owed tile has a sum (${await tile.getAttribute("aria-label")})`);
  await tile.click();
  await p.waitForURL(/\/invoice/);
  h.expect(new URL(p.url()).pathname === "/invoice" && p.url().includes("f=owed"), `owed opens unpaid invoices (${p.url()})`);
  // the open invoices of the list (overdue + waiting) add up to the tile
  await vis(p, "invoice-list-groups").waitFor();
  const cents = await p.evaluate(() =>
    ["invoice-list-group-overdue", "invoice-list-group-waiting"]
      .flatMap((g) => [...document.querySelectorAll(`[data-testid="${g}"] [data-testid^="invoice-row-"]`)].filter((e) => e.getBoundingClientRect().height > 0))
      .map((r) => { const all = (r.innerText.match(/\$[\d,]+/g) || []); return Number((all[all.length - 1] || "$0").replace(/[$,]/g, "")); })
      .reduce((a, b) => a + b, 0),
  );
  h.expect(`$${cents.toLocaleString("en-US")}` === owed, `the open invoices add up to the tile (${cents} vs ${owed})`);
  await p.goBack();
  await p.waitForURL(/\/today/);
};
