/**
 * e2e 291 — «Слои» на холсте и «Вынос крыши» в настройках (#930, #932; spec 33 П33). Every view.
 * - a run and a downspout drawn (the grid too); «⋯» → «Слои» → «Подписи» off: no length word on the canvas; on again: it is back;
 *   «Водостоки» off: no downspout mark; the gutter stays (the drawing is not changed);
 * - Настройки Gutters → «Дом и крыша» → «Вынос крыши»: 2 ft by default, another pick is kept after a reload.
 * Finds things by testID; waits on what it checks (no pauses).
 */
const { openProps, skipLength, sheetGone } = require("../gutters.cjs");
const { pressEscUntilClosed } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const words = () => svg().locator("text").evaluateAll((ts) => ts.map((t) => t.textContent || "").filter((s) => /′|″/.test(s)));

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await p.mouse.move(b.x + b.width * 0.1, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.1 + (0.35 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] text').length >= 1, null, { timeout: 8000 });
  h.expect((await words()).length >= 1, "a length word is on the canvas");
  // a downspout on the run (the downspout tool, a tap on the run): its mark is a circle
  const run0 = await svg().locator("line:not([id^=halo])").first().evaluate((l) => { const r = l.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(run0[0], run0[1]);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] circle').length >= 1, null, { timeout: 5000 });
  if (!wide) {
    await pressEscUntilClosed(p); // its menu is a sheet on the phone, the side panel on a wide screen
    await sheetGone(p);
  }
  const dsCount = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "downspout" && !e.deletedAt).length, KEY);
  await p.waitForFunction(([k]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => e.kind === "downspout" && !e.deletedAt), [KEY], { timeout: 8000 });
  h.expect((await dsCount()) === 1, "one downspout is in the store");

  const layers = async () => {
    await tid("draw-who").getByRole("button").click();
    const item = p.getByRole("menuitem", { name: "Слои…", exact: true });
    await item.waitFor({ timeout: 4000 });
    await item.click();
    await tid("draw-layers").waitFor({ timeout: 5000 });
  };
  await layers();
  await tid("draw-layer-labels").getByRole("switch").click();
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="draw-svg"] text')].some((t) => /′|″/.test(t.textContent || "")), null, { timeout: 5000 });
  h.expect((await svg().locator("line:not([id^=halo])").count()) === 1, "the gutter stays when the labels are hidden");
  await tid("draw-layer-labels").getByRole("switch").click();
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="draw-svg"] text')].some((t) => /′|″/.test(t.textContent || "")), null, { timeout: 5000 });
  h.expect(true, "the labels are back");
  // the grid: its paths go and come back
  h.expect((await p.getByTestId("draw-grid").locator("#grid-minor").count()) === 1, "the grid is drawn");
  await tid("draw-layer-grid").getByRole("switch").click();
  await p.waitForFunction(() => !document.querySelector('[data-testid="draw-grid"] #grid-minor'), null, { timeout: 5000 });
  await tid("draw-layer-grid").getByRole("switch").click();
  await p.waitForFunction(() => !!document.querySelector('[data-testid="draw-grid"] #grid-minor'), null, { timeout: 5000 });
  // the downspouts: the mark goes, the downspout stays in the store; a touch on its place picks the gutter, not the hidden one
  await tid("draw-layer-ds").getByRole("switch").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] circle').length === 0, null, { timeout: 5000 });
  h.expect((await dsCount()) === 1, "the downspout is still in the store (hidden, not deleted)");
  await pressEscUntilClosed(p);
  await sheetGone(p);
  h.expect((await p.getByTestId("draw-tool-line").count()) === 1, "the toolbar is there");
  await tid("draw-tool-line").getByRole("button").click();
  await p.mouse.click(run0[0], run0[1]);
  if (!wide) await openProps(p);
  await tid("attr-panel").waitFor({ timeout: 5000 });
  h.expect((await tid("attr-ds-size").count()) === 0 && (await tid("attr-size").count()) === 1, "a touch on the hidden downspout's place picks the gutter (its properties), not the downspout");
  h.expect((await dsCount()) === 1, "nothing changed in the store");
  // «Водосток» brings the layer back
  if (!wide) await pressEscUntilClosed(p);
  await sheetGone(p).catch(() => {});
  await tid("draw-tool-ds").getByRole("button").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] circle').length >= 1, null, { timeout: 5000 });
  h.expect(true, "the downspout tool shows the downspouts again");

  // the store keeps the drawing whatever the layers were
  const stored = await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run").length, KEY);
  h.expect(stored === 1, `the run is in the store (${stored})`);

  // the roof's overhang: 2 ft by default, a pick is kept
  await h.go("/module/gutters/settings");
  await tid("gset-house").waitFor({ timeout: 8000 });
  const button = tid("gset-roof-overhang-button");
  await button.waitFor({ timeout: 5000 });
  h.expect(/(^|\s)2′/.test(await button.innerText()), "2 ft by default: " + (await button.innerText()));
  await button.click();
  await tid("gset-roof-overhang-3").click();
  await p.waitForFunction(() => /3′/.test(document.querySelector('[data-testid="gset-roof-overhang-button"]')?.textContent || ""), null, { timeout: 5000 });
  await h.go("/module/gutters/settings");
  await tid("gset-roof-overhang-button").waitFor({ timeout: 8000 });
  h.expect(/3′/.test(await tid("gset-roof-overhang-button").innerText()), "3 ft is kept after a reload");
  await h.shot("settings");
};
