/**
 * Estimates list on the new list cards (step 10а, PR4), every view (3 widths × 2 themes).
 * - card: client, EST number + client phone, property address, work, amount; no «…»; edges aligned;
 * - «waiting for your signature» (awaiting_countersign) is in «Open» under «Needs action» (it was only in «All» before);
 * - several options and not signed → «from $X»;
 * - status chip is read only (no hand moves for an estimate).
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/estimates");
  const db = await h.db();
  const filterRow = (pg) => pg.getByRole("radiogroup").first();

  // a sent or draft estimate with a property: its card shows the client, number, address and work
  const e = db.estimates.find((x) => (x.status === "sent" || x.status === "draft") && x.number && db.properties.some((pr) => pr.id === x.propertyId));
  h.expect(e, "demo has an open estimate");
  const c = db.customers.find((x) => x.id === e.customerId);
  const prop = db.properties.find((x) => x.id === e.propertyId);
  const card = p.locator('[data-testid="list-card"]').filter({ hasText: e.number }).first();
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  for (const s of [c.name, e.number, prop.address, e.title]) h.expect(txt.includes(s), `card shows «${s}»: ${txt.slice(0, 200)}`);
  h.expect(/\$[\d,]+/.test(txt), "amount on the card");
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…» in the list");
  h.expect((await p.getByRole("button", { name: /^Сменить статус:/ }).count()) === 0, "estimate status is read only");
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { reference: filterRow, min: 1 });
  await h.shot("list");

  // several options, not signed → «от $X»
  const multi = db.estimates.find((x) => x.doc && x.doc.options.length > 1 && !x.approval && x.status !== "declined");
  if (multi) {
    await p.getByText(/^Все · \d+$/).last().click();
    await p.waitForTimeout(300);
    const t2 = await p.locator('[data-testid="list-card"]').filter({ hasText: multi.number ?? multi.title }).first().innerText();
    h.expect(/от \$[\d,]+/.test(t2), `several options → «от $X»: ${t2.slice(0, 160)}`);
  }

  // «waiting for your signature» must be in «Open» under «Needs action»
  const target = db.estimates.find((x) => x.status === "sent") ?? e;
  await p.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.estimates = raw.db.estimates.map((x) => (x.id === id ? { ...x, status: "awaiting_countersign" } : x));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, target.id);
  await h.go("/estimates");
  await h.expectText(/Нужно действие · \d+/, "«Needs action» group");
  const body = await p.locator("body").innerText();
  const action = body.slice(body.indexOf("Нужно действие"));
  h.expect(action.includes("Ждёт вашей подписи"), "the estimate waiting for our signature is under «Needs action» in «Open»");
  await h.shot("countersign");
};
