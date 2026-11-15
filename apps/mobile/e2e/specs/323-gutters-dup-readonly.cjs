/**
 * e2e 323 — #1314 review (director 13.11): a measurement that is READ ONLY (the trial is over) has an old duplicate too — the screen shows it
 * cleaned, but nothing is written and NO toast «Убран лишний желоб» comes (it would at every opening).
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
  state.db.company.modules.gutters.trialEndsAt = new Date(Date.now() - 86_400_000).toISOString(); // past the trial: read only
  await h.seed(KEY, state);
  h.expect((await live()) === 2, "the old drawing has two rows on one line");
  await h.go(`/module/gutters/draw?m=${mid}`);
  await tid("draw-not-saved").waitFor({ timeout: 8000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="cap:"]').length === 2, null, { timeout: 8000 });
  h.expect((await p.getByText(/Убран лишний желоб/).count()) === 0, "read only: no toast «Убран лишний желоб»");
  h.expect((await live()) === 2, "read only: nothing is written — both rows are still stored");
  await h.shot("read-only");
};
