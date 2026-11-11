/**
 * e2e 249 — #923: the unit menu of «Длина желоба» opens at its own control, whole on the screen (it came up high over the
 * drawing on an iPhone, the keyboard being up). Every view.
 * - the menu's items are inside the window and right under (or, with no room, above) the unit;
 * - the menu closes on a choice and the sheet stays.
 * Finds things by testID; waits on what it checks.
 */
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

  const vp = p.viewportSize();
  const ub = await tid("quick-length-unit").boundingBox();
  await tid("quick-length-unit").click();
  const items = p.getByRole("menuitem");
  await items.first().waitFor({ timeout: 3000 });
  await p.waitForTimeout(300);
  const first = await items.first().boundingBox();
  const last = await items.last().boundingBox();
  h.expect(first.y >= 0 && last.y + last.height <= vp.height && first.x >= 0 && first.x + first.width <= vp.width, `the menu is whole on the screen (${JSON.stringify([first, last])})`);
  const gap = first.y >= ub.y + ub.height - 8 ? first.y - (ub.y + ub.height) : ub.y - (last.y + last.height);
  h.expect(gap >= -8 && gap <= 40, `the menu is right at the unit (${Math.round(gap)} px apart)`);
  await h.shot("menu");
  await items.filter({ hasText: "мм" }).first().click();
  await items.first().waitFor({ state: "hidden", timeout: 3000 });
  h.expect((await tid("quick-length").count()) === 1, "the sheet stays after a choice");
};
