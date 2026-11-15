/**
 * e2e 252 — #933: the corner's chip on the canvas says the angle between the walls («90°», without the kind word, #1275). Every view.
 * - two gutters at a right angle → one corner chip with «90°»;
 * - a skew one (a 45° turn) → «135°».
 * Finds things by id / testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
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
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await stroke([b.x + b.width * 0.08, y], [b.x + b.width * 0.4, y]);
  await tid("quick-length").waitFor({ timeout: 5000 });

  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length").waitFor({ state: "detached", timeout: 5000 });
  const svg = () => p.getByTestId("draw-svg").first();
  const chips = async () => (await svg().locator('[id^="lbl-corner:"] text').allTextContents()).map((x) => x.trim());
  const stroke2 = async (a, c) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((c[0] - a[0]) * i) / 12, a[1] + ((c[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const caps = async () => svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const right = (await caps()).sort((a, c) => c[0] - a[0])[0];
  await stroke2(right, [right[0], right[1] + 90]); // down: a right angle
  await p.waitForTimeout(500);
  await h.shot("angle");
  await waitFor(async () => (await chips()).some((x) => /90°/.test(x)), `a right angle: «90°» on the chip (${JSON.stringify(await chips())})`);
  h.expect(!(await chips()).some((x) => /135°/.test(x)), "…and no other angle");
  // a skew one: from the lower end, down and to the right (a 45° turn)
  const lower = (await caps()).sort((a, c) => c[1] - a[1])[0];
  await stroke2(lower, [lower[0] + 70, lower[1] + 70]);
  await waitFor(async () => (await chips()).some((x) => /135°/.test(x)), `a skew corner: «135°» (${JSON.stringify(await chips())})`);
};
