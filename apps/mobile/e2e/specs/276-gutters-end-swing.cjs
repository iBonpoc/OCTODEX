/**
 * e2e 276 — #818 (founder 12.11: «заглушка свободно перемещалась и прилипала под 90°»). Every view.
 * A picked gutter's free end handle: pulled along — only the length (e2e 251); pulled sideways past the threshold — the end
 * follows the finger, the other end stays; near a right angle it is held there and the chip says «90°»; «Назад» puts it back.
 * Finds things by testID / id; waits on what it checks (no pauses).
 */
const { skipLength, pressWhenStill } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const geom = async () => (await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom), KEY))[0];
  const capAt = async (i) => {
    const caps = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
    return caps.sort((a, c) => a[0] - c[0])[i];
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  await p.mouse.move(b.x + b.width * 0.1, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.1 + (0.3 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="handle-cap:"]').length === 2, null, { timeout: 8000 });
  await tid("draw-tool-ds").getByRole("button").click(); // not «Желоб»: across it would be a new gutter (#504)
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => e.kind === "run" && !e.deletedAt), KEY, { timeout: 8000 });
  const g0 = await geom();
  h.expect(!!g0 && Math.abs(g0.b[1] - g0.a[1]) < 1, "a horizontal gutter, picked");

  // taken 18 px off the axis (a cap is taken within a finger's radius) and pulled ALONG: only the length changes, the angle stays
  const c18 = await capAt(1);
  await p.mouse.move(c18[0], c18[1] - 18);
  await p.mouse.down();
  const t0 = await p.evaluate(() => performance.now()); // held: a long press takes the cap (the touch is not a tap that puts a downspout)
  await p.waitForFunction((t) => performance.now() - t > 450, t0);
  for (let i = 1; i <= 8; i++) await p.mouse.move(c18[0] + (40 * i) / 8, c18[1] - 18, { steps: 3 });
  await p.mouse.up();
  await p.waitForFunction(([k, bx]) => { const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt)[0]?.geom; return !!g && g.b[0] > bx + 1; }, [KEY, g0.b[0]], { timeout: 8000 });
  const along = await geom();
  h.expect(Math.abs(along.b[1] - along.a[1]) < 1, `along from an off-axis touch: the angle stays (${JSON.stringify(along)})`);
  await pressWhenStill(tid("draw-undo").getByRole("button"));
  await p.waitForFunction(([k, bx]) => { const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt)[0]?.geom; return !!g && g.b[0] === bx; }, [KEY, g0.b[0]], { timeout: 8000 });

  // the right end taken and pulled to a point just under the left (standing) end: 90°, held there
  const c = await capAt(1);
  const left = await capAt(0); // the standing end: a right angle is straight above or below it
  await p.mouse.move(c[0], c[1]);
  await p.mouse.down();
  const t1 = await p.evaluate(() => performance.now());
  await p.waitForFunction((t) => performance.now() - t > 450, t1); // held (the gutter may not be picked after «Назад»)
  for (let i = 1; i <= 10; i++) await p.mouse.move(c[0] + ((left[0] + 2 - c[0]) * i) / 10, c[1] + (90 * i) / 10, { steps: 3 });
  const chip = tid("draw-swing-chip");
  await chip.waitFor({ timeout: 5000 });
  await p.waitForFunction(() => /^90°$/.test((document.querySelector('[data-testid="draw-swing-chip"]')?.textContent || "").trim()), null, { timeout: 5000 });
  h.expect(true, "the chip says 90° while the finger is down");
  await p.mouse.up();
  await p.waitForFunction(() => !document.querySelector('[data-testid="draw-swing-chip"]'), null, { timeout: 5000 });
  await p.waitForFunction((k) => { const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt)[0]?.geom; return !!g && Math.abs(g.b[0] - g.a[0]) < 1.5 && Math.abs(g.b[1] - g.a[1]) > 12; }, KEY, { timeout: 8000 });
  const g1 = await geom();
  h.expect(Math.abs(g1.b[0] - g1.a[0]) < 1.5 && Math.abs(g1.b[1] - g1.a[1]) > 12, `the end stands at a right angle to the old direction, held (the standing end's x) (${JSON.stringify(g1)})`);
  h.expect(g1.a[0] === g0.a[0] && g1.a[1] === g0.a[1], "the other end stays");

  // «Назад»: the end is back where it was
  await pressWhenStill(tid("draw-undo").getByRole("button"));
  await p.waitForFunction(([k, ax, ay, bx, by]) => {
    const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt)[0]?.geom;
    return !!g && g.a[0] === ax && g.a[1] === ay && g.b[0] === bx && g.b[1] === by;
  }, [KEY, g0.a[0], g0.a[1], g0.b[0], g0.b[1]], { timeout: 5000 });
  h.expect(true, "«Назад» puts the end back");
  await h.shot("swing");
};
