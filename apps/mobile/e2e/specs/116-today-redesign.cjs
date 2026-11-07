/**
 * «Сегодня» redesign (founder 07.11 «карточки и воронка — переделай красиво, графики», docs/specs/24 A), every view:
 * - «Получено» card with columns: 7 for Сегодня (last 7 days) and Неделя (Mon…Sun), 4–6 weeks for Месяц;
 *   the chart reads as one image «Получено: …»; opens /figures/received;
 * - two tiles «Подписано» / «Ждёт оплаты» side by side, the label on one line;
 * - the funnel counts without money, no «Деньги получены» row (it was a repeat), no «0% 0»;
 * - one yellow on the screen at most (the current column is ink, not acc).
 * e2e run with reduced motion — the columns stand at their height at once.
 */
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const chart = p.locator('[data-testid="received-chart"]:visible');
  const columns = async () => (await chart.locator(":scope > div").count());
  for (const [period, want] of [["Сегодня", [7]], ["Неделя", [7]], ["Месяц", [4, 5, 6]]]) {
    await p.getByRole("button", { name: period, exact: true }).first().click().catch(() => p.getByText(period, { exact: true }).first().click());
    await p.waitForTimeout(400);
    const n = await columns();
    h.expect(want.includes(n), `${period}: ${want.join("/")} columns (${n})`);
    const a11y = await chart.getAttribute("aria-label");
    h.expect(/^Получено: /.test(a11y ?? ""), `the chart reads as one image (${a11y})`);
    await h.shot(`period-${period}`);
  }

  // tiles side by side, one-line labels
  const signed = p.getByRole("button", { name: "Подписано", exact: true }).first();
  const awaiting = p.getByRole("button", { name: "Ждёт оплаты", exact: true }).first();
  const sb = await signed.boundingBox();
  const ab = await awaiting.boundingBox();
  h.expect(sb && ab && Math.abs(sb.y - ab.y) <= 1 && ab.x > sb.x, "«Подписано» and «Ждёт оплаты» side by side");
  for (const [name, el] of [["Подписано", signed], ["Ждёт оплаты", awaiting]]) {
    const lh = await el.getByText(name, { exact: true }).first().evaluate((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) || 0 }));
    h.expect(lh.h <= (lh.lh || 20) * 1.5, `«${name}» label on one line (${JSON.stringify(lh)})`);
  }

  // funnel: counts only, no repeat of «Получено», no «0% 0»
  const body = await h.text();
  h.expect(!/Деньги получены/.test(body), "no «Деньги получены» row (repeat of «Получено»)");
  h.expect(!/0% \| 0|0% 0/.test(body), "no «0% 0»");
  for (const label of ["Новые лиды", "Сметы отправлены", "Сметы подписаны"]) {
    const row = await p.getByRole("button", { name: new RegExp(`^${label}: \\d+$`) }).first().innerText();
    h.expect(!/\$/.test(row), `«${label}» has no money (${row.replace(/\n/g, " ")})`);
  }
  await expectOneAccent(h, "«Сегодня»");

  // «Получено» opens its records
  await p.getByRole("button", { name: /^Получено: \$/ }).first().click();
  await p.waitForTimeout(500);
  h.expect(/\/figures\/received/.test(p.url()), `«Получено» opens its figure (${p.url()})`);
};
