/**
 * e2e 550 — the tiles show money with cents and the whole figure fits (#2888; founder #2672 «сумма должна быть с центами»,
 * DS §4.5 «всегда с центами — везде»). Before: the tiles rounded to dollars («$1,840» for $1,839.60).
 * С1 ДАНО экраны с плитками сумм (Главная, Деньги, Отчёты, карточка клиента) КОГДА открыт экран ТОГДА каждая сумма на экране
 *    с центами («$1,840.00»), ни одной «$1,840» без центов.
 * С2 ТОГДА каждая сумма плитки целиком в своей плитке: не обрезана многоточием и не вылезает за край (390 / 820 / 1280, обе темы).
 * By testID (rule 19): the tiles `money-tile-*`, `tile-*`, `client-tile-*`, `rpt-*`; the figures are found by what they are.
 */
const { waited } = require("../sheet.cjs");

const SCREENS = [
  { path: "/today", ready: "tile-received" },
  { path: "/finance", ready: "money-tile-owed" },
  { path: "/reports/collected?p=all", ready: null },
  { path: "/reports/sales?p=month", ready: null },
];

exports.run = async (h) => {
  const p = h.page;
  // the client cards of the clients with money (their tiles «Долг», «Оплачено», «Выставить» — whichever the card shows)
  await h.go("/today");
  const db = await h.db();
  const withMoney = db.customers.filter((c) => db.invoices.some((i) => i.customerId === c.id && !i.void)).slice(0, 4);
  h.expect(withMoney.length > 0, "the demo has clients with invoices");
  let clientTiles = 0;
  for (const s of [...SCREENS, ...withMoney.map((c) => ({ path: `/client/${c.id}`, ready: null, client: true }))]) {
    await h.go(s.path);
    if (s.ready) await p.getByTestId(s.ready).locator("visible=true").first().waitFor({ timeout: 8000 });
    // the screen's figures are in: at least one «$» amount is shown
    await waited(p.waitForFunction(() => /\$\d/.test(document.body.innerText), null, { timeout: 8000 }));
    const r = await p.evaluate(() => {
      const shown = (e) => e.getClientRects().length > 0;
      // the smallest elements whose own text is one amount
      const amounts = [...document.querySelectorAll("div, span")].filter((e) => shown(e) && e.children.length === 0 && /^[−-]?\$[\d,]+(\.\d+)?$/.test(e.textContent.trim()));
      const noCents = amounts.map((e) => e.textContent.trim()).filter((t) => !/\.\d\d$/.test(t));
      const cut = [];
      for (const e of amounts) {
        const tile = e.closest('[data-testid*="tile"]');
        if (!tile) continue;
        const a = e.getBoundingClientRect();
        const b = tile.getBoundingClientRect();
        if (e.scrollWidth > e.clientWidth + 1 || a.right > b.right + 1 || a.left < b.left - 1) cut.push(`${tile.getAttribute("data-testid")}: ${e.textContent.trim()}`);
      }
      return { n: amounts.length, noCents, cut, inTiles: amounts.filter((e) => e.closest('[data-testid*="tile"]')).length };
    });
    h.expect(r.n > 0, `${s.path}: the screen shows amounts`);
    h.expect(r.noCents.length === 0, `${s.path}: every amount with cents (${r.noCents.join(", ")})`);
    h.expect(r.cut.length === 0, `${s.path}: every tile figure fits its tile (${r.cut.join("; ")})`);
    if (s.ready) h.expect(r.inTiles > 0, `${s.path}: the tiles' figures are checked (${r.inTiles})`);
    if (s.client) clientTiles += r.inTiles;
  }
  h.expect(clientTiles > 0, `the client cards' tile figures are checked (${clientTiles})`);
  await h.go("/finance");
  await p.getByTestId("money-tile-owed").locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.shot("finance-tiles");
};
