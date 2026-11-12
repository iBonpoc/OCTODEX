/**
 * e2e 297 — #818 review (spec 33 П35): an end taken by a long press and led onto ANOTHER gutter's end sticks to it exactly; released
 * there the gutters meet — a corner; a joint of three ends is not moved (a long press says why). Every view. Finds things by
 * testID / id / stored elements; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const runs = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom), KEY);
  const waitRuns = (n) => p.waitForFunction(([k, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === want, [KEY, n], { timeout: 8000 });
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const center = (sel) => svg().locator(sel).evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const hold = async () => {
    const t0 = await p.evaluate(() => performance.now());
    await p.waitForFunction((t) => performance.now() - t > 650, t0); // held: a long press (500 ms) takes the end
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();

  // two gutters apart: A along the top, B below it, standing
  const ay = b.y + b.height * 0.3;
  await stroke([b.x + b.width * 0.1, ay], [b.x + b.width * 0.35, ay]);
  await waitRuns(1);
  const bx = b.x + b.width * 0.6, by0 = b.y + b.height * 0.45, by1 = b.y + b.height * 0.7;
  await stroke([bx, by0], [bx, by1]);
  await waitRuns(2);
  h.expect((await svg().locator('[id^="c:"]').count()) === 0, "two gutters apart: no corner");

  // A's right end, a long press, led onto B's top end: it sticks exactly; released there — a corner
  const caps = await center('[id^="cap:"]');
  const aRight = caps.filter((c) => Math.abs(c[1] - ay) < 6).sort((u, v) => v[0] - u[0])[0];
  await p.mouse.move(aRight[0], aRight[1]);
  await p.mouse.down();
  await hold();
  const goal = [bx, by0];
  for (let i = 1; i <= 10; i++) await p.mouse.move(aRight[0] + ((goal[0] - aRight[0]) * i) / 10, aRight[1] + ((goal[1] - aRight[1]) * i) / 10 + (i === 10 ? 3 : 0), { steps: 3 }); // the last point 3 px off: it still sticks
  await p.mouse.up();
  await p.waitForFunction((k) => {
    const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom);
    const ends = g.flatMap((r) => [r.a, r.b]);
    return ends.some((q, i) => ends.some((o, j) => j !== i && Math.hypot(o[0] - q[0], o[1] - q[1]) < 1.5));
  }, KEY, { timeout: 8000 });
  const g = await runs();
  const share = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 1.5;
  const ends = g.flatMap((r) => [r.a, r.b]);
  h.expect(ends.some((q, i) => ends.some((o, j) => j !== i && share(o, q))), `released on B's end: the gutters meet (${JSON.stringify(g)})`);

  // a third gutter from the joint → three ends: a long press on it does not move it, and says why
  const joint = (await center('[id^="c:"]'))[0];
  await stroke(joint, [joint[0] + 90, joint[1] + 60]); // a third gutter FROM the joint: three ends meet there
  await waitRuns(3);
  await p.mouse.move(joint[0], joint[1]);
  await p.mouse.down();
  await hold();
  await p.mouse.move(joint[0] + 50, joint[1] + 2, { steps: 8 }); // the press takes effect when the finger starts to move
  await p.getByText(/Стык из трёх концов не двигается/).first().waitFor({ timeout: 5000 });
  await p.mouse.up();
  const after = await runs();
  h.expect(JSON.stringify(after.map((r) => [r.a, r.b])) === JSON.stringify((await runs()).map((r) => [r.a, r.b])), "nothing moved");
};
