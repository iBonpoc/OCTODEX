/**
 * «Сегодня» redesign (founder 07.11 «карточки и воронка — переделай красиво, графики», docs/specs/24 A), every view:
 * - «Получено» card with columns: 7 for Сегодня (last 7 days) and Неделя (Mon…Sun), 4–6 weeks for Месяц;
 *   every track is the same height (the value line sits above it); the current column carries its value;
 *   «▲ $X к вчерашнему дню» against the same span; the empty state; the card reads as one button with the chart;
 * - two tiles «Подписано» / «Ждёт оплаты» side by side, the label on one line; they open their records;
 * - the funnel counts without money, no «Деньги получены» row (it was a repeat);
 * - one yellow on the screen at most (the current column is ink, not acc).
 * Motion: this spec asks for reduced motion itself (emulateMedia), so the columns stand at their height at once
 * (#261 makes it the default for every spec).
 */
const { addDays, atMinute, todayKey } = require("../companyTime.cjs");
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await p.emulateMedia({ reducedMotion: "reduce" });
  // no midnight in this spec (CHECKS §5): the runner's clock stands at noon of the company's day (e2e/clock.cjs), so
  // «yesterday up to this minute» always holds yesterday's 00:01 payment (at 00:00 LA it did not — red build at 08:00 UTC, #292)
  await h.go("/today");
  const chart = p.locator('[data-testid="received-chart"]:visible');
  for (const [period, want] of [["Неделя", [7]], ["Месяц", [4, 5, 6]], ["Сегодня", [7]]]) {
    // the period switch is a tablist (Segmented): a tab, not the first «Сегодня» text on the page (title, menu)
    await p.getByRole("tab", { name: period, exact: true }).first().click();
    await p.waitForTimeout(400);
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

  // no money at all: only tracks and the empty line
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.payments = [];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/today");
  await h.expectText(/Появятся после первой оплаты/, "the empty state");
  h.expect((await chart.locator('[data-testid="chart-bar"], [data-testid="chart-bar-current"]').count()) === 0, "no bars, only tracks, when nothing came in");

  // tiles side by side, one-line labels, they open their records
  const signed = p.getByRole("button", { name: /^Подписано: \$/ }).first();
  const awaiting = p.getByRole("button", { name: /^Ждёт оплаты: \$/ }).first();
  const sb = await signed.boundingBox();
  const ab = await awaiting.boundingBox();
  h.expect(sb && ab && Math.abs(sb.y - ab.y) <= 1 && ab.x > sb.x, "«Подписано» and «Ждёт оплаты» side by side");
  for (const [name, el] of [["Подписано", signed], ["Ждёт оплаты", awaiting]]) {
    const lh = await el.getByText(name, { exact: true }).first().evaluate((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) || 0 }));
    h.expect(lh.h <= (lh.lh || 20) * 1.5, `«${name}» label on one line (${JSON.stringify(lh)})`);
    // the amount line fits its tile: nothing hidden past the edge (RN-web clips with overflow, «…» is not in innerText)
    const cut = await el.evaluate((card) => [...card.querySelectorAll("div")].filter((d) => /^\$[\d,]+$/.test((d.textContent || "").trim()) && !d.querySelector("div")).some((d) => d.scrollWidth > d.clientWidth + 1));
    h.expect(!cut, `«${name}» amount is not cut`);
  }
  // the same in Spanish on a phone (longer labels): one line each, amounts whole
  if (h.layout.width === 390) {
    await p.evaluate(() => localStorage.setItem("octo.lang.v1", JSON.stringify("es")));
    await h.go("/today");
    for (const card of [p.getByRole("button", { name: /^Firmado: \$/ }).first(), p.getByRole("button", { name: /^Pendiente de pago: \$/ }).first()]) {
      h.expect((await card.count()) === 1, "the Spanish tile is there");
      const res = await card.evaluate((c) => {
        const leaves = [...c.querySelectorAll("div")].filter((d) => !d.querySelector("div") && (d.textContent || "").trim());
        return { cut: leaves.some((d) => d.scrollWidth > d.clientWidth + 1), label: leaves[0]?.getBoundingClientRect().height ?? 0, lh: parseFloat(getComputedStyle(leaves[0]).lineHeight) || 20 };
      });
      h.expect(!res.cut && res.label <= res.lh * 1.5, `ES tile: one-line label, nothing cut (${JSON.stringify(res)})`);
    }
    await p.evaluate(() => localStorage.setItem("octo.lang.v1", JSON.stringify("ru")));
    await h.go("/today");
  }

  // funnel: counts only, no repeat of «Получено»
  h.expect(!/Деньги получены/.test(await h.text()), "no «Деньги получены» row (repeat of «Получено»)");
  for (const label of ["Новые лиды", "Сметы отправлены", "Сметы подписаны"]) {
    const row = await p.getByRole("button", { name: new RegExp(`^${label}: \\d+$`) }).first().innerText();
    h.expect(!/\$/.test(row), `«${label}» has no money (${row.replace(/\n/g, " ")})`);
  }
  await expectOneAccent(h, "«Сегодня»");

  await signed.click();
  await p.waitForTimeout(500);
  h.expect(/\/figures\/signed/.test(p.url()), `«Подписано» opens its figure (${p.url()})`);
  await h.go("/today");
  await p.getByRole("button", { name: /^Ждёт оплаты: \$/ }).first().click();
  await p.waitForTimeout(500);
  h.expect(new URL(p.url()).pathname === "/invoice" && p.url().includes("f=owed"), `«Ждёт оплаты» opens unpaid invoices (${p.url()})`);
  await h.go("/today");
  await p.getByRole("button", { name: /^Получено: \$/ }).first().click();
  await p.waitForTimeout(500);
  h.expect(/\/figures\/received/.test(p.url()), `«Получено» opens its figure (${p.url()})`);
};
