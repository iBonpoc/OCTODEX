/**
 * e2e 211 — модуль Gutters на английском и испанском (вопрос основателя 09.11 через руководителя; docs/specs/33-gutters-canvas.md
 * П20.19). Every view. In EN, then ES (the app's language switched and reloaded):
 * - the canvas, the length sheet, a gutter's properties, a downspout's menu, a corner's sheet, the module's settings and
 *   its prices — no Cyrillic on the screen (the demo has no Russian names on these screens).
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");

exports.init = { lang: "en" };

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  /** the lines of the screen that have Cyrillic in them */
  const cyr = () => p.evaluate(() => document.body.innerText.split("\n").filter((l) => /[А-Яа-яЁё]/.test(l)));
  const clean = async (where, lang) => {
    await p.waitForTimeout(250);
    const bad = await cyr();
    h.expect(bad.length === 0, `${lang} ${where}: no Cyrillic (${bad.slice(0, 3).join(" | ")})`);
  };
  const stroke = async (a, b, check) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    if (check) {
      await tid("quick-length").waitFor({ timeout: 5000 });
      await check();
    }
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  const scrim = () => p.getByRole("button", { name: /^(Закрыть|Close|Cerrar)$/ }).last().click({ position: { x: 10, y: 10 } });
  const closePanel = async () => {
    if (wide) await tid("draw-panel-close").getByRole("button").click();
    else await scrim();
    await waitFor(async () => (await tid("attr-panel").count()) === 0, "the panel is closed");
  };

  const pass = async (lang) => {
    await h.go("/module/gutters/draw");
    await tid("draw-surface").waitFor({ timeout: 8000 });
    await p.evaluate(() => localStorage.removeItem("octo.mod.gutters.toolbar.v1"));
    await clean("an empty canvas", lang);
    const b = await p.getByTestId("draw-surface").boundingBox();
    const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.4;
    const y0 = b.y + b.height * 0.25, y1 = b.y + b.height * 0.45;
    await stroke([x0, y0], [x1, y0], () => clean("the length sheet", lang));
    await stroke([x1, y0], [x1, y1]);
    await clean("the canvas with gutters and a corner", lang);

    // a gutter's properties
    await tid("draw-tool-line").getByRole("button").click();
    await p.mouse.click(x0 + (x1 - x0) * 0.3, y0);
    if (!wide) await tid("draw-props").getByRole("button").click();
    await tid("attr-panel").waitFor({ timeout: 5000 });
    if (await tid("attr-more").count()) await tid("attr-more").getByRole("button").click();
    await clean("a gutter's properties", lang);
    await closePanel();

    // a downspout's menu
    await tid("draw-tool-ds").getByRole("button").click();
    await p.mouse.click(x0 + (x1 - x0) * 0.6, y0 + 2);
    await tid("attr-panel").waitFor({ timeout: 5000 });
    if (await tid("attr-more").count()) await tid("attr-more").getByRole("button").click();
    await clean("a downspout's menu", lang);
    await closePanel();

    // a corner's sheet
    await tid("draw-tool-line").getByRole("button").click();
    const k = await svg().locator('[id^="c:"]').boundingBox();
    await p.mouse.click(k.x + k.width / 2, k.y + k.height / 2);
    await tid("corner-sheet").waitFor({ timeout: 5000 });
    await clean("a corner's sheet", lang);
    await scrim();

    // the module's settings and prices
    await h.go("/module/gutters/settings");
    await p.waitForTimeout(800);
    await clean("the module's settings", lang);
    await h.go("/module/gutters/prices");
    await p.waitForTimeout(800);
    await clean("the module's prices", lang);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => (await tid("module-gutters-enable").count()) === 0 || !/^(Off|Выкл)/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await pass("EN");
  await h.shot("en");

  await p.evaluate(() => localStorage.setItem("octo.lang.v1", JSON.stringify("es")));
  await p.reload();
  await pass("ES");
  await h.shot("es");
};
