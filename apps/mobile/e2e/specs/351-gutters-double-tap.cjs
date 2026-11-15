/**
 * e2e 351 — #1273 (founder 12.11, spec 33 §3): the canvas's double tap. A SINGLE tap picks at once and does nothing else (no sheet, no flip
 * of a cap, no corner sheet) and never waits for a second; the SECOND tap on the same object inside motion.doubleTapMs opens what the
 * object has: a gutter — its properties (a sheet on the phone), a free end — «Конец желоба» (the cap there / none, L ↔ R), a corner — its
 * sheet; two taps on the empty place — the whole drawing; with «Водосток» two quick taps on a gutter put ONE downspout. «Вписать» left
 * the header — it is a row of «⋯». Every view. Finds things by testID; waits on what it checks (no pauses).
 */
const { skipLength, canvasAt, doubleTap, pastDoubleTap, fitAll, sheetGone } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const frames = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // what a tap would have done is drawn
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt), KEY);
  const centre = async (loc) => { const r = await loc.boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const closeSheet = async () => {
    await p.getByRole("button", { name: /^(Закрыть|Close|Cerrar)$/ }).last().click({ position: { x: 10, y: 10 } });
    await sheetGone(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4, x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.45;

  // «вписать» is not in the header any more
  h.expect((await tid("draw-fit").count()) === 0, "no «fit» button in the header");
  h.expect((await tid("draw-props").count()) === 0, "no «Свойства» on the toolbar");

  await stroke([x0, y], [x1, y]);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 1, KEY, { timeout: 8000 });
  await pastDoubleTap(p);

  // — a gutter: a single tap picks (and opens nothing), the second one opens its properties
  const mid = [(x0 + x1) / 2, y];
  await canvasAt(p, mid[0], mid[1]);
  await p.mouse.click(...mid);
  await frames();
  await tid("draw-selected").waitFor({ timeout: 3000 });
  if (!wide) h.expect((await tid("attr-panel").count()) === 0, "a single tap on a gutter opens no sheet");
  await pastDoubleTap(p);
  await doubleTap(p, mid[0], mid[1]);
  await tid("attr-panel").waitFor({ timeout: 5000 });
  if (!wide) await closeSheet();
  h.expect(true, "a double tap on a gutter: its properties");
  await h.shot("run");

  // — a free end: a single tap does not flip the cap; the second opens «Конец желоба»
  const caps = () => svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => g.id));
  const capIds = await caps();
  h.expect(capIds.length === 2, `two caps (${capIds.join(", ")})`);
  const capAt = await centre(svg().locator(`[id="${capIds[1]}"]`));
  await pastDoubleTap(p);
  await canvasAt(p, capAt[0], capAt[1]);
  const sides = () => svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => g.textContent));
  const s0 = await sides();
  await p.mouse.click(...capAt);
  await frames();
  h.expect(JSON.stringify(await sides()) === JSON.stringify(s0), "a single tap on a cap flips nothing");
  h.expect((await tid("end-sheet").count()) === 0, "…and opens no sheet");
  await pastDoubleTap(p);
  await doubleTap(p, capAt[0], capAt[1]);
  await tid("end-sheet").waitFor({ timeout: 5000 });
  // «без заглушки»: the end has no cap (stored in the gutter's geometry), «с заглушкой» puts it back
  await tid("end-cap-off").click();
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => e.kind === "run" && !e.deletedAt && e.geom.noCap && e.geom.noCap.some(Boolean)), KEY, { timeout: 8000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="cap:"]').length === 1, null, { timeout: 5000 });
  // closed and opened again: a double tap on the end WITHOUT a cap opens «Конец желоба» (not the gutter's properties) — «с заглушкой» is there (review of #1366)
  await closeSheet();
  await pastDoubleTap(p);
  await canvasAt(p, capAt[0], capAt[1]);
  await doubleTap(p, capAt[0], capAt[1]);
  await tid("end-sheet").waitFor({ timeout: 5000 });
  await tid("end-cap-on").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="cap:"]').length === 2, null, { timeout: 5000 });
  await p.waitForFunction((k) => !((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => e.kind === "run" && !e.deletedAt && e.geom.noCap && e.geom.noCap.some(Boolean)), KEY, { timeout: 8000 }); // «с заглушкой»: the mark is gone from the saved copy too
  await h.shot("end");
  await closeSheet();

  // the same as rows of «⋯» (a screen reader has no double tap): «Конец желоба · L/R» of the picked gutter's free ends, and «Свойства» on the phone
  const menuRow = async (re) => {
    await p.getByTestId("draw-who").locator("visible=true").getByRole("button").click();
    await p.getByText(re).last().click();
  };
  await menuRow(/^Конец желоба · [LR]$/);
  await tid("end-sheet").waitFor({ timeout: 5000 });
  await closeSheet();
  if (!wide) {
    await menuRow(/^Свойства$/);
    await tid("attr-panel").waitFor({ timeout: 5000 });
    await closeSheet();
  }

  // — a corner: a single tap picks, the second opens the corner's sheet
  await pastDoubleTap(p);
  const ends = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const rightEnd = ends.sort((u, v) => v[0] - u[0])[0];
  await stroke(rightEnd, [rightEnd[0], rightEnd[1] + 90]);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 2, KEY, { timeout: 8000 });
  await svg().locator('[id^="c:"]').first().waitFor({ timeout: 5000 });
  const k = await centre(svg().locator('[id^="c:"]').first());
  await pastDoubleTap(p);
  await canvasAt(p, k[0], k[1]);
  await p.mouse.click(...k);
  await frames();
  h.expect((await tid("corner-sheet").count()) === 0, "a single tap on a corner opens no sheet");
  await pastDoubleTap(p);
  await doubleTap(p, k[0], k[1]);
  await tid("corner-sheet").waitFor({ timeout: 5000 });
  await closeSheet();

  // — the empty place: two taps show the whole drawing
  const width = async () => (await svg().locator('[id^="halo-"], [id^="face-"]').first().boundingBox()).width;
  const w0 = await width();
  const empty = [b.x + b.width * 0.85, b.y + b.height * 0.75];
  await pastDoubleTap(p);
  await canvasAt(p, empty[0], empty[1]);
  await doubleTap(p, empty[0], empty[1]);
  await p.waitForFunction(([w0]) => { const e = document.querySelector('[data-testid="draw-svg"] [id^="face-"]'); return !!e && e.getBoundingClientRect().width !== w0; }, [w0], { timeout: 5000 });
  // …and the same is a row of «⋯»
  await fitAll(p);
  h.expect((await tid("draw-surface").count()) === 1, "«Весь рисунок» in «⋯»: the canvas is still there");
  await h.shot("fit");

  // — «Водосток»: two quick taps on a gutter put ONE downspout (no double tap with this tool)
  await pastDoubleTap(p);
  await tid("draw-tool-ds").getByRole("button").click();
  const before = (await els()).filter((e) => e.kind === "downspout").length;
  const run1 = await svg().locator('[id^="halo-"], [id^="face-"]').first().boundingBox();
  const at = [run1.x + run1.width * 0.3, run1.y + run1.height / 2];
  await canvasAt(p, at[0], at[1]);
  await doubleTap(p, at[0], at[1]);
  await p.waitForFunction(([k, n]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "downspout" && !e.deletedAt).length >= n, [KEY, before + 1], { timeout: 8000 });
  await frames();
  h.expect((await els()).filter((e) => e.kind === "downspout").length === before + 1, "two quick taps with «Водосток»: one downspout");
};
