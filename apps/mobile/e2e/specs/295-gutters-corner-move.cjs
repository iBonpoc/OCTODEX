/**
 * e2e 295 — #818 (spec 33 П35, founder 12.11: «оттягивать угол»): a corner taken by a long press (with the «Желоб» tool, the
 * default) and moved: the joint follows the finger, both far ends stand, a side near its axis is held there, the chip says the
 * angle; «Назад» puts everything back. Every view. Finds things by testID / id; waits on what it checks (no pauses).
 */
const { skipLength, pressWhenStill } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const runs = async () => (await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom), KEY));
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  await stroke([b.x + b.width * 0.1, y], [b.x + b.width * 0.4, y]);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="cap:"]').length === 2, null, { timeout: 8000 });
  const caps = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const right = caps.sort((a, c) => c[0] - a[0])[0];
  await stroke(right, [right[0], right[1] + 110]); // down: a corner
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="c:"]').length === 1, null, { timeout: 8000 });
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run").length === 2, KEY, { timeout: 8000 });
  // the angle is marked with an arc across it (as in a geometry drawing); a picked gutter's joint has the ring
  h.expect((await svg().locator('[id^="arc-c:"]').count()) === 1, "the arc of the angle is drawn");
  h.expect((await svg().locator('[id^="handle-c:"]').count()) === 1, "the picked gutter's joint has a ring");
  const before = await runs();
  const corner = await svg().locator('[id^="c:"]').first().evaluate((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const same = (u, v) => Math.abs(u[0] - v[0]) < 1.5 && Math.abs(u[1] - v[1]) < 1.5;
  const pts = (g) => g.flatMap((q) => [q.a, q.b]);
  const joint = (g) => pts(g).find((q, i, all) => all.some((o, j) => j !== i && same(o, q)));
  const farOf = (g) => pts(g).filter((q) => !same(q, joint(g)));

  // the «Желоб» tool, a long press on the corner, then the finger goes 120 px to the right: the joint follows
  await p.mouse.move(corner[0], corner[1]);
  await p.mouse.down();
  const t0 = await p.evaluate(() => performance.now());
  await p.waitForFunction((t) => performance.now() - t > 450, t0); // held: a long press takes the corner
  for (let i = 1; i <= 10; i++) await p.mouse.move(corner[0] + (120 * i) / 10, corner[1], { steps: 3 });
  await tid("draw-swing-chip").waitFor({ timeout: 5000 });
  h.expect(/°$/.test((await tid("draw-swing-chip").innerText()).trim()), "the chip says the angle: " + (await tid("draw-swing-chip").innerText()));
  await p.mouse.up();
  await p.waitForFunction(() => !document.querySelector('[data-testid="draw-swing-chip"]'), null, { timeout: 5000 });
  // the stored joint has moved: some point is shared by both gutters, and it is not the old one
  await p.waitForFunction(([k, jx, jy]) => { const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom); if (g.length !== 2) return false; const sh = [g[0].a, g[0].b].find((u) => [g[1].a, g[1].b].some((v) => Math.abs(u[0] - v[0]) < 1.5 && Math.abs(u[1] - v[1]) < 1.5)); return !!sh && (Math.abs(sh[0] - jx) > 1.5 || Math.abs(sh[1] - jy) > 1.5); }, [KEY, ...joint(before)], { timeout: 8000 });
  const after = await runs();
  // the shared point: the one both gutters have; the far ends stand
  const f0 = farOf(before), f1 = farOf(after);
  h.expect(f0.length === 2 && f1.length === 2 && f0.every((q) => f1.some((o) => same(o, q))), `both far ends stand (${JSON.stringify(f0)} → ${JSON.stringify(f1)})`);
  h.expect(!same(joint(before), joint(after)) && joint(after)[0] > joint(before)[0] + 5, `the joint followed the finger (${JSON.stringify(joint(before))} → ${JSON.stringify(joint(after))})`);
  h.expect((await svg().locator('[id^="c:"]').count()) === 1, "still one corner");
  await h.shot("moved");

  // «Назад»: one step puts the joint back
  await pressWhenStill(tid("draw-undo").getByRole("button"));
  await p.waitForFunction(([k, jx, jy]) => { const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom); return g.length === 2 && g.every((q) => [q.a, q.b].some((v) => Math.abs(v[0] - jx) < 1.5 && Math.abs(v[1] - jy) < 1.5)); }, [KEY, ...joint(before)], { timeout: 8000 });

  // the downspout tool: a plain drag from the corner (no hold, nothing to pick first) takes it — «Водосток» has no other use for it
  await tid("draw-tool-ds").getByRole("button").click();
  const corner2 = await svg().locator('[id^="c:"]').first().evaluate((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.move(corner2[0], corner2[1]);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(corner2[0] + (120 * i) / 10, corner2[1], { steps: 3 });
  await p.mouse.up();
  await p.waitForFunction(([k, jx, jy]) => { const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom); if (g.length !== 2) return false; const sh = [g[0].a, g[0].b].find((u) => [g[1].a, g[1].b].some((v) => Math.abs(u[0] - v[0]) < 1.5 && Math.abs(u[1] - v[1]) < 1.5)); return !!sh && (Math.abs(sh[0] - jx) > 1.5 || Math.abs(sh[1] - jy) > 1.5); }, [KEY, ...joint(before)], { timeout: 8000 });
  const dsN = await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "downspout" && !e.deletedAt).length, KEY);
  h.expect(dsN === 0, `the lift of the drag put no downspout (${dsN})`);
  await pressWhenStill(tid("draw-undo").getByRole("button")); // back, for the next step

  // «Желоб» without a hold: drawing from the corner goes on as always — a third gutter, the corner is not taken
  await tid("draw-tool-line").getByRole("button").click();
  const corner3 = await svg().locator('[id^="c:"]').first().evaluate((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await stroke(corner3, [corner3[0] + 80, corner3[1] + 80]);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 3, KEY, { timeout: 8000 });
};
