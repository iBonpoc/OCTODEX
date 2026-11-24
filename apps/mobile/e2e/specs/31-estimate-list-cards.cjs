/**
 * Estimates list on the new list cards (step 10а, PR4), every view (3 widths × 2 themes).
 * - row (v2, grouped): client, what is with it now · work, amount;
 * - «waiting for your signature» (awaiting_countersign) is in «Open» under «Needs action» (it was only in «All» before);
 * - several options and not signed → «from $X»;
 * - status chip is read only (no hand moves for an estimate).
 */

exports.run = async (h) => {
  const p = h.page;
  await h.go("/estimates");
  const db = await h.db();
  // a sent or draft estimate with a property: its card shows the client, number, address and work
  const e = db.estimates.find((x) => (x.status === "sent" || x.status === "draft") && x.number && db.properties.some((pr) => pr.id === x.propertyId));
  h.expect(e, "demo has an open estimate");
  const c = db.customers.find((x) => x.id === e.customerId);
  const prop = db.properties.find((x) => x.id === e.propertyId);
  // v2 (rule 12): an estimate is a grouped row `est-row-<id>`: the client, what is with it now · the work, the amount; the number and the
  // address are on the estimate's own screen
  const card = p.getByTestId(`est-row-${e.id}`).locator("visible=true").first();
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  for (const s of [c.name, e.title]) h.expect(txt.includes(s), `row shows «${s}»: ${txt.slice(0, 200)}`);
  h.expect(/\$[\d,]+/.test(txt), "amount on the row");
  h.expect((await p.getByRole("button", { name: /^Сменить статус:/ }).count()) === 0, "estimate status is read only");
  await p.evaluate(() => window.scrollTo(0, 0));
  await h.shot("list");

  // several options, not signed → «от $X»
  const multi = db.estimates.find((x) => x.doc && x.doc.options.length > 1 && !x.approval && x.status !== "declined");
  if (multi) {
    const t2 = await p.getByTestId(`est-row-${multi.id}`).locator("visible=true").first().innerText();
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
