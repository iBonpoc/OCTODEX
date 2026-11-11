/**
 * e2e 250 — #924 (DESIGN-SYSTEM Б1а): the length input is a small window above the middle, and the keyboard does not
 * move it. Every view.
 * - 390: the window is narrower than the screen, not on the bottom edge; the viewport shrunk by a keyboard's height
 *   (and back) → the window's top stays where it was;
 * - 820/1280: the length input is the centred sheet window as before;
 * - a tap outside = «Отменить» (the gutter just drawn goes).
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

  const win = tid("input-window");
  const wide = h.layout.width > 390;
  if (wide) {
    h.expect((await win.count()) === 0 && (await tid("quick-length").count()) === 1, "wide: the ordinary centred sheet window");
  } else {
    await win.waitFor({ timeout: 3000 });
    await p.waitForTimeout(500);
    const vp = p.viewportSize();
    const r0 = await win.boundingBox();
    h.expect(r0.width < vp.width - 16 && r0.y > 40 && r0.y + r0.height < vp.height * 0.8, `a small window above the middle, not on the bottom edge (${JSON.stringify(r0)})`);
    await p.setViewportSize({ width: vp.width, height: vp.height - 300 });
    await p.waitForTimeout(500);
    const r1 = await win.boundingBox();
    h.expect(Math.abs(r1.y - r0.y) <= 1 && Math.abs(r1.x - r0.x) <= 1, `the keyboard does not move it (${Math.round(r0.y)} → ${Math.round(r1.y)})`);
    await p.setViewportSize(vp);
    await p.waitForTimeout(300);
    await h.shot("window");
  }
  // a tap outside = «Отменить»: the gutter just drawn goes
  await p.getByRole("button", { name: "Закрыть", exact: true }).last().click({ position: { x: 5, y: 5 } });
  await tid("quick-length").waitFor({ state: "detached", timeout: 5000 });
  await waitFor(async () => (await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length, KEY)) === 0, "the gutter just drawn went");
};
