/**
 * e2e 353 — #1403 (founder 14.11 on build 1405: «прыгает, то больше, то меньше… пальцы отлипают»). Every view.
 * The canvas's screen re-renders in the middle of a pinch (a blink, a hint, a toast, a new size) while the VIEW stays the same.
 * Before, every render settled the canvas again and the live transform under the fingers was dropped to 1: the drawing jumped back
 * to its size before the pinch while the fingers were still down. Here: two fingers pinch in and stay down; the window grows by a
 * few px (the canvas measures itself again: a render with the same view); the drawing keeps the pinched size under the fingers.
 * Finds things by testID; waits on what it checks (no fixed sleeps).
 */
const { skipLength, canvasAt, fitAll } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const len = async () => (await svg().locator("line:not([id^=halo])").evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().width)))[0] ?? 0;
  /** waits until `ok` is true, polling the page (expect.poll-like, without a fixed sleep) */
  const until = async (ok, what) => {
    for (let i = 0; i < 60; i++) {
      if (await ok()) return h.expect(true, what);
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    h.expect(false, what);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });

  // one horizontal gutter
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  await canvasAt(p, b.x + b.width * 0.3, y);
  await p.mouse.move(b.x + b.width * 0.3, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.3 + (0.4 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  await fitAll(p);
  await until(async () => (await len()) > 0, "the gutter is drawn");
  let l0 = 0;
  await until(async () => { const a = await len(); const same = Math.abs(a - l0) < 0.5; l0 = a; return same && a > 0; }, "the drawing stands still after «fit»");

  // two fingers pinch in about the middle and STAY down
  const mid = [b.x + b.width / 2, b.y + b.height / 2];
  const cdp = await p.context().newCDPSession(p);
  const pts = (d) => [{ x: mid[0] - d, y: mid[1], id: 1 }, { x: mid[0] + d, y: mid[1], id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mid[0] - 150, y: mid[1], id: 1 }] });
  for (let d = 145; d >= 120; d -= 5) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mid[0] - d, y: mid[1], id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(120) });
  for (let d = 115; d >= 70; d -= 5) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) });
  let l1 = 0;
  await until(async () => (l1 = await len()) < l0 * 0.8, `fingers down: the drawing got smaller (${Math.round(l0)} → ${Math.round(l1)} px)`);
  let prev = 0;
  await until(async () => { l1 = await len(); const same = Math.abs(l1 - prev) < 0.5; prev = l1; return same; }, "fingers down: the drawing stands still under them");

  // a render of the screen with the SAME view: the window grows by 4 px, the canvas measures itself again
  const vp = p.viewportSize();
  const canvasH = async () => (await p.getByTestId("draw-canvas").boundingBox()).height;
  const h0 = await canvasH();
  await p.setViewportSize({ width: vp.width, height: vp.height + 4 });
  await until(async () => (await canvasH()) > h0 + 2, "the canvas has measured itself again");
  // the render itself: the painter's Svg has the new height (setSize → a render of the screen with the SAME view)
  const svgH0 = Number(await svg().getAttribute("height"));
  await until(async () => Number(await svg().getAttribute("height")) > svgH0 + 2 || Number(await svg().getAttribute("height")) >= Math.round(h0) + 4, "the screen re-rendered at the new size (the painter's Svg is taller)");
  let l2 = 0;
  await until(async () => { l2 = await len(); return true; }, "read the drawing after the render");
  h.expect(Math.abs(l2 - l1) <= l1 * 0.05, `fingers still down, a render with the same view: the drawing keeps its pinched size (${Math.round(l1)} → ${Math.round(l2)} px; before the pinch ${Math.round(l0)})`);

  // the fingers go on: it still follows them; let go — it stays where they left it
  for (let d = 65; d >= 50; d -= 5) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) });
  let l3 = 0;
  await until(async () => (l3 = await len()) < l2 * 0.95, `the pinch goes on after the render (${Math.round(l2)} → ${Math.round(l3)} px)`);
  prev = 0;
  await until(async () => { l3 = await len(); const same = Math.abs(l3 - prev) < 0.5; prev = l3; return same; }, "the drawing stands still under the fingers again");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  let l4 = 0;
  await until(async () => { const a = await len(); const same = Math.abs(a - l4) < 0.5; l4 = a; return same; }, "the drawing settles after the release");
  h.expect(Math.abs(l4 - l3) <= l3 * 0.05, `let go: it stays at the pinched size (${Math.round(l3)} → ${Math.round(l4)} px), no jump`);
  await p.setViewportSize(vp);
};
