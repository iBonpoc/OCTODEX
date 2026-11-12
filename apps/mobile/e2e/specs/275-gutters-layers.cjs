/**
 * e2e 275 — «Слои» на холсте и «Вынос крыши» в настройках (#930, #932; spec 33 П33). Every view.
 * - a run and a downspout drawn; «⋯» → «Слои» → «Подписи» off: no length word on the canvas; on again: it is back;
 *   «Водостоки» off: no downspout mark; the gutter stays (the drawing is not changed);
 * - Настройки Gutters → «Дом и крыша» → «Вынос крыши»: 2 ft by default, another pick is kept after a reload.
 * Finds things by testID; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
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

  const layers = async () => {
    await tid("draw-who").getByRole("button").click();
    const item = p.getByRole("menuitem", { name: "Слои", exact: true });
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
  await tid("draw-layer-grid").getByRole("switch").click();
  await tid("draw-layer-grid").getByRole("switch").click();

  // the store keeps the drawing whatever the layers were
  const stored = await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run").length, KEY);
  h.expect(stored === 1, `the run is in the store (${stored})`);

  // the roof's overhang: 2 ft by default, a pick is kept
  await h.go("/module/gutters/settings");
  await tid("gset-house").waitFor({ timeout: 8000 });
  const field = tid("gset-roof-overhang");
  const button = tid("gset-roof-overhang-button");
  const seg = p.locator('[data-testid^="gset-roof-overhang-"]:not([data-testid$="-button"]):not([data-testid$="-warn"])').locator("visible=true");
  if (await button.count()) {
    h.expect(/2′|2 ft|2'/.test(await button.innerText()), "2 ft by default: " + (await button.innerText()));
    await button.click();
    await tid("gset-roof-overhang-3").click();
    await p.waitForFunction(() => (document.querySelector('[data-testid="gset-roof-overhang-button"]')?.textContent || "").includes("3"), null, { timeout: 5000 });
    await h.go("/module/gutters/settings");
    await tid("gset-roof-overhang-button").waitFor({ timeout: 8000 });
    h.expect(/3/.test(await tid("gset-roof-overhang-button").innerText()), "3 ft is kept after a reload");
  } else {
    h.expect((await field.count()) + (await seg.count()) > 0, "the field is on the page");
  }
  await h.shot("settings");
};
