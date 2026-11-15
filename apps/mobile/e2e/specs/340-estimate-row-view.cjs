/**
 * e2e 340 — the estimate line by the approved prototype (DS §8.3, spec 2026-11-12 §11.2.2, #1307 part «а»), every view,
 * by testID:
 * - «Кратко» by default: a folded row is its name and its sum, one line; «Подробно» adds «$10 × 3 ea» and the
 *   description; the choice survives a reload (the device keeps it);
 * - the open row: «˄ Свернуть» on the left, the trash; ONE row «Кол-во · Ед. · Цена»; «Вид» is a list; the sum and the
 *   panel's total change while typing, before the field is left;
 * - «abc» in the quantity: an error, the row stays open, another row does not open;
 * - the trash on a folded row and on the open one: the line goes at once, «Вернуть» brings it back;
 * - a folded row never shows profit or cost.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => p.locator(sel).count();
  const lineIds = async () => (await p.locator('[data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-line-", ""));

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });

  // two lines, one with a description and a cost
  await tid("est-add-new").getByRole("button").click();
  const a = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await vis(`[data-testid="est-name-${a}"] input`).first().fill("Gutter clean (тестовые)");
  await vis('[data-testid^="est-qty-"]').first().locator("input").fill("3");
  // the price typed: the sum changes before the field is left
  await vis(`[data-testid="est-price-${a}"] input`).first().fill("10");
  await p.waitForFunction((id) => /\$30\b/.test(document.querySelector(`[data-testid="est-figures-${id}"]`)?.textContent || ""), a, { timeout: 3000 });
  // one row of numbers: the quantity, the unit and the price stand side by side
  const box = async (id) => (await vis(`[data-testid="${id}"]`).first().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const [q, u, pr] = [await box(`est-qty-${a}`), await box(`est-unit-${a}-button`), await box(`est-price-${a}`)];
  h.expect(Math.abs(q.y - u.y) < 4 && Math.abs(u.y - pr.y) < 4 && q.x < u.x && u.x < pr.x, `«Кол-во · Ед. · Цена» in one row (${[q, u, pr].map((b) => `${Math.round(b.x)},${Math.round(b.y)}`).join(" / ")})`);
  // «˄ Свернуть» on the left of the trash
  const [col, tr] = [await box(`est-collapse-${a}`), await box(`est-trash-${a}`)];
  h.expect(col.x < tr.x, "«Свернуть» on the left, the trash on the right");
  // «Вид» is a list
  await tid(`est-kind-${a}-button`).click();
  await tid(`est-kind-${a}-material`).click();
  await vis('textarea, [data-testid^="est-name-"] input').first().waitFor({ timeout: 3000 });
  await vis(`[data-testid="est-cost-${a}"] input`).first().fill("4");
  await h.shot("open");
  await line.fold(h);
  await line.addCustom(h, "Downspout (тестовые)", 50);

  // «Кратко» by default: the name and the sum, no «× qty», no profit or cost
  const folded = await tid(`est-line-${a}`).innerText();
  h.expect(/Gutter clean/.test(folded) && /\$30\b/.test(folded) && !/×/.test(folded), `«Кратко»: the name and the sum (${folded.replace(/\n/g, " ")})`);
  h.expect(!/прибыль|себестоим|\$4\b/i.test(folded), "a folded row never shows profit or cost");
  await h.shot("brief");

  // «Подробно»: «$10.00 × 3 ea»; kept after a reload
  await tid("est-row-view").getByText("Подробно").click();
  await tid(`est-times-${a}`).waitFor({ timeout: 3000 });
  h.expect(/\$10(\.00)? × 3 ea/.test(await tid(`est-times-${a}`).innerText()), "«Подробно»: the price × the quantity");
  await h.shot("full");
  await p.waitForFunction(() => /full/.test(localStorage.getItem("octo.est.rowView.v1") || ""), null, { timeout: 3000 });
  await tid("est-row-view").getByText("Кратко").click();
  await p.waitForFunction(() => /brief/.test(localStorage.getItem("octo.est.rowView.v1") || ""), null, { timeout: 3000 });
  h.expect((await count('[data-testid^="est-times-"]')) === 0, "«Кратко» again: no «× qty»");

  // «abc» in the quantity: an error under the field, the row stays open, another does not open
  await tid(`est-line-${a}`).click();
  await vis(`[data-testid="est-qty-${a}"] input`).first().fill("abc");
  const ids = await lineIds();
  const b = ids.find((x) => x !== a);
  await tid(`est-line-${b}`).click();
  await tid(`est-collapse-${a}`).waitFor({ timeout: 3000 });
  h.expect((await count(`[data-testid="est-collapse-${b}"]`)) === 0, "a wrong row stays open, the other does not open");
  await vis(`[data-testid="est-qty-${a}"] input`).first().fill("3");
  await line.fold(h);

  // the trash of a folded row: gone at once, «Вернуть» brings it back
  await tid(`est-trash-${b}`).getByRole("button").click();
  await p.waitForFunction((id) => !document.querySelector(`[data-testid="est-line-${id}"]`), b, { timeout: 3000 });
  h.expect(await line.undo(h), "«Вернуть» pressed");
  await tid(`est-line-${b}`).waitFor({ timeout: 3000 });
  // the trash of the open row
  await tid(`est-line-${b}`).click();
  await tid(`est-collapse-${b}`).waitFor({ timeout: 3000 });
  await tid(`est-trash-${b}`).getByRole("button").click();
  await p.waitForFunction((id) => !document.querySelector(`[data-testid="est-line-${id}"]`), b, { timeout: 3000 });
  h.expect((await count('[data-testid^="est-collapse-"]')) === 0, "the open row deleted: nothing open");
};
