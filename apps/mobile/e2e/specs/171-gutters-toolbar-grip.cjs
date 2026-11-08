/**
 * e2e 171 — панель холста за точки (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.12). Every view.
 * - the toolbar has a grip (dots); dragged to the right edge and let go → the toolbar stands on the right;
 *   to the left → on the left; back down → at the bottom; the place is kept after a reload.
 * Finds things by testID; waits on what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const vp = p.viewportSize();
  const dragGrip = async (to) => {
    const g = await tid("draw-grip").boundingBox();
    const a = [g.x + g.width / 2, g.y + g.height / 2];
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 15; i++) await p.mouse.move(a[0] + ((to[0] - a[0]) * i) / 15, a[1] + ((to[1] - a[1]) * i) / 15);
    await p.mouse.up();
    await p.waitForTimeout(300);
  };
  const bar = () => tid("draw-toolbar").boundingBox();

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-grip").waitFor({ timeout: 8000 });
  const b0 = await bar();
  h.expect(b0.width > b0.height, "at the bottom first: a row");

  await dragGrip([vp.width - 8, vp.height / 2]);
  await waitFor(async () => { const b = await bar(); return b.height > b.width && b.x > vp.width / 2; }, "dropped at the right edge: a column on the right");
  await h.shot("right");

  await dragGrip([8, vp.height / 2]);
  await waitFor(async () => { const b = await bar(); return b.height > b.width && b.x + b.width < vp.width / 2; }, "dropped at the left edge: a column on the left");

  await p.reload();
  await tid("draw-grip").waitFor({ timeout: 8000 });
  await waitFor(async () => { const b = await bar(); return b.height > b.width && b.x + b.width < vp.width / 2; }, "after a reload: still on the left");

  await dragGrip([vp.width / 2, vp.height - 8]);
  await waitFor(async () => { const b = await bar(); return b.width > b.height; }, "dropped at the bottom: a row again");
};
