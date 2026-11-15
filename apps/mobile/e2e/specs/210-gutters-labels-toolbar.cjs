/**
 * e2e 210 — часть 1 пачки основателя 09.11 (docs/specs/33-gutters-canvas.md П20.18): подписи открывают своё, отбойник,
 * панель, единица показа. Every view.
 * - a corner's chip tapped → the corner sheet; an inside corner has «Отбойник на угле» on, its dashed mark on the
 *   drawing; off → the mark goes; on → back;
 * - a downspout's fittings word tapped → its menu; «Водосток» on that downspout → its menu again, no second one;
 * - «Назад» then «Вперёд» on the toolbar (no «Ещё»); «Удалить» at the top only while something is picked;
 * - a gutter shown in mm (its properties) → its label says mm;
 * - the toolbar dropped at the top → it stands at the top.
 * Finds things by testID / id; waits on what it checks.
 */
const { openProps, savedOnce, skipLength, sheetGone } = require("../gutters.cjs");
const KEY = "octo.db.v5";

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
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt), KEY);
  const centre = async (loc) => { const bb = await loc.boundingBox(); return [bb.x + bb.width / 2, bb.y + bb.height / 2]; };
  const closeSheet = async () => {
    await p.getByRole("button", { name: "Закрыть", exact: true }).last().click({ position: { x: 10, y: 10 } });
    await p.waitForTimeout(400);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  h.expect((await tid("draw-more").count()) === 0 && (await tid("draw-redo").count()) === 1, "«Вперёд» on the toolbar, no «Ещё»");
  h.expect((await tid("draw-delete").count()) === 1 && (await tid("draw-delete").getAttribute("aria-disabled")) === "true", "nothing picked: the bin is there, disabled (#1274)");
  // the total is on «Просмотр замера» now (#700): nothing under the drawing
  h.expect((await tid("draw-money").count()) === 0 && (await tid("draw-total").count()) === 0, "no total under the drawing");
  const b = await p.getByTestId("draw-surface").boundingBox();
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.45;
  const y0 = b.y + b.height * 0.25, y1 = b.y + b.height * 0.45;
  await stroke([x0, y0], [x1, y0]);
  await stroke([x1, y0], [x1, y1]);
  await waitFor(async () => (await svg().locator('[id^="c:"]').count()) === 1, "a corner");
  h.expect((await tid("draw-delete").getAttribute("aria-disabled")) !== "true", "something picked: the bin is active (#687, #1274)");
  // no cloud when all is saved and sent (#1274, founder 12.11): the data is saved, nothing is drawn for it at the top
  await savedOnce(p);
  h.expect((await tid("draw-local").count()) === 0, "all saved: no save mark at the top");
  h.expect((await tid("draw-accuracy").count()) === 0, "no «Примерно — не для резки» at the top (#681)");
  // «Свойства» on the toolbar of the phone (#687)
  if (!wide) {
    h.expect((await tid("draw-props").count()) === 0 && (await tid("draw-tool-select").count()) === 0, "no «Свойства» and no «Выбрать» on the toolbar (a double tap opens the properties, #1273)");
    await openProps(p);
    await tid("attr-panel").waitFor({ timeout: 5000 });
    // the properties sheet has no title: a tap outside it closes it (as e2e 211)
    await p.getByRole("button", { name: /^(Закрыть|Close|Cerrar)$/ }).last().click({ position: { x: 10, y: 10 } });
    await waitFor(async () => (await tid("attr-panel").count()) === 0, "the properties sheet closed");
    await sheetGone(p);
  }

  // the corner's chip → the corner sheet; make it inside, the splash guard on → its mark; off → gone
  const chip = svg().locator('[id^="lbl-corner:"]').first();
  await p.mouse.click(...(await centre(chip)));
  await tid("corner-sheet").waitFor({ timeout: 5000 });
  if (!(await tid("corner-splash").count())) {
    await tid("corner-kind").getByRole("radio", { name: "внутренний", exact: true }).click();
    // the sheet stays open after the kind (founder 09.11, #479): the inside corner's splash guard shows in it
    await waitFor(async () => (await tid("corner-sheet").count()) === 1 && (await tid("corner-splash").count()) === 1, "the sheet stays open, the splash guard there");
  }
  await waitFor(async () => (await svg().locator('[id^="splash-"]').count()) === 1, "an inside corner: the splash guard's mark");
  await tid("corner-splash").getByRole("switch").click();
  await waitFor(async () => (await svg().locator('[id^="splash-"]').count()) === 0, "off: the mark is gone");
  await tid("corner-splash").getByRole("switch").click();
  await waitFor(async () => (await svg().locator('[id^="splash-"]').count()) === 1, "on again: back");
  await closeSheet();

  // a downspout; its fittings word → its menu; «Водосток» on it → its menu, no second one
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click((x0 + x1) / 2, y0 + 2);
  await tid("attr-panel").waitFor({ timeout: 5000 });
  if (!wide) await closeSheet();
  await waitFor(async () => (await svg().locator('[id^="lbl-ds:"]').count()) === 1, "its fittings word");
  await p.mouse.click(...(await centre(svg().locator('[id^="lbl-ds:"]').first())));
  await tid("attr-ds-size").waitFor({ timeout: 5000 });
  if (!wide) await closeSheet();
  await p.mouse.click(...(await centre(svg().locator("circle").first())));
  await tid("attr-ds-size").waitFor({ timeout: 5000 });
  await p.waitForTimeout(400);
  h.expect((await svg().locator("circle").count()) === 1, "«Водосток» on a downspout opens it — no second one");
  await waitFor(async () => (await els()).filter((e) => e.kind === "downspout").length === 1, "one downspout in the store");
  if (!wide) await closeSheet();

  // «Назад» / «Вперёд»
  await tid("draw-undo").getByRole("button").click();
  await waitFor(async () => (await svg().locator("circle").count()) === 0, "«Назад»: the downspout goes");
  await tid("draw-redo").getByRole("button").click();
  await waitFor(async () => (await svg().locator("circle").count()) === 1, "«Вперёд»: back");

  // the first gutter picked (its unit is no longer a per-line choice: one format for the company, e2e 257)
  await tid("draw-tool-line").getByRole("button").click();
  await p.mouse.click(x0 + (x1 - x0) * 0.2, y0);
  if (!wide) await openProps(p);
  await tid("attr-panel").waitFor({ timeout: 5000 });
  h.expect((await tid("attr-unit").count()) === 0, "no unit choice per line any more");
  if (!wide) await closeSheet();
  else await tid("draw-panel-close").getByRole("button").click();
  await h.shot("labels");

  // the toolbar at the top
  const g = await tid("draw-grip").boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await p.mouse.down();
  const vw = p.viewportSize().width;
  for (let i = 1; i <= 15; i++) await p.mouse.move(g.x + g.width / 2 + (vw / 2 - g.x) * (i / 15), g.y + g.height / 2 - (g.y - 10) * (i / 15));
  // while dragging: the edge it sticks to is outlined
  await tid("draw-drop-top").waitFor({ timeout: 3000 });
  await p.mouse.up();
  await waitFor(async () => (await tid("draw-drop-top").count()) === 0, "let go: the outline goes");
  await waitFor(async () => { const t = await tid("draw-toolbar").boundingBox(); return t.y < b.y + b.height * 0.3 && t.width > t.height; }, "dropped at the top: a row at the top");
};
