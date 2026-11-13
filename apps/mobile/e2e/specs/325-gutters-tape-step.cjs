/**
 * e2e 325 — #1315 (founder 13.11: «шаг между метками больше, потому что тяжело попадать»): the tape's marks are 16 px apart (they were 8):
 * a drag of one mark (16 px) is exactly 1/16″ more; a short drag (5 px — it was a whole mark before) moves nothing, the tape
 * settles back on its mark. Every view. Finds things by testID; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
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
  /** the big value above the tape, as read in sixteenths: «25′ 6″» = 0, «25′ 6 1/16″» = 1 */
  const value = async () => (await tid("quick-length-tape-value").innerText()).replace(/\s+/g, " ").trim();
  /** a slow drag of `px` to the left and a lift with no flick: the tape follows the finger 1:1 (one mark = `tape-tick` px) */
  const drag = async (px) => {
    const tb = await tid("quick-length-tape").boundingBox();
    const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    for (let i = 1; i <= 4; i++) await p.mouse.move(cx - (px * i) / 4, cy);
    await p.mouse.move(cx - px, cy);
    await p.mouse.up();
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await stroke([b.x + b.width * 0.08, y], [b.x + b.width * 0.4, y]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-tape").waitFor({ timeout: 5000 });
  const v0 = await value();

  // 5 px is a third of a mark: the tape settles back — nothing changed
  await drag(5);
  await p.waitForFunction(([id, v]) => { const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getBoundingClientRect().height > 0); return !!el && el.innerText.replace(/\s+/g, " ").trim() === v; }, ["quick-length-tape-value", v0], { timeout: 5000 });
  h.expect((await value()) === v0, `5 px moves nothing (${v0})`);

  // 16 px is one mark: 1/16″ more; the value changes by exactly that
  await drag(16);
  await p.waitForFunction(([id, v]) => { const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getBoundingClientRect().height > 0); return !!el && el.innerText.replace(/\s+/g, " ").trim() !== v; }, ["quick-length-tape-value", v0], { timeout: 5000 });
  const v1 = await value();
  h.expect(/1\/16″$/.test(v1) || /1\/16/.test(v1), `16 px = one mark, 1/16″ more (${v0} → ${v1})`);
  await h.shot("one-mark");
};
