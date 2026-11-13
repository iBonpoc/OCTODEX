/**
 * e2e 172 — длина рулеткой меняет линию, сетка, чистый лист в горизонтальном виде (просьба основателя 08.11;
 * docs/specs/33-gutters-canvas.md П20.13). Every view, then the same phone turned on its side (932 × 430).
 * - the canvas has a grid (minor and major lines);
 * - a gutter drawn, its length typed twice the drawn one → «Применить» → the line on the canvas is twice as long;
 * - turned on its side: no app menu, no side panel, no «Сохранено»/«Сделать заявкой» — the back button, the fit button,
 *   the toolbar and the drawing; a tap on a gutter opens its attributes in a sheet («Свойства»).
 * Finds things by testID / id; waits on what it checks.
 */
const { skipLength, canvasAt, openProps } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const runLine = () => svg().locator("line:not([id^=halo])").first().evaluate((l) => Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value));

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });

  // the grid
  await waitFor(async () => ((await svg().locator("#grid-minor").getAttribute("d")) || "").length > 0, "a grid: minor lines");
  h.expect(((await svg().locator("#grid-major").getAttribute("d")) || "").length > 0, "a grid: major lines");

  // a gutter, its length typed twice the drawn one → the line is twice as long on the canvas
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  const a0 = [b.x + b.width * 0.1, y];
  const a1 = [b.x + b.width * 0.3, y];
  await p.mouse.move(a0[0], a0[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a0[0] + ((a1[0] - a0[0]) * i) / 12, y);
  await p.mouse.up();
  await tid("quick-length").waitFor({ timeout: 5000 });
  const ftDrawn = Number(await tid("quick-length-ft").locator("input").inputValue());
  const px0 = await runLine();
  await tid("quick-length-ft").locator("input").fill(String(ftDrawn * 2));
  h.expect((await tid("quick-length-apply").innerText()).includes("Применить"), "the button says «Применить»");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "the sheet is gone");
  await waitFor(async () => {
    const px = await runLine();
    return px > px0 * 1.7 && px < px0 * 2.3;
  }, `the line is twice as long on the canvas (${px0} px before)`);
  await h.shot("scaled");

  // on its side: a clean sheet
  await p.setViewportSize({ width: 932, height: 430 });
  await tid("draw-surface").waitFor({ timeout: 5000 });
  await waitFor(async () => (await tid("side-nav").count()) === 0, "on its side: no app menu");
  h.expect((await tid("draw-panel").count()) === 0, "on its side: no side panel");
  // wait on it (rule 19): the header row goes with the layout's next render, not with the menu
  await waitFor(async () => (await tid("draw-local").count()) === 0 && (await tid("draw-to-lead").count()) === 0, "on its side: no «Сохранено» / «Сделать заявкой»");
  h.expect((await tid("draw-back").count()) === 1 && (await tid("draw-fit").count()) === 0 && (await tid("draw-toolbar").count()) === 1, "back and the toolbar stay; no «fit» in the header (#1273)");
  // «вписать»: a double tap on the empty place (the header has no button, a phone on its side has no «⋯»)
  const sb = await tid("draw-surface").boundingBox();
  await canvasAt(p, sb.x + sb.width * 0.9, sb.y + sb.height * 0.6);
  const pxBefore = await runLine();
  await p.mouse.click(sb.x + sb.width * 0.9, sb.y + sb.height * 0.6);
  await p.mouse.click(sb.x + sb.width * 0.9, sb.y + sb.height * 0.6);
  // the drawing is fitted: its line changes size (the whole drawing now fills the canvas) — waited on, not slept on
  await waitFor(async () => Math.abs((await runLine()) - pxBefore) > 2, `the double tap on the empty place fits the drawing (${Math.round(pxBefore)} px before)`);
  await h.shot("landscape");
  // the attributes in a sheet, as upright
  await openProps(p, { force: true }); // on its side: a double tap on the picked gutter opens its sheet
  await tid("attr-panel").waitFor({ timeout: 5000 });
};
