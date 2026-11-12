/**
 * e2e 296 — #1246 (spec 33-gutters-ds-auto А1–А3, founder 12.11: «на каждом водостоке по-любому должен быть даунспот»): a downspout
 * stands on a new gutter by itself, 12″ from the end it was finished at; a gutter that goes on from its end (a corner) is the same
 * chain — still one; a separate gutter has its own; one taken off by hand is not put back. Every view. Finds things by testID /
 * stored elements; waits on what it checks (no pauses).
 */
const { skipLength, closeDsMenu } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.autoDs = true; // this spec is about them (the runner switches them off for the others)

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt).map((e) => ({ id: e.id, kind: e.kind, geom: e.geom, attrs: e.attrs })), KEY);
  const dsOf = async () => (await els()).filter((e) => e.kind === "downspout");
  const runsOf = async () => (await els()).filter((e) => e.kind === "run");
  const waitDs = (n, what) => p.waitForFunction(([k, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "downspout").length === want, [KEY, n], { timeout: 8000 }).catch(async () => h.expect(false, `${what}: ${JSON.stringify((await dsOf()).map((s) => s.geom))}`));
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

  // one gutter → one downspout by itself, 12″ from the end the line was finished at (b), marked "auto"
  const y = b.y + b.height * 0.3;
  await stroke([b.x + b.width * 0.1, y], [b.x + b.width * 0.5, y]);
  await waitDs(1, "a new gutter has a downspout by itself");
  const r1 = (await runsOf())[0];
  const L1 = Math.round(Math.hypot(r1.geom.b[0] - r1.geom.a[0], r1.geom.b[1] - r1.geom.a[1]));
  const d1 = (await dsOf())[0];
  h.expect(d1.attrs.auto === true, "it is marked auto");
  h.expect(d1.geom.runId === r1.id && Math.abs(d1.geom.atIn - (L1 - 12)) <= 2, `12″ from the end it was finished at (${d1.geom.atIn} of ${L1})`);
  h.expect((await svg().locator("circle").count()) >= 1, "the downspout is on the drawing");

  // a gutter that goes on from its end (a corner) is the same chain: still one downspout
  const caps = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const right = caps.sort((u, v) => v[0] - u[0])[0];
  await stroke(right, [right[0], right[1] + 120]);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 2, KEY, { timeout: 8000 });
  await p.waitForTimeout(0);
  h.expect((await dsOf()).length === 1, `a corner of two gutters has ONE downspout (${(await dsOf()).length})`);

  // a separate gutter has its own
  const y3 = b.y + b.height * 0.78;
  await stroke([b.x + b.width * 0.1, y3], [b.x + b.width * 0.45, y3]);
  await waitDs(2, "a separate gutter has its own downspout");
  const runs = await runsOf();
  const third = runs.find((r) => r.id !== r1.id && Math.abs(r.geom.a[1] - r.geom.b[1]) < 3 && r.geom.a[1] !== r1.geom.a[1]);
  const own = (await dsOf()).filter((s) => s.geom.runId === third.id);
  h.expect(own.length === 1 && own[0].attrs.auto === true, "the separate gutter's downspout is its own");
  await h.shot("auto");

  // taken off by hand: it is not put back (not by the next change either)
  await closeDsMenu(p);
  await tid("draw-tool-line").getByRole("button").click();
  const circles = await svg().locator("circle").evaluateAll((cs) => cs.map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const target = circles.sort((u, v) => v[1] - u[1])[0]; // the lowest: the third gutter's
  await p.mouse.click(target[0], target[1]);
  await tid("draw-delete").getByRole("button").click();
  await waitDs(1, "the downspout is taken off");
  await p.getByRole("button", { name: /Отменить/ }).locator("visible=true").last().waitFor({ timeout: 3000 }); // the toast: it is undoable
  await stroke([b.x + b.width * 0.55, y3], [b.x + b.width * 0.8, y3 - 4]); // another change on the same row
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length >= 4, KEY, { timeout: 8000 });
  const after = await dsOf();
  h.expect(!after.some((s) => s.geom.runId === third.id), "the downspout taken off by hand is not put back on its gutter");
};
