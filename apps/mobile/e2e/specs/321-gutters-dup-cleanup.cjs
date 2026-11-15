/**
 * e2e 321 — #1314 review: an old drawing that has a gutter lying on another (#1256) is cleaned ONCE when it is opened: the extra
 * gutter goes, a toast says so with «Отменить», the saved rows follow (one live gutter of the pair), and the corner stays one.
 * Every view. Finds things by testID / the stored rows; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const live = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length, KEY);
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
  const y = b.y + b.height * 0.4;
  await stroke([b.x + b.width * 0.1, y], [b.x + b.width * 0.4, y]);
  await p.waitForFunction(([k]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run").length === 1, [KEY], { timeout: 8000 });
  // an old drawing: a second row lying exactly on the gutter (written into the phone's copy of the data, as an older version left it)
  const state = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const g = state.db.moduleData.gutters;
  const r = g.elements.find((e) => e.kind === "run");
  g.elements.push({ ...r, id: r.id + "-dup", geom: { ...r.geom }, attrs: { ...r.attrs } });
  const mid = r.measurementId;
  await h.seed(KEY, state);
  h.expect((await live()) === 2, "the old drawing has two rows on one line");
  await h.go(`/module/gutters/draw?m=${mid}`);
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await h.expectText(/Убран лишний желоб/, "the toast says an extra gutter was removed");
  await p.waitForFunction(([k]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 1, [KEY], { timeout: 8000 });
  h.expect((await live()) === 1, "one live gutter is left in the saved rows");
  await h.shot("cleaned");
};
