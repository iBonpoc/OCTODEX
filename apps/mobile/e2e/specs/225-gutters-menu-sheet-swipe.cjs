/**
 * e2e 225 — два зависания шторок (основатель 11.11; #743, #745). Every view.
 * #743 — a menu item that opens a sheet: on iPhone the sheet opened while the menu was still closing never showed, and
 *   its invisible layer took every touch. Now the menu closes first, the pick runs after (src/ui/menuPick.ts; the order
 *   itself is test/menuPick.test.ts — the web cannot hang this way). Here: «⋯» on the drawing → «Слои» (was «Где
 *   панель», gone — #2156) → the sheet is up, the menu is gone, and the sheet answers a press (the grid goes off).
 * #745 — the downspout's and the gutter's sheet (390): no list of its own inside the sheet's list (it took the finger,
 *   a swipe from the middle never closed it); a swipe down from the middle of the sheet closes it.
 *   820/1280: the side panel keeps its own scroll.
 * Finds things by testID / role; waits on what it checks.
 */
const { openProps, skipLength, sheetGone, pressWhenStill, canvasAt, stands } = require("../gutters.cjs");
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const wide = (h.layout?.width ?? 390) > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const move = async (a, b, steps = 12) => {
    const dy = Math.min(b[1] - a[1], p.viewportSize().height - a[1] - 6);
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= steps; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + (dy * i) / steps);
    await p.mouse.up();
  };
  const stroke = async (a, b) => {
    await move(a, b);
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  const panel = () => tid("attr-panel");
  /** how many lists scroll from the fields up to the sheet: the sheet's own only (#745 — it was two) */
  const scrollers = () =>
    panel().first().evaluate((el) => {
      let n = 0;
      for (let e = el; e && e.getAttribute("data-testid") !== "sheet-body"; e = e.parentElement) if (/(auto|scroll)/.test(getComputedStyle(e).overflowY)) n++;
      return n;
    });
  /**
   * a swipe down from the body of the sheet (a field row as near its middle as the travel allows — its upper half; not
   * the grabber, not the tape that keeps the finger), FAR enough to close it by distance alone: past
   * `component.sheetDismissRatio` (½) of the sheet's height, plus up to two steps the pan may spend on starting (one to
   * pass the slop, one more if the browser merges two moves under load). A shorter swipe closes it only as a flick, and under load the browser spaces the moves
   * out — the speed drops, the sheet comes back (#1492: 260 px on a ~700 px sheet failed on CI, ~1 run in 8).
   */
  const swipeMiddle = async (ids) => {
    const sheet = tid("sheet-panel").last();
    await stands(sheet); // it ends sliding in: a swipe on a moving sheet starts from the wrong place
    const sh = await sheet.boundingBox();
    const body = await p.getByTestId("sheet-body").locator("visible=true").last().boundingBox();
    const vh = p.viewportSize().height;
    const steps = 12;
    const travel = Math.ceil(((sh.height * 0.5 + 40) * steps) / (steps - 2));
    const mid = body.y + body.height / 2;
    let best = null;
    for (const id of ids) {
      if (!(await tid(id).count())) continue;
      const bb = await tid(id).first().boundingBox();
      if (!bb || bb.y < body.y || bb.y + bb.height > body.y + body.height) continue;
      const cy = bb.y + Math.min(bb.height / 2, 20);
      if (cy + travel > vh - 6) continue; // the finger must not leave the screen before it has gone far enough
      if (!best || Math.abs(cy - mid) < Math.abs(best[1] - mid)) best = [bb.x + 12, cy];
    }
    h.expect(!!best, `a row in the sheet to swipe ${travel} px down from`);
    await move(best, [best[0], best[1] + travel], steps);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Без срока/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });

  // #743: a menu item opens a sheet — the menu is gone, the sheet answers
  await pressWhenStill(tid("draw-who").getByRole("button"));
  const item = p.getByRole("menuitem", { name: "Слои…" });
  await item.waitFor({ timeout: 4000 });
  await item.click();
  await tid("draw-more-sheet").waitFor({ timeout: 4000 });
  await waitFor(async () => (await p.getByRole("menu").count()) === 0, "the menu is gone under the sheet");
  await p.waitForTimeout(400); // the sheet ends sliding in
  const grid = tid("draw-layer-grid").getByRole("switch");
  await grid.click();
  await p.waitForFunction(() => !document.querySelector('[data-testid="draw-grid"] #grid-minor'), null, { timeout: 5000 })
    .catch(() => h.expect(false, "the sheet answers a press: the grid goes off"));
  await grid.click(); // back as it was
  await p.waitForFunction(() => !!document.querySelector('[data-testid="draw-grid"] #grid-minor'), null, { timeout: 5000 });
  await pressEscUntilClosed(p);
  await sheetGone(p);

  // the menu closed, kept mounted hidden, holds no layer: nothing modal is left, the canvas takes the next stroke
  h.expect((await p.getByRole("menu").count()) === 0 && (await p.getByRole("menuitem").count()) === 0, "no menu left after the pick");
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  const x0 = b.x + b.width * 0.1, x1 = b.x + b.width * 0.5;
  await canvasAt(p, x0, y);
  await canvasAt(p, x1, y);
  // #745: a gutter (this stroke right after the menu and its sheet — it lands on the canvas) and a downspout on it
  await stroke([x0, y], [x1, y]);
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count()) === 1, "one run: the canvas takes a stroke after the menu");

  if (wide) {
    // the side panel holds the fields and keeps its own scroll
    await panel().waitFor({ timeout: 5000 });
    h.expect((await tid("sheet-body").count()) === 0, "820/1280: the side panel, not a sheet");
    const scrolls = await panel().first().evaluate((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY));
    h.expect(scrolls, "820/1280: the side panel scrolls on its own");
    return;
  }

  // the gutter's sheet: no list of its own; a swipe from its middle closes it
  await openProps(p);
  await panel().waitFor({ timeout: 5000 });
  await stands(tid("sheet-panel").last());
  { const n = await scrollers(); h.expect(n === 1, `the gutter's sheet: only the sheet's own scroll (${n})`); }
  // the rows of the window (#2412 G1): the tape's fields, Размер · Цвет · Этаж, the profile, «Ещё»
  await swipeMiddle(["attr-length", "attr-story", "attr-size", "attr-color", "attr-profile", "attr-more"]);
  await waitFor(async () => (await panel().count()) === 0, "a swipe down from the middle closes the gutter's sheet");
  await sheetGone(p);

  // the downspout's sheet (it opens by itself when the downspout is put)
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click((x0 + x1) / 2, y);
  await panel().waitFor({ timeout: 5000 });
  await stands(tid("sheet-panel").last());
  { const n = await scrollers(); h.expect(n === 1, `the downspout's sheet: only the sheet's own scroll (${n})`); }
  // the rows of the window (#2412 G1): Вид · Размер, elbows, offsets, Низ, Верх, «Ещё»
  await swipeMiddle(["attr-ds-kind", "attr-ds-size", "attr-elbow-qty", "attr-offsets", "attr-bottom", "attr-head", "attr-more"]);
  await waitFor(async () => (await panel().count()) === 0, "a swipe down from the middle closes the downspout's sheet");
  await sheetGone(p);
};
