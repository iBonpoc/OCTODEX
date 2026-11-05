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
  h.expect(/\$[\d,]+/.test(txt) && /Должен/i.test(txt), `owed amount with its label: ${txt.slice(0, 200)}`);
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
