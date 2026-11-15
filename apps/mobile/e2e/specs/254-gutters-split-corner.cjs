/**
 * e2e 254 — #933 PR-2: «Разъединить угол» in the corner's sheet: two gutters with their own end caps. Every view.
 * - an L of two gutters: one corner, two end caps; the corner's sheet has «Разъединить угол»;
 * - split: no corner, four end caps, a toast; the stored points and lengths are the same to the inch (a mark, not a move);
 *   «Назад» brings the corner back.
 * No fixed pauses: it waits on what it checks.
 */
const { doubleTap, skipLength, canvasAt } = require("../gutters.cjs");
const { sheetGone } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
  };
  const field = (id) => tid(id).locator("input");
  const pickUnit = async (name) => {
    await tid("quick-length-unit").click();
    const item = p.getByRole("menuitem", { name, exact: true });
    await item.waitFor({ timeout: 3000 });
    await item.click();
    await item.waitFor({ state: "hidden", timeout: 3000 });
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction(() => /^Пробный/.test(([...document.querySelectorAll('[data-testid="module-gutters-status"]')].find((e) => e.getBoundingClientRect().height > 0)?.innerText ?? "").trim()), null, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await stroke([b.x + b.width * 0.08, y], [b.x + b.width * 0.4, y]);
  await tid("quick-length").waitFor({ timeout: 5000 });

  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length").waitFor({ state: "detached", timeout: 5000 });
  const svg = () => p.getByTestId("draw-svg").first();
  const corners = () => svg().locator('[id^="c:"]').count();
  const caps = () => svg().locator('[id^="cap:"]').count();
  const capsAt = () => svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const right = (await capsAt()).sort((a, c) => c[0] - a[0])[0];
  await p.mouse.move(right[0], right[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(right[0], right[1] + (90 * i) / 12);
  await p.mouse.up();
  await skipLength(p);
  await svg().locator('[id^="c:"]').first().waitFor({ timeout: 5000 });
  h.expect((await corners()) === 1 && (await caps()) === 2, `an L: one corner, two end caps (${await corners()}, ${await caps()})`);
  const rows = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => JSON.stringify([e.id, e.geom.a, e.geom.b, e.geom.lengthIn ?? null])).sort(), KEY);
  await p.waitForFunction(([k]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 2, [KEY], { timeout: 5000 });
  const before = await rows();
  await h.shot("corner");
  const k = await svg().locator('[id^="c:"]').first().boundingBox();
  await canvasAt(p, k.x + k.width / 2, k.y + k.height / 2);
  await doubleTap(p, k.x + k.width / 2, k.y + k.height / 2);
  await tid("corner-sheet").waitFor({ timeout: 5000 });
  await tid("corner-split").getByRole("button").click();
  await tid("corner-sheet").waitFor({ state: "detached", timeout: 5000 });
  await sheetGone(p);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="c:"], svg [id^="c:"]').length === 0, null, { timeout: 5000 });
  h.expect((await corners()) === 0 && (await caps()) === 4, `split: no corner, four end caps (${await corners()}, ${await caps()})`);
  await h.expectText(/Угол разъединён/, "the toast says so");
  await p.waitForFunction(([k]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).every((e) => e.attrs.openEnds), [KEY], { timeout: 5000 });
  h.expect(JSON.stringify(await rows()) === JSON.stringify(before), `the points and lengths in the store are the same to the inch (${before.join(" ")})`);
  await h.shot("split");
  await tid("draw-undo").getByRole("button").click();
  await svg().locator('[id^="c:"]').first().waitFor({ timeout: 5000 });
  h.expect((await corners()) === 1 && (await caps()) === 2, "«Назад»: the corner is back");
};
