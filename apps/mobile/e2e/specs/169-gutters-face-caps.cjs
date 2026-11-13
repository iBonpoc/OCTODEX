/**
 * e2e 169 — лицевая сторона, заглушки L/R и углы (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.11).
 * Every view.
 * - a gutter drawn → two end caps on the canvas, one «L» and one «R», and a face line beside the run;
 * - a tap on a cap → both caps swap (L ↔ R);
 * - a second gutter from its end, turning → a corner (a mark and a chip), the caps where the runs meet are gone;
 * - a tap on the corner → the sheet «Угол» → the other kind → the chip says it; the caps swap with it;
 * - an inside corner says «отбойник» (a splash guard by itself).
 * Finds things by id / testID; waits on what it checks.
 */
const { skipLength, pastDoubleTap } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
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
    await p.waitForTimeout(200);
  };
  /** the caps on the canvas: id → «L» / «R» */
  const caps = () => svg().locator('[id^="cap:"]').evaluateAll((gs) => Object.fromEntries(gs.map((g) => [g.id, (g.textContent || "").trim()])));
  const centreOf = async (loc) => {
    const bb = await loc.boundingBox();
    return [bb.x + bb.width / 2, bb.y + bb.height / 2];
  };
  const chips = () => svg().locator("text").evaluateAll((ts) => ts.map((t) => (t.textContent || "").trim()));

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.45;
  const y0 = b.y + b.height * 0.3, y1 = b.y + b.height * 0.55;

  // one gutter: an L cap and an R cap, a face line
  await stroke([x0, y0], [x1, y0]);
  await waitFor(async () => Object.keys(await caps()).length === 2, "two end caps");
  const c0 = await caps();
  h.expect(Object.values(c0).sort().join() === "L,R", `one L and one R (${JSON.stringify(c0)})`);
  h.expect((await svg().locator('[id^="face-"]').count()) === 1, "a face line beside the run");

  // a tap on a cap picks; the second one opens its sheet, where the caps swap
  const firstCap = Object.keys(c0)[0];
  const capAt = await centreOf(svg().locator(`[id="${firstCap}"]`));
  // a SINGLE tap on a cap only picks the gutter now (#1273): nothing flips on the spot
  await p.mouse.click(...capAt);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // two frames: what the tap would have done is drawn
  h.expect(JSON.stringify(await caps()) === JSON.stringify(c0), "a single tap on a cap flips nothing");
  await pastDoubleTap(p); // the single tap above is a first tap on its own, not the first half of the next pair
  // the second tap on the same cap: «Конец желоба» — a row there swaps the caps' side (the whole line's face)
  await p.mouse.click(...capAt);
  await p.mouse.click(...capAt);
  await tid("end-sheet").waitFor({ timeout: 5000 });
  await tid("end-flip").click();
  await waitFor(async () => {
    const c1 = await caps();
    return Object.keys(c0).every((k) => c1[k] && c1[k] !== c0[k]);
  }, "«L ↔ R» in the end's sheet: both caps swap");
  await p.getByRole("button", { name: /^(Закрыть|Close|Cerrar)$/ }).last().click({ position: { x: 10, y: 10 } });
  await waitFor(async () => (await tid("end-sheet").count()) === 0, "the end sheet closes");
  await h.shot("caps");

  // a second gutter from the right end, turning down: a corner, two caps left (the free ends)
  await stroke([x1, y0], [x1, y1]);
  await waitFor(async () => (await svg().locator('[id^="c:"]').count()) === 1, "a corner mark");
  await waitFor(async () => Object.keys(await caps()).length === 2, "the caps where the runs meet are gone");
  // #1275: the chip says only the angle («90°»); the kind is read from the corner's sheet
  const angleChip = async () => (await chips()).find((t) => /^\d+°$/.test(t)) || "";
  await waitFor(async () => (await angleChip()) !== "", "the corner's chip says its angle");
  const openCorner = async () => {
    // a single tap picks; the sheet is the second tap's (#1273)
    await p.mouse.click(x1, y0);
    await p.mouse.click(x1, y0);
    await tid("corner-sheet").waitFor({ timeout: 5000 });
    return (await tid("corner-kind").locator('[aria-checked="true"]').innerText()).trim();
  };
  const closeCorner = async () => {
    await p.getByRole("button", { name: /^(Закрыть|Close|Cerrar)$/ }).last().click({ position: { x: 10, y: 10 } });
    await waitFor(async () => (await tid("corner-sheet").count()) === 0, "the sheet closes");
  };
  const capsBefore = await caps();

  // a tap on the corner → «Угол» → the other kind
  const k0 = await openCorner();
  const other = k0 === "наружный" ? "внутренний" : "наружный";
  await tid("corner-kind").getByRole("radio", { name: other, exact: true }).click();
  // the sheet stays open after the choice (founder 09.11, версия 474): the choice shows, then the sheet is closed
  await waitFor(async () => ((await tid("corner-kind").locator('[aria-checked="true"]').innerText()).trim() === other), `${other} picked`);
  await closeCorner();
  h.expect((await angleChip()) !== "", "the angle chip stays");
  h.expect((await openCorner()) === other, `the corner is now ${other} (read back from its sheet)`);
  await closeCorner();
  const capsAfter = await caps();
  h.expect(Object.keys(capsBefore).every((k) => capsAfter[k] && capsAfter[k] !== capsBefore[k]), "the caps swap with the corner");
  await h.shot("corner");
};
