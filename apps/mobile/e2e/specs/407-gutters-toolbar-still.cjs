/**
 * e2e 407 — #1630 (found by e2e 396, 15.11): a tap on the toolbar reached the canvas under it. The summary chip («Дальше: водостоки»,
 * what is picked) sat under the toolbar: it came and went, the toolbar jumped by a chip's height, and the second tap of a double tap
 * on «Водосток» landed on the gutter under it — a downspout and its sheet nobody asked for. Now the toolbar is the lowest, at the
 * very edge; the chip and the hints are above it. Here: the toolbar stays where it is while the chip comes and goes, and a gutter
 * right under the «Водосток» cell gets nothing from taps on the cell. Every view. Finds things by testID / stored elements.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt), KEY);
  const kinds = async () => (await els()).map((e) => e.kind).sort().join(",");
  const runs = (n, what) => p.waitForFunction(([k, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run").length === want, [KEY, n], { timeout: 8000 }).catch(() => h.expect(false, what));
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const box = async (id) => { const r = await tid(id).boundingBox(); return r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(","); };
  // the toolbar dragged by its grip to a side of the screen; back «bottom» (as e2e 144)
  const placeTo = async (k) => {
    const g = await tid("draw-grip").boundingBox();
    const vp = p.viewportSize();
    const to = { right: [vp.width - 6, vp.height / 2], bottom: [vp.width / 2, vp.height - 6] }[k];
    const a = [g.x + g.width / 2, g.y + g.height / 2];
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 15; i++) await p.mouse.move(a[0] + ((to[0] - a[0]) * i) / 15, a[1] + ((to[1] - a[1]) * i) / 15);
    await p.mouse.up();
    await p.waitForFunction((want) => { const t = [...document.querySelectorAll('[data-testid="draw-toolbar"]')].find((e) => e.offsetParent)?.getBoundingClientRect(); return !!t && (want === "right" ? t.height > t.width : t.width > t.height); }, k, { timeout: 5000 });
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const s = await p.getByTestId("draw-surface").boundingBox();
  const empty = [s.x + s.width * 0.5, s.y + s.height * 0.45];

  // the chip comes and goes: the toolbar does not move
  const still = await box("draw-toolbar");
  await stroke([s.x + s.width * 0.2, s.y + s.height * 0.25], [s.x + s.width * 0.55, s.y + s.height * 0.25]);
  await runs(1, "a gutter");
  await tid("draw-selected").waitFor({ timeout: 3000 });
  h.expect((await box("draw-toolbar")) === still, `the chip of what is picked came: the toolbar stays (${still} → ${await box("draw-toolbar")})`);
  await p.mouse.click(empty[0], empty[1]);
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="draw-selected"]')].some((e) => e.offsetParent), null, { timeout: 3000 });
  h.expect((await box("draw-toolbar")) === still, `nothing picked, «Дальше» in the chip: the toolbar stays (${still} → ${await box("draw-toolbar")})`);
  const sum = await tid("draw-summary").boundingBox();
  const bar = await tid("draw-toolbar").boundingBox();
  h.expect(!sum || sum.y + sum.height <= bar.y + 1, `the chip is above the toolbar, the toolbar at the edge (chip ${JSON.stringify(sum)}, toolbar ${JSON.stringify(bar)})`);
  await h.shot("chip-above");

  // a gutter right under the «Водосток» cell: the toolbar to the right side, the gutter drawn where the cell was, the toolbar back
  const cell = await tid("draw-tool-ds").boundingBox();
  const at = [cell.x + cell.width / 2, cell.y + cell.height / 2];
  await placeTo("right");
  const side = await tid("draw-toolbar").boundingBox();
  await stroke([s.x + 12, at[1]], [Math.min(side.x - 24, s.x + s.width * 0.6), at[1]]);
  await runs(2, "a second gutter, under the cell");
  await p.mouse.click(empty[0], empty[1]);
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="draw-selected"]')].some((e) => e.offsetParent), null, { timeout: 3000 });
  await placeTo("bottom");
  const back = await tid("draw-tool-ds").boundingBox();
  h.expect(Math.abs(back.y - cell.y) < 2 && Math.abs(back.x - cell.x) < 2, `the toolbar is back where it was (${JSON.stringify(cell)} → ${JSON.stringify(back)})`);
  h.expect(await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="draw-tool-ds"]'), at), "the «Водосток» cell is over the gutter");
  const before = await kinds();

  // one tap, then a double tap, then one more: the tool is on, the toolbar never moves, the gutter under the cell gets nothing
  for (const n of [1, 2, 1]) {
    for (let i = 0; i < n; i++) await p.mouse.click(at[0], at[1]);
    await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="draw-tool-ds"] [aria-selected="true"], [data-testid="draw-tool-ds"] [aria-pressed="true"], [data-testid="draw-tool-ds"] [aria-checked="true"]')].length > 0 || !!document.querySelector('[data-testid="draw-hint"]'), null, { timeout: 3000 });
    h.expect((await box("draw-toolbar")) === still, `after ${n} tap(s) on «Водосток» the toolbar stays (${still} → ${await box("draw-toolbar")})`);
    h.expect(await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="draw-tool-ds"]'), at), `after ${n} tap(s) the cell is still under the finger`);
  }
  h.expect((await kinds()) === before, `no downspout from taps on the toolbar (${before} → ${await kinds()})`);
  // a sentinel, so the check above is not read too early: a tap on the FIRST gutter puts its downspout — taps are handled in order,
  // so once it is there every tap on the cell was handled too; still one downspout, and on the first gutter
  const first = (await els()).find((e) => e.kind === "run"); // the one drawn first, high on the canvas
  const fb = await p.locator(`[id="face-${first.id}"]`).first().boundingBox();
  await p.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => !e.deletedAt && e.kind === "downspout"), KEY, { timeout: 5000 }).catch(() => h.expect(false, "the sentinel tap on the first gutter puts a downspout"));
  const dss = (await els()).filter((e) => e.kind === "downspout");
  h.expect(dss.length === 1 && dss[0].geom.runId === first.id, `one downspout, on the first gutter — none on the one under the toolbar (${JSON.stringify(dss.map((d) => d.geom.runId === first.id ? "first" : "under"))})`);
  await h.shot("taps-on-cell");
};
