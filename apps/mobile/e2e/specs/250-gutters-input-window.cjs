/**
 * e2e 250 — #924 (DESIGN-SYSTEM Б1а): the length input is a small window pinned near the top, not a sheet, and the
 * keyboard does not move it. Every view.
 * - 390 (both themes) and 375×667: it is a window (no sheet grabber), narrower than the screen, near the top; its
 *   place is the same before and after the focus and a typed number, and with the viewport shrunk by a keyboard's
 *   height; the buttons stay in view above that keyboard;
 * - a tap outside and Esc = «Отменить» (the gutter just drawn goes); «Применить» saves; a wrong value does not close it;
 * - 820/1280: the length input is the centred sheet window as before.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
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
  const gutters = async () => (await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt), KEY));
  const draw = async () => {
    await h.go("/module/gutters/draw");
    await tid("draw-surface").waitFor({ timeout: 8000 });
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * 0.42;
    await stroke([b.x + b.width * 0.08, y], [b.x + b.width * 0.4, y]);
    await tid("quick-length").waitFor({ timeout: 5000 });
  };
  /** one more gutter in the store, then (cancel) back to how many there were */
  const cancelWith = async (how) => {
    const n0 = (await gutters()).length;
    await draw();
    await waitFor(async () => (await gutters()).length === n0 + 1, "the gutter just drawn is stored");
    await how();
    await tid("quick-length").waitFor({ state: "detached", timeout: 5000 });
    await waitFor(async () => (await gutters()).length === n0, "«Отменить»: the gutter just drawn went");
  };
  if (wide) {
    h.expect((await win.count()) === 0 && (await tid("quick-length").count()) === 1, "wide: the ordinary centred sheet window");
  } else {
    await win.waitFor({ timeout: 3000 });
    await p.waitForTimeout(500);
    h.expect((await p.getByRole("adjustable").locator("visible=true").count()) === 0, "a window, not a sheet: no grabber");
    const place = async () => {
      let r = await win.boundingBox();
      for (let i = 0; i < 20; i++) { await p.waitForTimeout(100); const n = await win.boundingBox(); const still = n.x === r.x && n.y === r.y; r = n; if (still) break; }
      return r;
    };
    const check = async (label) => {
      const vp = p.viewportSize();
      const r0 = await place();
      h.expect(r0.width < vp.width - 16 && r0.y > 8 && r0.y < vp.height / 4, `${label}: narrower than the screen, near the top (${JSON.stringify(r0)})`);
      await field("quick-length-ft").focus(); // the focus
      await p.keyboard.type("7");
      const r1 = await place();
      h.expect(Math.abs(r1.y - r0.y) <= 1 && Math.abs(r1.x - r0.x) <= 1, `${label}: the same place after the focus and a typed number (${Math.round(r0.y)} → ${Math.round(r1.y)})`);
      await p.setViewportSize({ width: vp.width, height: vp.height - 260 }); // a number keyboard's height
      const r2 = await place();
      h.expect(Math.abs(r2.y - r0.y) <= 1, `${label}: the keyboard does not move it (${Math.round(r0.y)} → ${Math.round(r2.y)})`);
      const ap = await tid("quick-length-apply").boundingBox();
      h.expect(ap.y + ap.height <= vp.height - 260, `${label}: the buttons stay above the keyboard (${Math.round(ap.y + ap.height)} ≤ ${vp.height - 260})`);
      await p.setViewportSize(vp);
      await place();
    };
    await check("390");
    await h.shot("window");
    await p.setViewportSize({ width: 375, height: 667 });
    await check("375×667");
  }
  // a wrong value does not close it
  await field("quick-length-in").fill("12");
  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length-bad").waitFor({ timeout: 3000 });
  h.expect((await tid("quick-length").count()) === 1, "a wrong value keeps the window");
  // «Применить» saves
  await field("quick-length-ft").fill("21");
  await field("quick-length-in").fill("8");
  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length").waitFor({ state: "detached", timeout: 5000 });
  await waitFor(async () => (await gutters()).some((e) => Math.abs((e.geom.lengthIn ?? 0) - 260) < 1), "«Применить» saved 21′ 8″ = 260″");
  // a tap outside = «Отменить»: the gutter just drawn goes
  await cancelWith(() => p.getByRole("button", { name: "Закрыть", exact: true }).last().click({ position: { x: 5, y: 5 } }));
  // Esc = «Отменить»
  await cancelWith(() => pressEscUntilClosed(p));
};
