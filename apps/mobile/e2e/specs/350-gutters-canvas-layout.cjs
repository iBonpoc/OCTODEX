/**
 * e2e 350 — #1274 (founder 12.11, spec 33-gutters-canvas-ui §1–§2): the canvas screen's layout. Every view.
 * - the header is ONE row (back · name · … · «Готово»), no second row under it;
 * - the toolbar has only pictures (no word under an icon); every cell still has its name for the screen reader; the bin is on it, dimmed until
 *   something is picked, active after;
 * - no row of «what is picked»: a summary chip in the lower corner says it («Желоб · 40′»); with no downspout «Дальше: водостоки»; then the totals;
 * - no cloud when all is saved; the small mark «on the phone» is there while something waits to go out (the queue is not empty).
 * Finds things by testID; waits on what it checks (no pauses).
 */
const { savedOnce, skipLength, closeDsMenu } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  h.expect((await tid("draw-summary").count()) === 0, "an empty drawing: no summary chip");

  await stroke([b.x + b.width * 0.1, b.y + b.height * 0.4], [b.x + b.width * 0.4, b.y + b.height * 0.4]);
  await savedOnce(p);

  // the header: one row — back and «Готово» (once the drawing is in the store) stand at the same height; nothing is saved-mark
  await tid("draw-done").waitFor({ timeout: 8000 });
  const back = await tid("draw-back").boundingBox(), done = await tid("draw-done").boundingBox();
  h.expect(Math.abs(back.y + back.height / 2 - (done.y + done.height / 2)) <= 4, `the header is one row: back and «Готово» at one height (${Math.round(back.y)} / ${Math.round(done.y)})`);
  h.expect((await tid("draw-local").count()) === 0, "no cloud when all is saved");

  // the toolbar: pictures only — no word of the cells on the screen; the names are there for the screen reader
  const bar = tid("draw-toolbar");
  const words = (await bar.innerText()).replace(/\s+/g, " ").trim();
  h.expect(!/Желоб|Водосток|Назад|Вперёд|Удалить|Этаж/.test(words), `the toolbar has no words (${JSON.stringify(words)})`);
  for (const id of ["draw-tool-line", "draw-tool-ds", "draw-undo", "draw-redo", "draw-delete"]) {
    const name = await tid(id).getByRole("button").getAttribute("aria-label");
    h.expect(!!name && name.length > 1, `${id}: has its name for the screen reader (${name})`);
  }

  // nothing picked: the chip says what next (no downspout yet); the bin is dimmed
  await p.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.8); // the empty canvas: nothing picked
  await tid("draw-next").waitFor({ timeout: 5000 });
  h.expect(/Дальше: водостоки/.test(await tid("draw-next").innerText()), "no downspout: «Дальше: водостоки» in the chip");
  h.expect((await tid("draw-delete").getAttribute("aria-disabled")) === "true", "nothing picked: the bin is dimmed");
  // a long press on the dimmed bin still says what it is (it is not locked out of the screen reader's and the finger's help)
  const binBox = await tid("draw-delete").boundingBox();
  await p.mouse.move(binBox.x + binBox.width / 2, binBox.y + binBox.height / 2);
  await p.mouse.down();
  await p.getByText("Удалить", { exact: true }).locator("visible=true").first().waitFor({ timeout: 4000 });
  await p.mouse.up();
  h.expect((await tid("draw-delete").getAttribute("aria-disabled")) === "true", "the long press did not wake the bin");
  h.expect((await tid("draw-sel-bar").count()) === 0, "no row of «what is picked»");
  await h.shot("next");

  // pick the gutter: the chip says it, the bin wakes
  await p.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.4);
  await tid("draw-selected").waitFor({ timeout: 5000 });
  h.expect(/Желоб/.test(await tid("draw-selected").innerText()), "picked: the chip says «Желоб · …»");
  // …and under it «Дальше: водостоки» stays until the first downspout (founder 12.11)
  await tid("draw-summary-next").waitFor({ timeout: 5000 });
  h.expect(/Дальше: водостоки/.test(await tid("draw-summary-next").innerText()), "picked, no downspout yet: «Дальше: водостоки» under the picked one");
  const sb = await tid("draw-selected").boundingBox(), nb = await tid("draw-summary-next").boundingBox();
  h.expect(nb.y > sb.y + sb.height - 2, "the hint is a second line under the picked one");
  h.expect((await tid("draw-delete").getAttribute("aria-disabled")) !== "true", "picked: the bin is active");

  // a downspout: the chip is the totals — gutters · downspouts · pipes (whole 10-ft sticks)
  await p.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.8); // nothing picked
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.4);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => e.kind === "downspout" && !e.deletedAt), KEY, { timeout: 8000 });
  await closeDsMenu(p); // a downspout put opens its menu by itself
  await tid("draw-tool-line").getByRole("button").click();
  await p.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.8);
  await p.waitForFunction(() => { const el = [...document.querySelectorAll('[data-testid="draw-summary"]')].find((e) => e.getBoundingClientRect().height > 0); return !!el && /′.*·.*\d+′/.test(el.textContent || ""); }, null, { timeout: 8000 });
  const total = (await tid("draw-summary").innerText()).replace(/\s+/g, " ");
  const pipes = Number((total.match(/(\d+)′\s*$/) || [])[1]);
  h.expect(pipes > 0 && pipes % 10 === 0, `the chip's pipes are in whole 10-ft sticks (${total})`);
  await h.shot("total");

  // the positive side of «no cloud when all is saved»: something waits in the queue → the mark appears (it is the only sign of «not sent yet»)
  const mid = await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.measurements || [])[0]?.id, KEY);
  h.expect(!!mid, "the drawing is in the store");
  await h.seed("octo.queue.v1", [{ id: "q-e2e-350", label: "e2e", at: new Date().toISOString() }]);
  await h.go(`/module/gutters/draw?m=${encodeURIComponent(mid)}`);
  await tid("draw-surface").waitFor({ timeout: 8000 });
  // the mark speaks about what this screen saved: one more gutter, then the queue (not empty) shows
  const b2 = await p.getByTestId("draw-surface").boundingBox();
  await stroke([b2.x + b2.width * 0.1, b2.y + b2.height * 0.85], [b2.x + b2.width * 0.35, b2.y + b2.height * 0.85]);
  await tid("draw-local").waitFor({ timeout: 8000 });
  h.expect((await tid("draw-local").getByRole("button").getAttribute("aria-label")).length > 1, "the mark has its name for the screen reader");
  await h.shot("local");
};
