/**
 * e2e 556 — #2988 (spec 33 П39, DS §19а): two fingers turn the drawing's view; «Север вверх» shows only while it is turned and one
 * press brings it back to 0° and goes. The turn is the view's only: the stored drawing is not changed. Every view.
 * The fingers are CDP touches (as e2e 353's pinch): a mouse cannot turn. Finds things by testID; waits on what it checks.
 */
const { skipLength, canvasAt, fitAll } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const until = async (ok, what) => {
    for (let i = 0; i < 200; i++) {
      if (await ok()) return h.expect(true, what);
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    h.expect(false, what);
  };
  const runs = () => p.evaluate((k) => JSON.stringify(((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run").map((e) => e.geom ?? e.a ?? e)), KEY);

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Без срока/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });

  // one gutter
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  await canvasAt(p, b.x + b.width * 0.3, y);
  await p.mouse.move(b.x + b.width * 0.3, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.3 + (0.4 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  await fitAll(p);
  await until(async () => (await runs()) !== "[]", "the gutter is stored");
  const stored = await runs();
  h.expect((await tid("draw-north").count()) === 0, "not turned: no «Север вверх»");

  // two fingers about the middle turn ~50° (past the 10° threshold, clear of the 90° snap), then let go
  const mid = [b.x + b.width / 2, b.y + b.height / 2];
  const r = 90;
  const at = (deg) => { const a = (deg * Math.PI) / 180; return [{ x: mid[0] - r * Math.cos(a), y: mid[1] - r * Math.sin(a), id: 1 }, { x: mid[0] + r * Math.cos(a), y: mid[1] + r * Math.sin(a), id: 2 }]; };
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at(0)[0]] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (let d = 4; d <= 52; d += 4) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(d) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await tid("draw-north").waitFor({ timeout: 5000 });
  h.expect(true, "turned: «Север вверх» in the header");
  h.expect((await runs()) === stored, "the turn is the view's only: the stored gutter is the same");
  await h.shot("turned");

  await tid("draw-north").getByRole("button").click();
  await tid("draw-north").waitFor({ state: "detached", timeout: 5000 });
  h.expect(true, "«Север вверх» pressed: back to 0°, the button is gone");
  h.expect((await runs()) === stored, "north up: the stored gutter is still the same");
};
