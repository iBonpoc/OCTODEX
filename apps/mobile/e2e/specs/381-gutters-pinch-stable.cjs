/**
 * e2e 381 — #1403 (founder 14.11, build 1405, iPhone: «то больше, то меньше… прыгнуло»). A pinch is never reset by a redraw of the screen:
 * the live transform of the canvas lives on while the fingers are down, however often the screen renders (a downspout just put blinks,
 * the save after a second, a toast…). Before the fix every render of the screen called settleView and took the live transform away in the
 * middle of the pinch — the picture jumped back to the size before the pinch and went on from there. Every view.
 * The gutter is drawn, its downspout blinks by itself (this spec switches them on), and a slow pinch in goes on for a few seconds: the
 * drawing's width on the screen only ever gets smaller. Waits on signs (a sample per move), no fixed pauses.
 */
const { canvasAt, fitAll, sheetGone } = require("../gutters.cjs");

exports.autoDs = true;

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const width = async () => Math.round((await svg().locator("line:not([id^=halo])").first().boundingBox()).width);

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction(() => !!document.querySelector('[data-testid="module-gutters-status"]'), null, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const a = [b.x + b.width * 0.15, b.y + b.height * 0.3], e = [b.x + b.width * 0.35, b.y + b.height * 0.3];
  await canvasAt(p, a[0], a[1]);
  await p.mouse.move(a[0], a[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((e[0] - a[0]) * i) / 12, a[1]);
  await p.mouse.up();
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-ft").locator("input").fill("45");
  await tid("quick-length-in").locator("input").fill("0");
  await tid("quick-length-apply").getByRole("button").click();
  await p.getByTestId("quick-length").locator("visible=true").first().waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  await sheetGone(p);
  await fitAll(p);
  await p.waitForFunction(() => !!document.querySelector('[data-testid="draw-svg"] circle'), null, { timeout: 8000 }); // the downspout is on the canvas (it blinks for ~1.3 s)

  // a slow pinch in, fingers down for several seconds: every move is a sample of the drawing's width on the screen
  const cdp = await p.context().newCDPSession(p);
  const mid = [b.x + b.width / 2, b.y + b.height / 2];
  const pts = (d) => [{ x: mid[0] - d, y: mid[1], id: 1 }, { x: mid[0] + d, y: mid[1], id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mid[0] - 150, y: mid[1], id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(120) });
  const w0 = await width();
  const samples = [w0];
  for (let d = 119; d >= 40; d -= 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) });
    // twice in the pinch the window changes by a pixel (a keyboard, a bar, a turn): the screen renders again and must not take the pinch away
    if (d === 95 || d === 65) { const vs = p.viewportSize(); await p.setViewportSize({ width: vs.width + (d === 95 ? 1 : -1), height: vs.height }); }
    samples.push(await width());
    // ~45 ms a move: the pinch lasts past the blinks (6 × 220 ms) and the save of the drawing (1 s)
    await p.evaluate(() => new Promise((r) => { let n = 3; const f = () => (--n ? requestAnimationFrame(f) : r(true)); requestAnimationFrame(f); }));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  const jumps = samples.map((w, i) => (i && w > samples[i - 1] * 1.03 + 2 ? `${samples[i - 1]}→${w} at ${i}` : null)).filter(Boolean);
  h.expect(jumps.length === 0, `the width only gets smaller while the fingers are down; no jump back (${jumps.join("; ")}; ${w0} → ${samples[samples.length - 1]})`);
  h.expect(samples[samples.length - 1] < w0 * 0.7, `the pinch really made it smaller (${w0} → ${samples[samples.length - 1]})`);
};
