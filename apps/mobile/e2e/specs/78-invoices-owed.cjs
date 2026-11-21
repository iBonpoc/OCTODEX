const { dueKey, todayKey } = require("../companyTime.cjs");
/**
 * «Деньги → Счета», the one path to debts (wave 8, docs/specs/18-money-reports.md §7; 13 §3.15), every view (3 widths × 2 themes).
 * Prototype v2 (#2350, the List template, wave 3 Э5): grouped rows `invoice-row-<id>`, by testID:
 * - the default (`/invoice`, `?f=owed`): «Должны» (overdue, «−N дн» in its column) first, then «Ждут оплаты» — every invoice with a
 *   balance, once; the groups' sums are what each owes (the engine's balance), together = «Ждёт оплаты» + «Просрочено» tiles;
 * - «Оплачено за неделю · Все ›» → `?f=paid` — every paid invoice, the column «Оплачен», no «Принять оплату» swipe;
 * - `?customer=` = one client's debts («Должен» on the client): the client's name is the title, the sums are his;
 * - a row opens the invoice; the technician has no «Счета» list (he opens the invoice of his own job only).
 */
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const money = (c) => (c % 100 === 0 ? whole.format(c / 100) : cents2.format(c / 100));
const cents = (s) => Math.round(Number(s.replace(/[$,]/g, "")) * 100);

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  const rowsIn = (g) => vis(`invoice-list-group-${g}`).first().locator('[data-testid^="invoice-row-"]');
  const ids = (loc) => loc.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").slice("invoice-row-".length)));
  const groupSum = async (g) => {
    const title = (await vis(`invoice-list-group-${g}`).first().innerText()).split("\n")[0];
    const m = title.match(/·\s*(\$[\d,]+(?:\.\d\d)?)/);
    h.expect(m, `the group «${title}» names its sum`);
    return cents(m[1]);
  };
  const tile = async (k) => cents((await vis(`money-tile-${k}`).first().innerText()).match(/\$[\d,]+(?:\.\d\d)?/)[0]);

  await h.go("/invoice");
  await vis("invoice-list-groups").first().waitFor({ timeout: 8000 });
  const db = await h.db();
  const today = todayKey();
  const owes = (i) => Math.max(0, i.totalCents - i.paidCents);
  const owed = db.invoices.filter((i) => owes(i) > 0);
  const paid = db.invoices.filter((i) => owes(i) === 0);
  h.expect(owed.length > 0 && paid.length > 0, "demo has owed and paid invoices");
  const sum = owed.reduce((s, i) => s + owes(i), 0);
  // overdue (by the company's day, П4b) — «Должны», the rest — «Ждут оплаты»
  const late = owed.filter((i) => dueKey(i.dueDate) < today);
  const waiting = owed.filter((i) => !late.includes(i));
  const lateIds = await ids(rowsIn("overdue"));
  const waitIds = await ids(rowsIn("waiting"));
  h.expect(JSON.stringify(lateIds.sort()) === JSON.stringify(late.map((i) => i.id).sort()), `«Должны»: every overdue invoice (${lateIds.join(", ")})`);
  h.expect(JSON.stringify(waitIds.sort()) === JSON.stringify(waiting.map((i) => i.id).sort()), `«Ждут оплаты»: every other owed invoice (${waitIds.join(", ")})`);
  h.expect((await groupSum("overdue")) === late.reduce((s, i) => s + owes(i), 0), "«Должны» = what the overdue ones owe");
  h.expect((await groupSum("waiting")) === waiting.reduce((s, i) => s + owes(i), 0), "«Ждут оплаты» = what the others owe");
  h.expect((await tile("waiting")) + (await tile("overdue")) === sum, `the tiles «Ждёт оплаты» + «Просрочено» = all the debts ${money(sum)}`);
  if (late.length) {
    const gl = await vis("invoice-list-group-overdue").first().boundingBox();
    const gw = await vis("invoice-list-group-waiting").first().boundingBox();
    h.expect(gl.y < gw.y, "the overdue group comes first");
    h.expect(/−\d+ дн/.test(await vis(`invoice-row-${late[0].id}`).first().innerText()), "the overdue row says how many days late");
  }
  await h.shot("owed");

  // the default comes back from the address: Today «Ждёт оплаты» will open /invoice?f=owed
  await h.go("/invoice?f=owed");
  await vis("invoice-list-groups").first().waitFor({ timeout: 8000 });
  h.expect((await ids(rowsIn("overdue"))).length + (await ids(rowsIn("waiting"))).length === owed.length, "?f=owed = the same list");

  // paid: «Все ›» of «Оплачено за неделю» → every paid invoice
  await vis("invoice-list-group-paid").first().getByRole("link", { name: /^Все/ }).first().click();
  await p.waitForURL((u) => u.searchParams.get("f") === "paid", { timeout: 5000 });
  await vis("invoice-list-group-paid").first().waitFor({ timeout: 5000 });
  const paidIds = await ids(rowsIn("paid"));
  h.expect(JSON.stringify(paidIds.sort()) === JSON.stringify(paid.map((i) => i.id).sort()), `«Оплачено» lists the ${paid.length} paid invoices (${paidIds.join(", ")})`);
  const paidRow = await vis(`invoice-row-${paid[0].id}`).first().innerText();
  h.expect(/Оплачен(?!о)/.test(paidRow) && !/Оплачено/.test(paidRow), `a paid row says «Оплачен», one word (#1427): ${paidRow.replace(/\n/g, " | ")}`);
  h.expect((await p.getByTestId(`invoice-swipe-pay-${paid[0].id}`).count()) === 0, "a paid row offers no «Принять оплату»");

  // one client's debts
  const c = db.customers.find((x) => owed.some((i) => i.customerId === x.id));
  const mine = owed.filter((i) => i.customerId === c.id);
  await h.go(`/invoice?f=owed&customer=${c.id}`);
  await vis("invoice-list-groups").first().waitFor({ timeout: 8000 });
  h.expect((await vis("screen-title").first().innerText()).includes(c.name), `the client's name is the title (${c.name})`);
  const mineShown = [...(await ids(rowsIn("overdue"))), ...(await ids(rowsIn("waiting")))];
  h.expect(JSON.stringify(mineShown.sort()) === JSON.stringify(mine.map((i) => i.id).sort()), `client ${c.name}: ${mine.length} owed invoices (${mineShown.join(", ")})`);
  let mineSum = 0;
  for (const g of ["overdue", "waiting"]) if (await vis(`invoice-list-group-${g}`).count()) mineSum += await groupSum(g);
  h.expect(mineSum === mine.reduce((s, i) => s + owes(i), 0), `the client's debt ${money(mineSum)}`);

  // a row opens the invoice
  await vis(`invoice-row-${mine[0].id}`).first().click();
  await p.waitForURL(new RegExp(`/invoice/${mine[0].id}$`), { timeout: 5000 });
  h.expect(true, `a row opens the invoice (${p.url()})`);

  // technician: the list is closed (the route guard will close it too — «Каркас»)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/invoice");
  await h.expectText(/Этот раздел для вашей роли закрыт/, "tech: no invoice list");
  h.expect((await p.locator('[data-testid^="invoice-row-"]').count()) === 0, "tech sees no invoice rows");
};
