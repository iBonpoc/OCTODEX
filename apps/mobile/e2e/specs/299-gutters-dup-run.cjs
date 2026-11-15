/**
 * e2e 299 — #1256 (К1): a line drawn with «Желоб» over a gutter from one of its ends to the other makes no second gutter lying on it
 * (the material and the corners were counted twice): the drawing keeps ONE gutter, a toast says why. Every view. Finds things by
 * testID and stored elements; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const runs = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length, KEY);
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const center = (sel) => svg().locator(sel).evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  await stroke([b.x + b.width * 0.15, y], [b.x + b.width * 0.6, y]);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 1, KEY, { timeout: 8000 });
  const caps = (await center('[id^="cap:"]')).sort((u, v) => u[0] - v[0]);
  const left = caps[0], right = caps[caps.length - 1];

  // nothing picked (the picked gutter's ring would pull its end — #504): a tap on the empty canvas
  await p.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.2);
  await p.waitForFunction(() => !document.querySelector('[data-testid="draw-svg"] [id^="halo"]'), null, { timeout: 5000 });
  // from the left end to the right end ALONG the gutter, with «Желоб»: the same two ends — no second gutter, a toast says why
  await tid("draw-tool-line").getByRole("button").click();
  await p.mouse.move(left[0], left[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(left[0] + ((right[0] - left[0]) * i) / 12, left[1] + ((right[1] - left[1]) * i) / 12);
  await p.mouse.up();
  // (the toast has no testID of its own on this branch: its words)
  await p.getByText(/Такой желоб уже есть/).first().waitFor({ timeout: 5000 });
  h.expect((await runs()) === 1, `no second gutter on the first (${await runs()} stored)`);
  h.expect((await tid("quick-length").count()) === 0, "no length sheet of a new gutter");
};
