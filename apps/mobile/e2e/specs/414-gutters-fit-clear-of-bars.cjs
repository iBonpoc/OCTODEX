/**
 * e2e 414 — «вписать» не кладёт чертёж под шапку, панель инструментов и плашки (#1667). Every view.
 * - two gutters, one high and one low; «Весь рисунок» → every line and every length label lies below the header and
 *   above the toolbar and the summary chips (it was under them: the fit kept one margin on every side);
 * - the page opened again (the drawing fits itself; the chips and the toolbar's place come after the first frame):
 *   the same; at 390 the toolbar moved to the left edge — the drawing also clear of it on the left;
 * - rule 27 (no jump): once a finger has touched the screen, what lies over the canvas may change (the toolbar moved to
 *   the left by its grip) — the drawing does not move by itself.
 * Waits until the view has settled (two equal measures) before it measures. Finds things by testID.
 */
const { skipLength, canvasAt, sheetGone, fitAll } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const narrow = (h.layout?.width ?? 390) <= 390;

  /** the boxes of what is drawn and of what lies over it, in one look at the page */
  const look = () =>
    p.evaluate(() => {
      const vis = (el) => el && el.offsetParent !== null && el.getBoundingClientRect().height > 0;
      const box = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => e.getBoundingClientRect());
      const drawn = [...box('[data-testid="draw-svg"] line:not([id^="halo"])'), ...box('[data-testid="draw-svg"] [id^="face-"]'), ...box('[data-testid="draw-svg"] text')];
      const header = box('[data-testid="draw-back"]')[0];
      const bottoms = [...box('[data-testid="draw-summary"]'), ...box('[data-testid="draw-summary-next"]')];
      const tb = box('[data-testid="draw-toolbar"]')[0];
      return {
        n: drawn.length,
        top: Math.min(...drawn.map((r) => r.top)),
        low: Math.max(...drawn.map((r) => r.bottom)),
        left: Math.min(...drawn.map((r) => r.left)),
        headerBottom: header ? header.bottom : 0,
        barsTop: Math.min(...bottoms.map((r) => r.top), tb && tb.width > tb.height ? tb.top : Infinity),
        tbRight: tb && tb.height > tb.width ? tb.right : 0,
      };
    });
  /** two equal looks in a row: the view has stopped moving */
  const settled = async () => {
    let a = await look();
    for (let i = 0; i < 30; i++) {
      await p.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
      const b = await look();
      if (JSON.stringify(a) === JSON.stringify(b)) return b;
      a = b;
    }
    h.expect(false, "the view settles (two equal measures in a row)");
    return a;
  };
  /** the place of what is drawn only (not of the bars) */
  const drawnAt = async () => {
    const s = await settled();
    return [s.n, Math.round(s.top), Math.round(s.low), Math.round(s.left)].join(",");
  };
  // the toolbar is moved by its grip (#2156: no «Где панель» in the menu any more; the drag as e2e 171 does it) // i18n-old: ok
  const moveToolbar = async (where) => {
    const vp = p.viewportSize();
    const to = where === "left" ? [8, vp.height / 2] : where === "right" ? [vp.width - 8, vp.height / 2] : [vp.width / 2, vp.height - 8];
    const g = await tid("draw-grip").boundingBox();
    const a = [g.x + g.width / 2, g.y + g.height / 2];
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 15; i++) await p.mouse.move(a[0] + ((to[0] - a[0]) * i) / 15, a[1] + ((to[1] - a[1]) * i) / 15);
    await p.mouse.up();
    await p.waitForFunction((w) => localStorage.getItem("octo.mod.gutters.toolbar.v1") === w, where, { timeout: 5000 });
  };
  const clear = async (what, side) => {
    const s = await settled();
    h.expect(s.n >= 4, `${what}: the gutters and their lengths are drawn (${s.n})`);
    h.expect(s.top >= s.headerBottom, `${what}: nothing under the header (${Math.round(s.top)} ≥ ${Math.round(s.headerBottom)})`);
    h.expect(s.low <= s.barsTop, `${what}: nothing under the toolbar and the chips (${Math.round(s.low)} ≤ ${Math.round(s.barsTop)})`);
    if (side) h.expect(s.left >= s.tbRight, `${what}: nothing under the toolbar at the left (${Math.round(s.left)} ≥ ${Math.round(s.tbRight)})`);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const stroke = async (a, c) => {
    await canvasAt(p, a[0], a[1]);
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(a[0] + ((c[0] - a[0]) * i) / 10, a[1] + ((c[1] - a[1]) * i) / 10);
    await p.mouse.up();
    await skipLength(p);
    await sheetGone(p);
  };
  // a tall drawing: a gutter high up and one low, so the fit is decided by the height
  await stroke([b.x + b.width * 0.3, b.y + b.height * 0.25], [b.x + b.width * 0.6, b.y + b.height * 0.25]);
  await stroke([b.x + b.width * 0.3, b.y + b.height * 0.72], [b.x + b.width * 0.6, b.y + b.height * 0.72]);
  await tid("draw-to-lead").waitFor({ timeout: 6000 }); // saved: the page can be opened again
  const url = p.url();

  await fitAll(p);
  await clear("«Весь рисунок»", false);

  // opened again: it fits itself, after the chips and the toolbar's place have come
  await h.go(new URL(url).pathname + new URL(url).search);
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await tid("draw-summary").waitFor({ timeout: 8000 });
  await clear("opened again", false);
  await h.shot("reopened");

  // rule 27: touched (the grip), then what lies over the canvas changes (the toolbar to the left) — the drawing stays put
  const before = await drawnAt();
  await moveToolbar("left");
  h.expect((await drawnAt()) === before, `after a touch the drawing does not move by itself (${before} → ${await drawnAt()})`);

  if (narrow) {
    // opened again with the toolbar at the left edge: clear of it on the left too
    await h.go(new URL(url).pathname + new URL(url).search);
    await tid("draw-surface").waitFor({ timeout: 8000 });
    await tid("draw-summary").waitFor({ timeout: 8000 });
    await clear("the toolbar at the left, opened again", true);
    await h.shot("left");
  }
};
