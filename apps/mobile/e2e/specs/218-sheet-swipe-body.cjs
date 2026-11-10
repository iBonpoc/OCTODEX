/**
 * e2e 218 — шторка закрывается смахиванием вниз за любое место, как в iPhone (просьба основателя 09.11, #505;
 * docs/specs/33-gutters-canvas.md П20.18 ч.4). Every view.
 * 390 (the sheet at the bottom):
 * - a swipe down on the body (the form, not the grabber) closes it; a short one springs back;
 * - a swipe down that starts in a field closes it too;
 * - a sideways drag on the body does not close it;
 * - the body scrolled down (a short screen): a swipe down does not close it — the list is not at its top; scrolled
 *   back to the top, the same swipe closes it;
 * - unsaved changes: the swipe asks «Сохранить изменения?» (the grabber's rule);
 * - the tape in «Длина желоба» (Gutters) keeps the finger: a drag down over it does not close the sheet.
 * 820/1280 (a centred dialog): a drag on the body does nothing — closing is «Закрыть».
 * Finds things by testID / role; waits on what it checks.
 */
const { sheetGone } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const wide = (h.layout?.width ?? 390) >= 600;
  const body = () => p.getByTestId("sheet-body").locator("visible=true").last();
  const isOpen = async () => (await p.locator('[aria-modal="true"]').count()) > 0;
  const waitOpen = async (want, what) => {
    let v = await isOpen();
    for (let i = 0; i < 30 && v !== want; i++) { await p.waitForTimeout(100); v = await isOpen(); }
    h.expect(v === want, what);
  };
  /** a drag; down at most to just above the window's bottom (a finger leaving the screen ends the gesture) */
  const drag = async (x, y, dx, dy) => {
    dy = Math.min(dy, p.viewportSize().height - y - 6);
    await p.mouse.move(x, y);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12);
    await p.mouse.up();
  };
  /** a point on the body that is not a field: the gap left of the first field's label row */
  const bodyPoint = async () => {
    const b = await body().boundingBox();
    return [b.x + b.width / 2, b.y + 4];
  };
  const openContact = async () => {
    await p.getByRole("button", { name: "Изменить: Контакт" }).click();
    await body().waitFor({ timeout: 3000 });
    await p.waitForTimeout(400); // the slide-in ends (a drag during it moves a sheet that is still coming)
  };
  const closeBtn = async () => {
    await h.sheet().getByRole("button", { name: "Закрыть" }).last().click();
    await waitOpen(false, "«Закрыть» closes");
    await sheetGone(p);
  };

  await h.go("/lead/l1");
  await h.clickText("Обзор");

  if (wide) {
    await openContact();
    const [x, y] = await bodyPoint();
    await drag(x, y, 0, 240);
    await p.waitForTimeout(500);
    h.expect(await isOpen(), "a centred dialog does not close on a drag");
    await closeBtn();
    return;
  }

  // a swipe down on the body closes
  await openContact();
  let [x, y] = await bodyPoint();
  await drag(x, y, 0, 220);
  await waitOpen(false, "a swipe down on the body closes the sheet");
  await sheetGone(p);

  // a short swipe springs back
  await openContact();
  [x, y] = await bodyPoint();
  await drag(x, y, 0, 40);
  await p.waitForTimeout(500);
  h.expect(await isOpen(), "a short swipe does not close");

  // sideways: not a swipe to close
  await drag(x - 80, y, 160, 30);
  await p.waitForTimeout(500);
  h.expect(await isOpen(), "a sideways drag does not close");

  // a swipe that starts in a field closes too
  const name = h.sheet().getByPlaceholder("Имя", { exact: true });
  const nb = await name.boundingBox();
  await drag(nb.x + nb.width / 2, nb.y + nb.height / 2, 0, 220);
  await waitOpen(false, "a swipe from a field closes the sheet");
  await sheetGone(p);

  // a short screen: the body scrolls; scrolled down, a swipe down does not close; at the top it does
  const vp = p.viewportSize();
  await p.setViewportSize({ width: vp.width, height: 260 });
  await p.waitForTimeout(400);
  await openContact();
  // the list inside the body: the first element that scrolls (the gesture's wrappers may stand between)
  const scroller = { evaluate: (f) => body().evaluate((el, src) => (0, eval)(src)(([el, ...el.querySelectorAll("div")].find((d) => /(auto|scroll)/.test(getComputedStyle(d).overflowY)))), f.toString()) };
  const can = await scroller.evaluate((e) => e.scrollHeight > e.clientHeight + 20);
  h.expect(can, "the form scrolls on a short screen");
  const bb = await body().boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.wheel(0, 300);
  let top = 0;
  for (let i = 0; i < 20 && !(top > 0); i++) { await p.waitForTimeout(100); top = await scroller.evaluate((e) => e.scrollTop); }
  h.expect(top > 0, "the wheel scrolls the sheet's form");
  [x, y] = await bodyPoint();
  await drag(x, y + 20, 0, 220);
  await p.waitForTimeout(500);
  h.expect(await isOpen(), "scrolled down: a swipe down does not close");
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.wheel(0, -2000);
  for (let i = 0; i < 20 && top > 0; i++) { await p.waitForTimeout(100); top = await scroller.evaluate((e) => e.scrollTop); }
  h.expect(top === 0, "scrolled back to the top");
  await p.waitForTimeout(200); // the last scroll event reaches the sheet
  [x, y] = await bodyPoint();
  await drag(x, y, 0, 220);
  await waitOpen(false, "at the top a swipe down closes");
  await sheetGone(p);
  await p.setViewportSize(vp);
  await p.waitForTimeout(400);

  // unsaved changes: the swipe asks first
  await openContact();
  await h.sheet().getByPlaceholder("Имя", { exact: true }).fill("Kevin Brooks Jr");
  [x, y] = await bodyPoint();
  await drag(x, y, 0, 220);
  await h.expectText(/Сохранить изменения\?/, "unsaved question on a body swipe");
  h.expect(await isOpen(), "the sheet stays for the question");
  await h.sheet().getByRole("button", { name: "Не сохранять" }).click();
  await waitOpen(false, "«Не сохранять» closes");
  await sheetGone(p);
  const l = (await h.db()).leads.find((v) => v.id === "l1");
  h.expect(l.name === "Kevin Brooks", "not saved");

  // Gutters: the tape keeps the finger — a drag down over it does not close «Длина желоба»
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  for (let i = 0; i < 40 && !/^Пробный/.test((await tid("module-gutters-status").innerText()).trim()); i++) await p.waitForTimeout(150);
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const s = await p.getByTestId("draw-surface").boundingBox();
  const sy = s.y + s.height * 0.42;
  await drag(s.x + s.width * 0.08, sy, s.width * 0.32, 0);
  await tid("quick-length").waitFor({ timeout: 4000 });
  await p.waitForTimeout(400);
  const tape = await tid("quick-length-tape").first().boundingBox();
  h.expect(!!tape, "the tape is in the length sheet");
  await drag(tape.x + tape.width / 2, tape.y + tape.height / 2, 0, 220);
  await p.waitForTimeout(500);
  h.expect(await tid("quick-length").count() > 0, "a drag down on the tape does not close the length sheet");
  await tid("quick-length-apply").first().click();
  await tid("quick-length").first().waitFor({ state: "detached", timeout: 3000 });
  await sheetGone(p);
};
