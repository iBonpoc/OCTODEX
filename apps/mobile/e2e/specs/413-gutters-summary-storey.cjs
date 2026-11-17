/**
 * e2e 413 — плашка-сводка выбранного: «эт N» только когда этажей больше одного (#1666; DS §19а — как подпись длины,
 * #1275). Every view.
 * - one storey: the picked gutter's summary is «Желоб · <length>», no «эт 1»;
 * - a second gutter on storey 2: the picked one says «· эт 2», and the first, picked again, «· эт 1».
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, canvasAt, sheetGone } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const summary = async () => ((await tid("draw-selected").count()) ? (await tid("draw-selected").first().innerText()).trim() : "");
  /** waits until the visible summary matches (no sleeps: the browser checks on each frame) */
  const summaryIs = async (re, what) => {
    const ok = await p
      .waitForFunction((src) => [...document.querySelectorAll('[data-testid="draw-selected"]')].some((e) => e.offsetParent && new RegExp(src).test((e.innerText || "").trim())), re.source, { timeout: 6000 })
      .then(() => true, () => false);
    h.expect(ok, `${what} (${await summary()})`);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const stroke = async (y) => {
    const a = [b.x + b.width * 0.2, y], c = [b.x + b.width * 0.55, y];
    await canvasAt(p, a[0], a[1]);
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(a[0] + ((c[0] - a[0]) * i) / 10, y);
    await p.mouse.up();
    await skipLength(p);
    await sheetGone(p);
  };
  const y1 = b.y + b.height * 0.3, y2 = b.y + b.height * 0.5;

  // one storey: no «эт»
  await stroke(y1);
  await summaryIs(/^Gutter · [^·]+$/, "one storey: «Gutter · <length>», no «эт 1»");

  // the next gutter on storey 2: now two storeys — the word is there
  await tid("draw-story").click();
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="draw-story"]')].some((e) => e.offsetParent && (e.textContent || "").includes("2")), null, { timeout: 5000 });
  await stroke(y2);
  await summaryIs(/^Gutter · .+ · эт 2$/, "two storeys: the new gutter says «эт 2»");
  await h.shot("two");

  // the first one picked again: «эт 1»
  await tid("draw-tool-line").getByRole("button").click();
  await canvasAt(p, b.x + b.width * 0.35, y1);
  await p.mouse.click(b.x + b.width * 0.35, y1);
  await summaryIs(/^Gutter · .+ · эт 1$/, "two storeys: the first gutter says «эт 1»");
};
