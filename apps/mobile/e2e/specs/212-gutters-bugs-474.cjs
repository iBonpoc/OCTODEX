/**
 * e2e 212 — ошибки основателя на версии 474 (через руководителя 09.11; docs/specs/33-gutters-canvas.md П20.20). Every view.
 * - a pinch whose first finger has moved before the second lands (always so on a phone): the drawing gets smaller —
 *   and again (two pinches), and nothing is drawn;
 * - the corner sheet: «наружный» / «внутренний» switch the kind and the sheet stays open;
 * - the cut's small drawing is as wide as the sheet, with «стена …» / «лицевая …» chips and the arc with its degrees (no letters: #1276);
 *   the triangle says A, B, C in plain words;
 * - drawn on from a gutter's free end straight on → one gutter, its length the sum (no second line).
 * Finds things by testID / id; waits on what it checks.
 */
const { doubleTap, skipLength, canvasAt, fitAll } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b, len) => {
    // the length sheet of the last gutter may still be leaving: draw on the canvas, not on it (GitHub 09.11, #479)
    await canvasAt(p, a[0], a[1]);
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    if (len) {
      await tid("quick-length").waitFor({ timeout: 5000 });
      await tid("quick-length-ft").locator("input").fill(String(len));
      await tid("quick-length-in").locator("input").fill("0");
      await tid("quick-length-apply").getByRole("button").click();
      await waitFor(async () => (await tid("quick-length").count()) === 0, "the length sheet closes");
    } else await skipLength(p);
    await p.waitForTimeout(250);
  };
  const runs = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt), KEY);
  const lines = () => svg().locator("line:not([id^=halo])").evaluateAll((ls) => ls.map((l) => Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value)));
  /** two fingers pinching in about a point (CDP touch: the web has no other two-finger input) */
  const pinchIn = async (cx, cy, to = 40, step = 5) => {
    const cdp = await p.context().newCDPSession(p);
    const pts = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
    // fingers never land together: the first one has already moved a little when the second lands (on the phone the
    // one-finger draw / pick took the touch and the pinch never came — founder 09.11)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx - 150, y: cy, id: 1 }] });
    for (let d = 145; d >= 120; d -= 5) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - d, y: cy, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(120) });
    for (let d = 115; d >= to; d -= step) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await p.waitForTimeout(400);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => (await tid("module-gutters-status").count()) === 1, "the module's status");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.3;
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.35;

  // 5) straight on from the free end: one gutter, the sum
  await stroke([x0, y], [x1, y], 45);
  await waitFor(async () => (await runs()).some((r) => r.geom.lengthIn === 540), "45 ft");
  await fitAll(p); // 45 ft runs off the screen: the whole drawing in view
  await p.waitForTimeout(300);
  const caps = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const right = caps.sort((a, c) => c[0] - a[0])[0];
  await stroke(right, [right[0] + (x1 - x0) * 0.25, right[1]]);
  await waitFor(async () => (await runs()).length === 1, "straight on from the end cap: still one gutter");
  await waitFor(async () => (await runs())[0].geom.lengthIn > 540, `its length grew: the sum (${JSON.stringify((await runs()).map((r) => r.geom.lengthIn))})`);
  h.expect((await lines()).length === 1, "one line on the canvas");
  // grown again, then «Отменить» in its length sheet: back to the length before — the gutter stays (part 1 × #479)
  const before = (await runs())[0].geom.lengthIn;
  // grown, its end may run under the properties panel beside the canvas (820/1280): the whole drawing in view first
  await fitAll(p);
  await p.waitForTimeout(300);
  const caps3 = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const r3 = caps3.sort((a, c) => c[0] - a[0])[0];
  await canvasAt(p, r3[0], r3[1]);
  await p.mouse.move(r3[0], r3[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(r3[0] + ((x1 - x0) * 0.2 * i) / 12, r3[1]);
  await p.mouse.up();
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-cancel").getByRole("button").click();
  await waitFor(async () => { const rs = await runs(); return rs.length === 1 && rs[0].geom.lengthIn === before; }, `«Отменить» after growing: one gutter, ${before}″ again`);

  // 1) a pinch after a long length and a moved view: smaller, and smaller again
  await fitAll(p);
  await p.waitForTimeout(300);
  const l0 = (await lines())[0];
  // the farthest the canvas goes is a QUARTER of the «fit» size each way (#1403: it was half, #1281): two GENTLE pinches
  // (many small steps, about ×0.7 each) stay above it, and the second one must still work; then a hard one ends past it
  // and goes back to the limit on release (a rubber, no wall)
  const mid = [b.x + b.width / 2, b.y + b.height / 2];
  await pinchIn(mid[0], mid[1], 76, 2);
  const l1 = (await lines())[0];
  h.expect(l1 < l0 * 0.9 && l1 > l0 * 0.5, `a gentle pinch makes it smaller, above the limit (${Math.round(l0)} → ${Math.round(l1)} px)`);
  await pinchIn(mid[0], mid[1], 76, 2);
  const l2 = (await lines())[0];
  h.expect(l2 < l1 * 0.92, `…and a second pinch smaller again (${Math.round(l1)} → ${Math.round(l2)} px)`);
  await pinchIn(mid[0], mid[1]);
  await pinchIn(mid[0], mid[1]);
  const l3 = (await lines())[0];
  h.expect(l3 >= l0 * 0.24 && l3 <= l0 * 0.26, `the farthest limit: a quarter of the fit size; a hard pinch goes no further, it is back at the limit after the release (${Math.round(l0)} → ${Math.round(l3)} px)`);
  // #1403: the grid covers the whole screen at the farthest scale — and beyond it (the live layer moves before the redraw)
  const gridXs = (await svg().locator("#grid-minor").getAttribute("d")).match(/M(-?[\d.]+) -?[\d.]+V/g).map((m) => parseFloat(m.slice(1)));
  const vw = (await svg().boundingBox()).width;
  h.expect(Math.min(...gridXs) < 0 && Math.max(...gridXs) > vw, `the grid reaches past both sides of the screen (${Math.min(...gridXs)} … ${Math.max(...gridXs)}, screen ${Math.round(vw)})`);
  // #1403: fingers STILL DOWN at the farthest scale and beyond: the live layer is smaller than the screen, the grid must still cover all of it
  {
    const cdp = await p.context().newCDPSession(p);
    const pts = (d) => [{ x: mid[0] - d, y: mid[1], id: 1 }, { x: mid[0] + d, y: mid[1], id: 2 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mid[0] - 150, y: mid[1], id: 1 }] });
    for (let d = 145; d >= 120; d -= 5) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mid[0] - d, y: mid[1], id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(120) });
    for (let d = 115; d >= 30; d -= 5) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) });
    // the layer follows the fingers on the UI thread: wait until the drawing has shrunk (the live scale is on), then look at the grid
    let g = await svg().locator("#grid-minor").boundingBox();
    const covers = (r) => r.x <= b.x + 1 && r.x + r.width >= b.x + b.width - 1 && r.y <= b.y + 1 && r.y + r.height >= b.y + b.height - 1;
    await waitFor(async () => covers((g = await svg().locator("#grid-minor").boundingBox())), `fingers down, zoomed far out: the grid covers the whole canvas (grid ${Math.round(g.x)},${Math.round(g.y)} ${Math.round(g.width)}×${Math.round(g.height)}; canvas ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)})`, 20);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    let l4 = 0;
    await waitFor(async () => Math.abs((l4 = (await lines())[0]) - l3) <= l3 * 0.02, `let go beyond the limit: it is back at the limit, not stuck past it (${Math.round(l3)} → ${Math.round(l4)} px)`, 30);
  }
  h.expect((await runs()).length === 1 && (await tid("quick-length").count()) === 0, `the pinch drew nothing (the first finger's stroke was dropped): runs ${(await runs()).length}, length sheet ${await tid("quick-length").count()}`);
  await fitAll(p);
  await p.waitForTimeout(300);

  // a corner: a second gutter down from the right end
  const caps2 = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const r2 = caps2.sort((a, c) => c[0] - a[0])[0];
  await stroke(r2, [r2[0], r2[1] + b.height * 0.2]);
  await waitFor(async () => (await svg().locator('[id^="c:"]').count()) === 1, "a corner");

  // 2) the corner sheet stays open while the kind switches
  const k = await svg().locator('[id^="c:"]').boundingBox();
  await doubleTap(p, k.x + k.width / 2, k.y + k.height / 2);
  await tid("corner-sheet").waitFor({ timeout: 5000 });
  const kind0 = (await tid("corner-kind").locator('[aria-checked="true"]').innerText()).trim();
  const other = kind0 === "наружный" ? "внутренний" : "наружный";
  await tid("corner-kind").getByRole("radio", { name: other, exact: true }).click();
  await waitFor(async () => (await tid("corner-kind").locator('[aria-checked="true"]').innerText()).trim() === other, `switched to ${other}`);
  h.expect((await tid("corner-sheet").count()) === 1, "the sheet stays open");
  await tid("corner-kind").getByRole("radio", { name: kind0, exact: true }).click();
  await waitFor(async () => (await tid("corner-kind").locator('[aria-checked="true"]').innerText()).trim() === kind0, "and back");

  // 3) the cut's drawing: as wide as the sheet, its chips, A B C
  const sk = await tid("corner-sketch").boundingBox();
  const sheetW = (await tid("corner-sheet").boundingBox()).width;
  h.expect(sk.width >= sheetW * 0.9, `the sketch is as wide as the sheet (${Math.round(sk.width)} of ${Math.round(sheetW)})`);
  const texts = await tid("corner-sketch").locator("text").evaluateAll((ts) => ts.map((t) => (t.textContent || "").trim()));
  h.expect(texts.filter((t) => /^стена /.test(t)).length === 2 && texts.filter((t) => /^лицевая /.test(t)).length === 2, `«стена …», «лицевая …» on each gutter (${texts.join(" | ")})`);
  h.expect(!["A", "B", "C"].some((x) => texts.includes(x)) && texts.includes("90°"), "no letters A, B, C on the drawing (#1276: they are the triangle's, in words); the arc says 90°");
  // the chips do not overlap
  const boxes = await tid("corner-sketch").locator("rect").evaluateAll((rs) => rs.map((r) => { const b = r.getBoundingClientRect(); return [b.x, b.y, b.x + b.width, b.y + b.height]; }));
  const overlap = boxes.some((a, i) => boxes.some((c, j) => j > i && a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]));
  h.expect(!overlap, "the chips do not overlap");
  // the face is away from the house: on an outside corner the «лицевая» chips are outside the angle (farther from the
  // arc's degrees than the «стена» ones), on an inside corner inside it
  const pos = await tid("corner-sketch").locator("text").evaluateAll((ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return { t: (t.textContent || "").trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  const at = (re) => pos.filter((q) => re.test(q.t));
  const deg = at(/^\d+°$/)[0]; // the arc's degrees stand inside the angle (the letters A, B and the C line are gone, #1276)
  const cm = [deg.x, deg.y];
  const far = (qs) => qs.reduce((n, q) => n + Math.hypot(q.x - cm[0], q.y - cm[1]), 0) / qs.length;
  const faceOut = far(at(/^лицевая /)) > far(at(/^стена /));
  h.expect(faceOut === (kind0 === "наружный"), `${kind0}: the face is ${kind0 === "наружный" ? "outside" : "inside"} the angle`);
  // 4) the triangle in plain words
  h.expect(/^A — /.test(await tid("tri-a").innerText()) && /^B — /.test(await tid("tri-b").innerText()) && /^C — /.test(await tid("tri-c").innerText()), "A, B, C in plain words");
  await h.shot("corner");
};
