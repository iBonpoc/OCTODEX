const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * «Деньги → Оплаты» (wave 8, 13 §3.15; prototype v2 #2350 — the List template), every view: a row per payment, grouped by the
 * company's days «Сегодня · На этой неделе · В этом месяце · Раньше», each group with its sum (the groups are the periods: v2 has no
 * period or method filter to set — BUILD-SPEC §2.9); the sums of the groups are all the payments; a row → receipt → invoice.
 * Sales and the technician have no «Оплаты» (13 §4).
 */
// #3029/#3030 (founder 27.11): a list row is an overview — whole dollars (`whole`); `money` with cents — for the documents
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const money = (c) => usd.format(c / 100);
const whole = (c) => (Math.abs(c) < 100 ? `$${(Math.abs(c) / 100).toFixed(2)}` : `$${Math.floor((Math.abs(Math.round(c)) + 50) / 100).toLocaleString("en-US")}`);
const cents = (s) => Math.round(Number(s.replace(/[$,]/g, "")) * 100);

exports.run = async (h) => {
  const p = h.page;
  await h.go("/payments");
  const db = await h.db();
  h.expect(db.payments.length > 0, "demo has payments");
  const rows = p.locator('[data-testid^="payment-row-"]').locator("visible=true");
  await rows.first().waitFor({ timeout: 8000 });
  h.expect((await rows.count()) === db.payments.length, `one row per payment (${await rows.count()} / ${db.payments.length})`);
  for (const x of db.payments) {
    const txt = await p.getByTestId(`payment-row-${x.id}`).locator("visible=true").first().innerText();
    h.expect(txt.includes(whole(x.amountCents)), `the row of ${x.id} shows its sum ${whole(x.amountCents)} (${txt.replace(/\n/g, " | ")})`);
  }
  // the groups' sums: each its own rows, together all the payments
  const all = db.payments.reduce((s, x) => s + x.amountCents, 0);
  let sum = 0;
  for (const g of ["today", "week", "month", "earlier"]) {
    const group = p.getByTestId(`payments-list-group-${g}`).locator("visible=true");
    if (!(await group.count())) continue;
    const title = (await group.first().innerText()).split("\n")[0];
    const m = title.match(/·\s*(\$[\d,]+(?:\.\d\d)?)/);
    h.expect(m, `the group «${title}» names its sum`);
    const ids = await group.first().locator('[data-testid^="payment-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").slice("payment-row-".length)));
    const own = db.payments.filter((x) => ids.includes(x.id)).reduce((s, x) => s + x.amountCents, 0);
    // #3029: the group's title is an overview — whole dollars
    h.expect(m[1] === whole(own), `«${title}» = the sum of its rows ${whole(own)}`);
    sum += own;
  }
  h.expect(sum === all, `the groups hold all the payments: ${money(sum)} = ${money(all)}`);
  await h.shot("all");

  // today by the company's day (П4b)
  const today = db.payments.filter((x) => dayKey(x.at) === todayKey());
  const todayRows = p.getByTestId("payments-list-group-today").locator("visible=true").locator('[data-testid^="payment-row-"]');
  h.expect((await todayRows.count()) === today.length, `today: ${today.length} payments`);

  // payment → receipt → invoice
  await h.go("/payments");
  await rows.first().click();
  await p.waitForURL(/\/receipt\//, { timeout: 5000 });
  h.expect(/\/receipt\//.test(p.url()), `the row opens the receipt (${p.url()})`);
  // the receipt links to its invoice through «Связано» (PR-3) — a row of the group, by its testID (#3065)
  await p.getByTestId("related-invoice").locator("visible=true").first().click();
  await p.waitForTimeout(600);
  h.expect(/\/invoice\//.test(p.url()), `receipt opens its invoice (${p.url()})`);

  // sales and tech: closed
  for (const role of ["sales", "tech"]) {
    await p.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);
    await h.go("/payments");
    // the route guard (nav/roles.ts): back to the role's own home with «Нет доступа», none of the screen's data on the way
    await p.waitForTimeout(600);
    const home = role === "sales" ? "/leads" : "/visits";
    h.expect(new URL(p.url()).pathname === home, `${role}: /payments → ${home} (${p.url()})`);
    await h.expectText(/Нет доступа к этому экрану/, `${role}: toast «Нет доступа»`);
    const body = await p.evaluate(() => document.body.innerText);
    h.expect(!/RCT-\d+/.test(body), `${role}: no payments data on the screen`);
  }
};
