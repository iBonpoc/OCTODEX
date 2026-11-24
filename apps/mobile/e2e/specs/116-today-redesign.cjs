/**
 * «Сегодня» redesign (founder 07.11 «карточки и воронка — переделай красиво, графики», docs/specs/24 A), every view:
 * - «Получено» card with columns: 7 for Сегодня (last 7 days) and Неделя (Mon…Sun), 4–6 weeks for Месяц;
 *   every track is the same height (the value line sits above it); the current column carries its value;
 *   «▲ $X к вчерашнему дню» against the same span; the empty state; the card reads as one button with the chart;
 * - v2 (#2350): the tiles 2×2 of «Требует действия» (leads · estimates / owed · received) side by side, the label on one line,
 *   nothing cut; they open their records (the old «Подписано» tile is the funnel's «Сметы подписаны» row — its sum is the row's
 *   quiet line); the period, «Получено» and the funnel are in the folded «Подробнее» (e2e/today.cjs);
 * - the funnel counts (leads and sent without money), no «Деньги получены» row (it was a repeat);
 * - one yellow on the screen at most (the current column is ink, not acc).
 * Motion: this spec asks for reduced motion itself (emulateMedia), so the columns stand at their height at once
 * (#261 makes it the default for every spec).
 */
const { addDays, atMinute, todayKey } = require("../companyTime.cjs");
const { expectOneAccent } = require("../accent.cjs");
const todayUi = require("../today.cjs");
const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();

