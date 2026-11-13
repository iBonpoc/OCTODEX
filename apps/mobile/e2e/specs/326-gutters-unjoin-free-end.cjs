/**
 * e2e 326 — #1282 (founder 12.11: «нажал "разъединить", заглушка не двигается, прилипла к углу»): three gutters meet in a
 * point; «Разъединить угол» frees a pair — each freed end is set back along its gutter, off the joint, so it can be taken and
 * pulled; the toast «Отменить» puts everything back (the points, the marks). Every view. Finds things by testID / id;
 * waits on what it checks (no pauses).
 */
const { skipLength, canvasAt } = require("../gutters.cjs");
const { sheetGone } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const rows = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => ({ id: e.id, a: e.geom.a, b: e.geom.b, open: !!e.attrs.openEnds })).sort((u, v) => (u.id < v.id ? -1 : 1)), KEY);
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const waitRuns = (n) => p.waitForFunction(([k, n]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === n, [KEY, n], { timeout: 8000 });
  const same = (u, v) => Math.abs(u[0] - v[0]) < 1.5 && Math.abs(u[1] - v[1]) < 1.5;

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.45;
  await stroke([b.x + b.width * 0.1, y], [b.x + b.width * 0.4, y]);
  await waitRuns(1);
  const caps = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const right = caps.sort((a, c) => c[0] - a[0])[0];
  await stroke(right, [right[0], right[1] + 90]); // down: a corner
  await waitRuns(2);
  await stroke(right, [right[0], right[1] - 90]); // up from the same point: a third end at the joint
  await waitRuns(3);
  const before = await rows();
  await h.shot("three");

  // the corner's sheet → «Разъединить угол»
  const k = await svg().locator('[id^="c:"]').first().boundingBox();
  await canvasAt(p, k.x + k.width / 2, k.y + k.height / 2);
  await p.mouse.click(k.x + k.width / 2, k.y + k.height / 2);
  await tid("corner-sheet").waitFor({ timeout: 5000 });
  await tid("corner-split").getByRole("button").click();
  await tid("corner-sheet").waitFor({ state: "detached", timeout: 5000 });
  await sheetGone(p);
  await p.waitForFunction(([k]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).filter((e) => e.attrs.openEnds).length === 2, [KEY], { timeout: 5000 });
  const after = await rows();
  // the freed ends are off the joint: no gutter's end of the two freed ones lies where the third still has its end
  const moved = after.filter((r, i) => !same(r.a, before[i].a) || !same(r.b, before[i].b));
  h.expect(moved.length === 2 && moved.every((r) => r.open), `both freed ends were set back (${moved.length} moved)`);
  const joint = before.flatMap((r) => [r.a, r.b]).find((q, i, all) => all.filter((o) => same(o, q)).length === 3);
  const freed = moved.flatMap((r) => [r.a, r.b]).filter((q) => !before.some((o) => same(o.a, q) || same(o.b, q)));
  h.expect(freed.length === 2 && freed.every((q) => !same(q, joint)), "the freed ends are not at the joint any more");
  await h.shot("split");

  // «Отменить» in the toast puts the points and the marks back
  await h.click("Отменить");
  await p.waitForFunction(([k, b0]) => { const g = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt); return g.length === 3 && g.every((e) => !e.attrs.openEnds) && g.every((e) => { const o = b0.find((x) => x.id === e.id); return o && Math.abs(o.a[0] - e.geom.a[0]) < 1.5 && Math.abs(o.b[0] - e.geom.b[0]) < 1.5; }); }, [KEY, before], { timeout: 8000 });
  h.expect((await rows()).every((r) => !r.open), "«Отменить»: the marks are gone, the corner is back");
};
