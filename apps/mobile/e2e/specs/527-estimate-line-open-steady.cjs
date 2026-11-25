/**
 * #2421 / #2426 (founder 23.11, TestFlight: «я раздвигал позицию… слова и шрифты оставались на тех же местах… ничего мне не
 * дёргается»; «сдвинуто там, где себестоимость за единицу, потом единица»), every view:
 * - a line opens in place: its name, «кол-во × цена» and its sum stay where they stood (the open line's head is its folded face),
 *   no «˄ Свернуть» row; a tap on the head folds it back to the same place;
 * - the open line's two rows are one grid: «Вид» starts under «Кол-во» and ends under «Ед.», the cost stands exactly under the
 *   price; the frames of a row stand on one line (one label size over every field).
 */
const line = require("../estimateLine.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (sel) => p.locator(sel).locator("visible=true").first();
  const tid = (id) => vis(`[data-testid="${id}"]`);
  const box = async (id) => ((await tid(id).count()) ? await tid(id).boundingBox() : null) ?? { x: -99, y: -99, width: 0, height: 0 };
  const near = (a, b, d = 1.5) => Math.abs(a - b) <= d;
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Railing bracket (тестовые)", 12, 3);
  const id = (await vis('[data-testid^="est-title-"]').getAttribute("data-testid")).replace("est-title-", "");

  // folded: where the name, the line «кол-во × цена» and the sum stand
  const [t0, s0, v0] = [await box(`est-title-${id}`), await box(`est-times-${id}`), await box(`est-sum-${id}`)];
  await tid(`est-line-${id}`).click();
  await tid(`est-collapse-${id}`).waitFor({ timeout: 3000 });
  await tid(`est-cost-${id}`).waitFor({ timeout: 3000 });
  const [t1, s1, v1] = [await box(`est-title-${id}`), await box(`est-times-${id}`), await box(`est-sum-${id}`)];
  h.expect(near(t0.x, t1.x) && near(t0.y, t1.y), `the name stays in place when the line opens (${Math.round(t0.x)},${Math.round(t0.y)} → ${Math.round(t1.x)},${Math.round(t1.y)})`);
  h.expect(near(s0.x, s1.x) && near(s0.y, s1.y), "«кол-во × цена» stays in place");
  h.expect(near(v0.x + v0.width, v1.x + v1.width) && near(v0.y, v1.y), "the sum stays in place");
  h.expect(near(t0.height, t1.height), "the name keeps its size (no field in its place)");
  h.expect((await p.locator(`[data-testid="est-collapse-${id}"] button, [data-testid="est-collapse-${id}"] [role="button"]`).count()) === 1, "the head is one button — no «˄ Свернуть» row of its own");
  const name = await box(`est-name-${id}`);
  h.expect(name.y >= t1.y + t1.height, "the name field comes under the head");

  // one grid: «Вид» = «Кол-во» … «Ед.»; the cost = the price
  const [q, u, pr, k, c] = [await box(`est-qty-${id}`), await box(`est-unit-${id}-button`), await box(`est-price-${id}`), await box(`est-kind-${id}-button`), await box(`est-cost-${id}`)];
  h.expect(near(k.x, q.x) && near(k.x + k.width, u.x + u.width), `«Вид» under «Кол-во · Ед.» (${Math.round(k.x)}…${Math.round(k.x + k.width)} vs ${Math.round(q.x)}…${Math.round(u.x + u.width)})`);
  h.expect(near(c.x, pr.x) && near(c.x + c.width, pr.x + pr.width), `the cost under the price (${Math.round(c.x)}…${Math.round(c.x + c.width)} vs ${Math.round(pr.x)}…${Math.round(pr.x + pr.width)})`);
  // the frames of a row on one line: the unit's frame with the quantity's input, the kind's with the cost's
  const [qi, ci] = [await vis(`[data-testid="est-qty-${id}"] input`).boundingBox(), await vis(`[data-testid="est-cost-${id}"] input`).boundingBox()];
  const frameTop = async (sel) => vis(sel).evaluate((el) => {
    let n = el;
    while (n && n.parentElement && n.getBoundingClientRect().height < 40) n = n.parentElement;
    return n.getBoundingClientRect().top;
  });
  const [qTop, cTop] = [await frameTop(`[data-testid="est-qty-${id}"] input`), await frameTop(`[data-testid="est-cost-${id}"] input`)];
  h.expect(qi && ci && near(u.y, qTop) && near(k.y, cTop), `the frames of a row on one line (Ед. ${Math.round(u.y)} / Кол-во ${Math.round(qTop)}; Вид ${Math.round(k.y)} / Себест. ${Math.round(cTop)})`);
  await h.shot("open");

  // a tap on the head folds the line back to the same place
  await tid(`est-collapse-${id}`).getByRole("button").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-collapse-"]').length === 0, null, { timeout: 3000 });
  const t2 = await box(`est-title-${id}`);
  h.expect(near(t0.x, t2.x) && near(t0.y, t2.y), "folded again: the name where it was");
};
