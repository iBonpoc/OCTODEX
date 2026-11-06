const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * «Ещё» → Оплаты (wave 8, 13 §3.15), every view: period, total, method chips with sums, a card per payment → receipt → invoice.
 * Sales and the technician have no «Оплаты» (13 §4).
 */
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const money = (c) => (c % 100 === 0 ? whole.format(c / 100) : cents2.format(c / 100));
const METHOD = { card: "Карта", cash: "Наличные", check: "Чек", zelle: "Zelle" };

exports.run = async (h) => {
  const p = h.page;
  await h.go("/payments?p=all");
  const db = await h.db();
  h.expect(db.payments.length > 0, "demo has payments");
  const cards = p.locator('[data-testid="list-card"]');
  const all = db.payments.reduce((s, x) => s + x.amountCents, 0);
  await h.expectText(new RegExp(`Собрано · оплат: ${db.payments.length}`), "count of payments");
  h.expect((await p.locator("body").innerText()).includes(money(all)), `total ${money(all)}`);
  h.expect((await cards.count()) === db.payments.length, "one card per payment");
  await h.shot("all");

  // today by the company's day (П4b)
  await h.go("/payments?p=today");
  const today = db.payments.filter((x) => dayKey(x.at) === todayKey());
  h.expect((await cards.count()) === today.length, `today: ${today.length} payments`);

  // method filter (when the period has more than one method)
  await h.go("/payments?p=all");
  const methods = [...new Set(db.payments.map((x) => x.method))];
  if (methods.length > 1) {
    const m = methods[0];
    const ofM = db.payments.filter((x) => x.method === m);
    const label = METHOD[m] ?? m;
    await p.getByText(new RegExp(`^${label} · \\$`)).last().click();
    await p.waitForTimeout(400);
    h.expect((await cards.count()) === ofM.length, `${label}: ${ofM.length} payments`);
    h.expect(/[?&]m=/.test(p.url()), "the method is kept in the address");
  }

  // payment → receipt → invoice
  await h.go("/payments?p=all");
  await cards.first().click();
  await p.waitForTimeout(600);
  h.expect(/\/receipt\//.test(p.url()), `card opens the receipt (${p.url()})`);
  // the receipt links to its invoice through «Связано» (PR-3)
  await p.getByRole("button", { name: /^Связано: Счёт / }).locator("visible=true").first().click();
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
