/**
 * e2e 224 — «чертёж как на бумаге» (основатель 10.11, #739; docs/specs/33-gutters-workflow.md П24.8). Every view.
 * - «Готово» → «Просмотр замера»: the drawing is a sheet — white paper in both themes, the gutters' numbers, every
 *   length on a dimension line, «D1», the corner with its angle, the title block with the accuracy note (1–3″, the crew re-measures), «примерно» and the scale;
 * - none of the canvas's own marks («R», the fittings code) on the sheet;
 * - the sheet is the same in the client's PDF.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, closeDsMenu, openView, pressWhenStill } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const runsCount = () => p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count();

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  const x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await stroke([x0, y], [x1, y]);
  await waitFor(async () => (await runsCount()) === 1, "one run");
  await stroke([x1 + 4, y + 3], [x1 + 4, y + b.height * 0.2]);
  await waitFor(async () => (await runsCount()) === 2, "two runs — a corner");
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click((x0 + x1) / 2, y + 3);
  await closeDsMenu(p);
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("circle").count()) >= 1, "a downspout");
  await tid("draw-done").waitFor({ timeout: 8000 });
  await openView(p);

  const sheet = tid("view-svg");
  await sheet.waitFor({ timeout: 5000 });
  const bg = await sheet.evaluate((el) => getComputedStyle(el).backgroundColor);
  h.expect(bg === "rgb(255, 255, 255)", `white paper in the ${h.layout?.theme ?? ""} theme (${bg})`);
  const words = (await sheet.locator("text").allTextContents()).map((s) => s.trim());
  h.expect(words.includes("1") && words.includes("2"), `the gutters' numbers (${words.join(" | ")})`);
  h.expect(words.filter((w) => /′|″/.test(w)).length >= 2, "every gutter's length");
  h.expect(words.includes("D1"), "the downspout «D1»");
  h.expect(words.some((w) => /^(наруж\.|внутр\.) \d+°$/.test(w)), "the corner with its angle");
  h.expect(words.some((w) => /^Масштаб: /.test(w)), "the scale in the title block");
  h.expect(words.some((w) => w === "Примерно"), "«примерно» in the title block");
  h.expect(words.some((w) => /точностью 1–3″, бригада перемеряет/.test(w)), "the one accuracy note in the title block (#768)");
  h.expect(!words.includes("R") && !words.some((w) => /^[AB]+O?\d*$/.test(w)), "none of the canvas's own marks");
  // a dimension line by every gutter: two grey extension lines each
  const ext = await sheet.locator('line[stroke-width="1"]').count();
  h.expect(ext >= 4, `extension and dimension lines (${ext})`);
  await h.shot("sheet");

  // the same sheet in the client's PDF (the web prints from a hidden frame: read the new frame)
  await p.evaluate(() => {
    for (const f of document.querySelectorAll("iframe")) f.dataset.seen = "1";
    const add = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      const r = add(el);
      if (el.tagName === "IFRAME") el.contentWindow.print = () => {};
      return r;
    };
  });
  await pressWhenStill(tid("view-pdf-client").getByRole("button"));
  await p.waitForFunction(() => [...document.querySelectorAll("iframe:not([data-seen])")].some((x) => x.contentDocument?.body?.innerHTML.includes("<svg")), null, { timeout: 8000 });
  const pdf = await p.evaluate(() => [...document.querySelectorAll("iframe:not([data-seen])")].find((x) => x.contentDocument?.body?.innerHTML.includes("<svg")).contentDocument.documentElement.outerHTML);
  h.expect(/Scale: /.test(pdf) && />D1</.test(pdf), "the client's PDF carries the sheet (in the client's language: en)");
};
