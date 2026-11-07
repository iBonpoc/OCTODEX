/**
 * Clients list on the new list cards (step 10а, docs/specs/06-list-cards.md): every view (3 widths × 2 themes).
 * Card shows number, phone, address (no "…"), money for the office; contact buttons call / SMS / map / email
 * with visible size ≤ 36; status changes from the card only by allowed moves (prospect → archive) with «Undo».
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 1280;
  await h.go("/clients");
  const db = await h.db();

  // a client who owes: phone and address on the card, money shown to the office
  const owes = db.customers.find((c) => (c.status ?? "active") === "active" && db.invoices.some((i) => i.customerId === c.id && i.totalCents > i.paidCents));
  h.expect(owes, "demo has a client who owes");
  const card = p.getByRole("button", { name: owes.name, exact: true }).first();
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  h.expect(txt.includes(owes.phone), `phone on the card: ${owes.phone}`);
  const prop = db.properties.find((x) => x.customerId === owes.id);
  h.expect(txt.includes(prop.address), `address on the card: ${prop.address}`);
  // the label «Должен» is next to the amount on cards; on 1280 rows it is the column title
  h.expect(/\$[\d,]+/.test(txt) && (wide || /Должен/i.test(txt)), `owed amount with its label: ${txt.slice(0, 200)}`);
  if (wide) {
    // desktop rows: the phone column starts on the same line in every row (with or without a debt)
    const xs = await p.locator('[data-testid="list-card"]').evaluateAll((els, phones) =>
      els.map((e) => [...e.querySelectorAll("div")].find((d) => phones.includes(d.textContent.trim()) && !d.querySelector("div"))).filter(Boolean).map((d) => Math.round(d.getBoundingClientRect().x)),
      db.customers.map((c) => c.phone));
    h.expect(xs.length >= 2 && xs.every((x) => Math.abs(x - xs[0]) <= 1), `phone column on one line in every row (${xs.join(", ")})`);
  }
  // founder 07.11: money sits in one place — the value at the top right. Debt > 0 → «Должен» (+ «просрочен»),
  // otherwise «Оплатил всего»; no second money block under the facts. On 1280 rows the column is «Баланс».
  const cents = (c) => {
    const inv = db.invoices.filter((i) => i.customerId === c.id && !i.void);
    const owed = inv.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
    const paid = Math.max(0, db.payments.filter((x) => x.customerId === c.id).reduce((s, x) => s + x.amountCents, 0));
    return { owed, paid };
  };
  const usd = (n) => { const d = n % 100 === 0 ? 0 : 2; return "$" + (n / 100).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const withPaid = db.customers.filter((c) => (c.status ?? "active") === "active" && cents(c).owed === 0 && cents(c).paid > 0);
  h.expect(withPaid.length > 0, "demo has a client who paid and owes nothing");
  for (const c of [owes, withPaid[0]]) {
    const m = cents(c);
    const el = p.getByRole("button", { name: c.name, exact: true }).first();
    await el.scrollIntoViewIfNeeded();
    const t = await el.innerText();
    const amounts = t.match(/\$[\d,]+(\.\d\d)?/g) ?? [];
    h.expect(amounts.length === 1, `${c.name}: one money figure on the card (${amounts.join(", ")})`);
    h.expect(amounts[0] === usd(m.owed > 0 ? m.owed : m.paid), `${c.name}: ${m.owed > 0 ? "owed" : "paid total"} shown (${amounts[0]})`);
    // the figure is in the card's header: on the line of the client's name, to the right of it
    const pos = await el.evaluate((root, args) => {
      const leaf = (txt) => [...root.querySelectorAll("div")].find((d) => d.textContent.trim() === txt && !d.querySelector("div"));
      const a = leaf(args.amount), n = leaf(args.name);
      if (!a || !n) return null;
      const ra = a.getBoundingClientRect(), rn = n.getBoundingClientRect();
      return { dy: Math.abs(ra.top - rn.top), right: ra.left > rn.right };
    }, { amount: amounts[0], name: c.name });
    h.expect(pos && pos.dy <= 12 && pos.right, `${c.name}: money in the header, right of the name (${JSON.stringify(pos)})`);
    if (!wide) {
      h.expect(m.owed > 0 ? /Должен/.test(t) && !/Оплатил всего/.test(t) : /Оплатил всего/.test(t) && !/Должен/.test(t), `${c.name}: one label next to the figure`);
    }
  }
  if (wide) await h.expectText(/Баланс/, "desktop column «Баланс»");

  h.expect(!/…|\.\.\./.test(await p.locator("main, body").first().innerText()), "no «…» anywhere in the list");

  // alphabet groups on phone and desktop (one letter header per first letter); tablet is one 2-column grid
  if (h.layout.width !== 820) await h.expectText(new RegExp(` ${owes.name[0]} `), "letter header");
  if (wide) await h.expectText(/КЛИЕНТ|Клиент .*Телефон .*Адрес/i, "column titles above the rows");

  // contact buttons: call always, then map; visible 28–36 (hit area 44 / 48 is added on devices)
  const call = p.getByRole("button", { name: new RegExp(`^Позвонить: ${owes.phone.replace(/[()]/g, "\\$&")}`) }).first();
  h.expect((await call.count()) === 1, "call button");
  const bb = await call.boundingBox();
  h.expect(bb && bb.height <= 36 && bb.height >= 28, `call button visible size ${bb && bb.height}`);
  h.expect((await p.getByRole("button", { name: /^Карта и маршрут: / }).count()) > 0, "map button");
  if (!wide) h.expect((await p.getByRole("button", { name: /^SMS: / }).count()) > 0, "SMS button on phone / tablet cards");
  await h.shot("list");

  // edges and gaps: cards on the search field's lines; tablet rows of equal height (founder 05.11: «линии сдвинуты»)
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { searchPlaceholder: "Имя, телефон или адрес" });

  // founder 07.11 «очень много кнопок сверху»: filters are ONE row; empty ones hidden; tags behind «Фильтры»
  await h.go("/clients");
  const chips = p.getByRole("radio");
  const ys = await chips.evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().top)));
  h.expect(ys.length >= 2 && ys.every((y) => Math.abs(y - ys[0]) <= 1), `status filters in one row (${ys.join(", ")})`);
  const chipText = (await chips.allInnerTexts()).join(" | ");
  h.expect((await p.locator('[role="radio"][aria-checked="true"]').locator("visible=true").count()) === 1, "the chosen filter is announced as checked (web a11y)");
  h.expect(!/· 0\b/.test(chipText.replace(/^Все · \d+/, "")), `no empty filters but «Все»: ${chipText}`);
  const moreBtn = p.getByRole("button", { name: /^Фильтры, включено: \d+$/ });
  h.expect((await moreBtn.count()) === 1, "«Фильтры» button in the row");
  const mb = await moreBtn.boundingBox();
  h.expect(mb && Math.abs(Math.round(mb.y) - ys[0]) <= 1 && mb.height <= 36, `«Фильтры» on the same row, visible ≤ 36 (${mb && mb.height})`);
  h.expect((await p.getByRole("checkbox").locator("visible=true").count()) === 0, "no tag chips on the screen");
  // wheel scrolls the row sideways when it does not fit (web: mouse; keyboard focus scrolls by itself)
  const row = await p.evaluate(() => {
    const r = [...document.querySelectorAll('[role="radiogroup"]')].find((e) => e.offsetParent);
    const sc = r && (r.scrollWidth > r.clientWidth ? r : r.parentElement);
    if (!sc || sc.scrollWidth <= sc.clientWidth) return { fits: true };
    sc.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    return { fits: false, left: sc.scrollLeft };
  });
  h.expect(row.fits || row.left > 0, `mouse wheel scrolls the filter row (${JSON.stringify(row)})`);
  await moreBtn.click();
  await p.waitForTimeout(400);
  const tagRows = h.sheet().getByRole("checkbox");
  h.expect((await tagRows.count()) >= 3, "tags as rows in the «Фильтры» sheet");
  await tagRows.first().click();
  await h.sheet().getByText("Готово", { exact: true }).click();
  await p.waitForTimeout(400);
  h.expect((await p.getByRole("button", { name: "Фильтры, включено: 1" }).count()) === 1, "the button counts the tags that are on");
  h.expect(await p.getByText("Фильтры · 1", { exact: true }).first().isVisible(), "«Фильтры · 1» on the button");
  await h.shot("filters");

  // status from the card: prospect → archive in one tap, then «Undo».
  // The demo has no prospect: make one client a prospect in the saved data (like a lead with an estimate would) and reload.
  const target = db.customers.filter((c) => (c.status ?? "active") === "active").sort((a, b) => a.name.localeCompare(b.name))[0];
  await p.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.customers = raw.db.customers.map((c) => (c.id === id ? { ...c, status: "prospect" } : c));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, target.id);
  await h.go("/clients");
  await p.getByText(/^Потенциальные · \d+$/).last().click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /^Сменить статус: Потенциальный/ }).first().click();
  await p.waitForTimeout(500);
  const sheet = h.sheet();
  h.expect(await sheet.getByText("ставится сам").first().isVisible(), "app-set statuses are locked in the picker");
  await sheet.getByRole("radio", { name: "В архиве" }).click();
  await p.waitForTimeout(500);
  const moved = (await h.db()).customers.find((c) => c.id === target.id);
  h.expect(moved.status === "archived", `prospect archived from the card (${moved.status})`);
  await h.shot("archived");
  await h.click("Отменить");
  await p.waitForTimeout(400);
  const back = (await h.db()).customers.find((c) => c.id === target.id);
  h.expect(back.status === "prospect", `Undo returns the prospect (${back.status})`);
};
