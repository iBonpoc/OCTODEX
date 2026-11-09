/**
 * e2e 219 — живая длина штриха рядом с линией (основатель 09.11, #689: «размер пишется вверху, в левом углу, и
 * накладывается на надпись "примерно — не для резки"»). Every view.
 * - while a gutter is drawn (the finger still down) its length stands beside the line: the chip's centre is near the
 *   stroke's middle, off the line (it does not cover it), below the top bar and not over «Примерно — не для резки»;
 * - level and slanted strokes; the finger let go → the live chip is gone (the run's own label stays).
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const chipBox = async () => {
    const l = p.getByTestId("draw-ghost-len");
    if ((await l.count()) === 0) return null;
    const b = await l.first().boundingBox();
    return b && b.width > 0 ? b : null;
  };
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const s = await p.getByTestId("draw-surface").boundingBox();
  const acc = await tid("draw-accuracy").first().boundingBox();

  /** a stroke from a to b, the finger kept down; checks the chip; lets go */
  const strokeAndCheck = async (a, b, what) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    let box = null;
    await waitFor(async () => (box = await chipBox()) !== null, `${what}: the live length is shown`);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // distance of the chip's centre from the stroke's line
    const off = Math.abs((b[0] - a[0]) * (a[1] - cy) - (a[0] - cx) * (b[1] - a[1])) / len;
    h.expect(Math.hypot(cx - mx, cy - my) < box.width + box.height, `${what}: the chip is at the middle of the line (${Math.round(cx)},${Math.round(cy)} vs ${Math.round(mx)},${Math.round(my)})`);
    h.expect(off >= box.height / 2, `${what}: the chip is beside the line, not on it (${Math.round(off)})`);
    if (acc) h.expect(!overlap(box, acc), `${what}: not over «Примерно — не для резки»`);
    await p.mouse.up();
    await skipLength(p);
    await waitFor(async () => (await chipBox()) === null, `${what}: the finger let go — the live chip is gone`);
  };

  const y = s.y + s.height * 0.55;
  await strokeAndCheck([s.x + s.width * 0.15, y], [s.x + s.width * 0.6, y], "level");
  await h.shot("level");
  await strokeAndCheck([s.x + s.width * 0.2, s.y + s.height * 0.45], [s.x + s.width * 0.6, s.y + s.height * 0.3], "slanted");
};