exports.run = async (h) => {
  const p = h.page;
  await p.emulateMedia({ reducedMotion: "reduce" });
  // no midnight in this spec (CHECKS §5): the runner's clock stands at noon of the company's day (e2e/clock.cjs), so
  // «yesterday up to this minute» always holds yesterday's 00:01 payment (at 00:00 LA it did not — red build at 08:00 UTC, #292)
  await h.go("/today");
  const chart = p.locator('[data-testid="received-chart"]:visible');
  for (const [period, want, key] of [["Неделя", [7], "week"], ["Месяц", [4, 5, 6], "month"], ["Сегодня", [7], "today"]]) {
    // the period switch is a tablist (Segmented `today-period`): its tab by testID
    await todayUi.period(p, key);
    await chart.waitFor();
    const n = await chart.locator(":scope > div").count();
    h.expect(want.includes(n), `${period}: ${want.join("/")} columns (${n})`);
    const tracks = await chart.locator('[data-testid="chart-track"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    h.expect(tracks.length === n && tracks.every((x) => Math.abs(x - tracks[0]) <= 1), `${period}: every track the same height (${tracks.join(", ")})`);
    await h.shot(`period-${period}`);
  }

  // known money: today $1,000 at 00:01, yesterday $400 at 00:01 → «▲ $600 к вчерашнему дню», the current column «$1,000»
  const today = todayKey();
  await p.evaluate(({ a, b }) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const base = raw.db.payments[0];
    raw.db.payments = [
      { ...base, id: "pt-today", amountCents: 100000, at: a },
      { ...base, id: "pt-yday", amountCents: 40000, at: b },
    ];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, { a: atMinute(today, 1), b: atMinute(addDays(today, -1), 1) });
  await h.go("/today");
  await todayUi.openDetails(p);
  const card = p.getByRole("button", { name: /^Получено: \$1,000/ }).first();
  const cardLabel = (await card.getAttribute("aria-label")) ?? "";
  h.expect(/▲ \$600 к вчерашнему дню/.test(cardLabel), `the change against yesterday, read with the card (${cardLabel})`);
  h.expect(/Получено: .*\$400.*\$1,000/.test(cardLabel.split(". ").slice(1).join(". ")), `the chart is read with the card (${cardLabel})`);
  await h.expectText(/▲ \$600 к вчерашнему дню/, "the change line on the card");
  const curBar = await chart.locator('[data-testid="chart-bar-current"]').boundingBox();
  const bars = await chart.locator('[data-testid="chart-bar"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  h.expect(curBar && bars.length === 1 && Math.abs(bars[0] / curBar.height - 0.4) < 0.05, `yesterday's bar is 40 % of today's (${bars[0]} / ${curBar && curBar.height})`);
  h.expect((await chart.innerText()).includes("$1,000"), "the current column carries its value");
  await h.shot("known-money");
  // today's money is the tile «Получено сегодня»: it opens its figure for today
  h.expect(/\$1,000/.test((await vis(p, "tile-received").getAttribute("aria-label")) ?? ""), "the tile «Получено сегодня» says $1,000");
  await vis(p, "tile-received").click();
  await p.waitForURL(/\/figures\/received\?period=today/);

  // no money at all: only tracks and the empty line
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.payments = [];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/today");
  await todayUi.openDetails(p);
  await h.expectText(/Появятся после первой оплаты/, "the empty state");
  h.expect((await chart.locator('[data-testid="chart-bar"], [data-testid="chart-bar-current"]').count()) === 0, "no bars, only tracks, when nothing came in");

  // tiles 2×2 side by side, one-line labels, nothing cut, they open their records
  const rows = [["tile-leads", "tile-estimates"], ["tile-owed", "tile-received"]];
  const tileOk = async (id) => vis(p, id).evaluate((c) => {
    const leaves = [...c.querySelectorAll("div")].filter((d) => !d.querySelector("div") && (d.textContent || "").trim());
    // the label is the first leaf with letters (the icon cell has none); RN-web clips with overflow, «…» is not in innerText
    const label = leaves.find((d) => /\p{L}/u.test(d.textContent || ""));
    return { cut: leaves.some((d) => d.scrollWidth > d.clientWidth + 1), label: label ? label.getBoundingClientRect().height : 0, lh: label ? parseFloat(getComputedStyle(label).lineHeight) || 20 : 20 };
  });
  // a zero tile is not drawn (today.tsx: nothing came in → no «Получено сегодня»)
  h.expect((await p.getByTestId("tile-received").locator("visible=true").count()) === 0, "no money today: no «Получено» tile");
  const checkTiles = async (lang) => {
    for (const [l, r] of rows) {
      if (!(await p.getByTestId(r).locator("visible=true").count())) {
        // the pair's right one is not drawn (zero): the left one keeps its place in the grid
        const res = await tileOk(l);
        h.expect(!res.cut && res.label <= res.lh * 1.5, `${lang} ${l}: one-line label, nothing cut (${JSON.stringify(res)})`);
        continue;
      }
      const lb = await vis(p, l).boundingBox();
      const rb = await vis(p, r).boundingBox();
      h.expect(lb && rb && Math.abs(lb.y - rb.y) <= 1 && rb.x > lb.x, `${lang}: «${l}» and «${r}» side by side`);
      for (const id of [l, r]) {
        const res = await tileOk(id);
        h.expect(!res.cut && res.label <= res.lh * 1.5, `${lang} ${id}: one-line label, nothing cut (${JSON.stringify(res)})`);
      }
    }
  };
  await checkTiles("ru");
  // the same in Spanish on a phone (longer labels): one line each, amounts whole
  if (h.layout.width === 390) {
    await p.evaluate(() => localStorage.setItem("octo.lang.v1", JSON.stringify("es")));
    await h.go("/today");
    await checkTiles("es");
    await p.evaluate(() => localStorage.setItem("octo.lang.v1", JSON.stringify("ru")));
    await h.go("/today");
  }

  // funnel: counts only, no repeat of «Получено»
  await todayUi.openDetails(p);
  h.expect(!/Деньги получены/.test(await h.text()), "no «Деньги получены» row (repeat of «Получено»)");
  for (const key of ["leads", "sent", "signed"]) {
    const row = (await vis(p, `today-f-${key}`).innerText()).replace(/\n/g, " ");
    h.expect(/\d+\s*$/.test(row), `«${key}» ends with its count (${row})`);
    // the signed row's quiet line carries the signed sum (v2: the old «Подписано» tile); leads and sent are counts only
    if (key !== "signed") h.expect(!/\$/.test(row), `«${key}» has no money (${row})`);
  }
  await expectOneAccent(h, "«Сегодня»");

  await vis(p, "today-f-signed").click();
  await p.waitForURL(/\/figures\/signed/);
  await h.go("/today");
  await vis(p, "tile-owed").click();
  await p.waitForURL(/\/invoice/);
  h.expect(new URL(p.url()).pathname === "/invoice" && p.url().includes("f=owed"), `«Должны» opens unpaid invoices (${p.url()})`);
  await h.go("/today");
  await todayUi.openDetails(p);
  await p.getByRole("button", { name: /^Получено: \$/ }).first().click();
  await p.waitForURL(/\/figures\/received/);
};
