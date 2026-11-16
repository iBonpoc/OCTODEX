/**
 * e2e 443 — #1763 (founder 16.11): a downspout just put blinks (≈0.5 s, `motion.blinkSteps` × `motion.blinkStepMs`), and only then
 * its properties open — on the phone a sheet, which used to come at once and cover the blink. Wider the properties are the side column:
 * nothing covers the drawing, the blink is all. Reduce motion: no blink, the sheet at once. The blink is read from the drawing itself
 * (the downspout's mark flips its fill), the times on the page's own clock. Every view. Finds things by testID / stored elements.
 */
const { skipLength, pastDoubleTap } = require("../gutters.cjs");
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const phone = p.viewportSize().width < 600;
  const count = (kind, n) => p.waitForFunction(([k, kd, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === kd).length === want, [KEY, kind, n], { timeout: 8000 });

  const open = async () => {
    await h.go("/module/gutters/draw");
    await tid("draw-surface").waitFor({ timeout: 8000 });
  };
  // the runner turns motion down for every spec (run.cjs); here motion is on, as on a phone by default — before the app loads
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await open();
  const s = await p.getByTestId("draw-surface").boundingBox();
  const a = [s.x + s.width * 0.15, s.y + s.height * 0.35], b = [s.x + s.width * 0.85, s.y + s.height * 0.35];
  const drawRun = async (n) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1]);
    await p.mouse.up();
    await skipLength(p);
    await count("run", n);
  };
  await drawRun(1);

  /** puts a downspout at `x` on the gutter and records, on the page's clock: each change of the drawing's marks, and when the sheet showed */
  const put = async (x) => {
    await tid("draw-tool-ds").getByRole("button").click();
    await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="draw-tool-ds"] [aria-pressed="true"]')].length > 0, null, { timeout: 3000 });
    await pastDoubleTap(p);
    const at = [a[0] + (b[0] - a[0]) * x, a[1]]; // on the gutter as drawn (the view is not moved in this spec)
    await p.evaluate(() => {
      const marks = () => [...document.querySelectorAll('[data-testid="draw-svg"] circle')].map((c) => `${c.getAttribute("fill")}|${c.getAttribute("stroke")}`).join(";");
      const sheet = () => [...document.querySelectorAll('[data-testid="attr-panel"]')].some((e) => e.getClientRects().length > 0);
      const r = (window.__b443 = { t0: performance.now(), flips: [], sheet: null, last: marks() });
      const tick = () => {
        const now = performance.now();
        const m = marks();
        if (m !== r.last) { r.flips.push(now - r.t0); r.last = m; }
        if (r.sheet === null && sheet()) r.sheet = now - r.t0;
        if (now - r.t0 < 2000) requestAnimationFrame(tick);
        else r.done = true;
      };
      requestAnimationFrame(tick);
    });
    await p.mouse.click(at[0], at[1]);
    await p.waitForFunction(() => window.__b443?.done === true, null, { timeout: 5000 });
    return p.evaluate(() => window.__b443);
  };
  const closeSheet = async () => {
    if (!phone) return;
    await pressEscUntilClosed(p);
    await sheetGone(p);
    await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="attr-panel"]')].some((e) => e.getClientRects().length > 0), null, { timeout: 5000 });
  };

  // blinks first, the sheet after it
  const r = await put(0.3);
  await count("downspout", 1);
  // the first change is the downspout appearing; then the beats: 4 beats → at least 3 flips after it
  h.expect(r.flips.length >= 4, `the new downspout blinks (changes of the marks at ${r.flips.map(Math.round)} ms)`);
  const lastFlip = r.flips[r.flips.length - 1];
  h.expect(lastFlip >= 300 && lastFlip <= 1200, `the blink lasts about half a second (last beat at ${Math.round(lastFlip)} ms)`);
  if (phone) {
    h.expect(r.sheet !== null, "the sheet of the new downspout opens by itself");
    h.expect(r.sheet >= 400 && r.sheet <= 1500, `the sheet opens after the blink, about 0.5 s (at ${Math.round(r.sheet)} ms)`);
    h.expect(r.flips.filter((t) => t > r.sheet + 50).length === 0, `nothing blinks under the sheet (flips ${r.flips.map(Math.round)}, sheet ${Math.round(r.sheet)})`);
  } else h.expect(r.sheet !== null && r.sheet < 400, `wider the properties column shows the new downspout at once (at ${r.sheet} ms)`);
  await h.shot("after-blink");
  await closeSheet();

  // a tap right after putting one: its sheet does not come over what that tap does
  if (phone) {
    await tid("draw-tool-ds").getByRole("button").click();
    await pastDoubleTap(p);
    await p.mouse.click(a[0] + (b[0] - a[0]) * 0.7, a[1]);
    await count("downspout", 2);
    await p.mouse.click(s.x + s.width * 0.5, s.y + s.height * 0.7); // the empty canvas, inside the blink
    await p.waitForFunction(() => { const t0 = (window.__t443 ??= performance.now()); return performance.now() - t0 > 1200; }, null, { timeout: 5000, polling: 100 });
    h.expect(!(await p.evaluate(() => [...document.querySelectorAll('[data-testid="attr-panel"]')].some((e) => e.getClientRects().length > 0))), "a tap during the blink: the sheet stays shut");
  }

  // reduce motion (as the runner has it for every other spec): no blink, the sheet (phone) at once
  await p.emulateMedia({ reducedMotion: "reduce" });
  await open(); // a new measurement: its own gutter
  await drawRun(2);
  const q = await put(0.5);
  await count("downspout", phone ? 3 : 2);
  h.expect(q.flips.length <= 2, `reduce motion: no blink (changes at ${q.flips.map(Math.round)} ms)`);
  if (phone) h.expect(q.sheet !== null && q.sheet < 400, `reduce motion: the sheet at once (at ${q.sheet} ms)`);
  await closeSheet();
};
