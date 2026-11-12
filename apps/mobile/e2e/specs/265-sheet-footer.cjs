/**
 * Sheet (DS §10 Б1, #944), every view — through the showcase (Настройки → Дизайн-система → «Окна: шторки»):
 * - the pinned bottom bar: the body (40 lines, much taller than the screen) scrolls, the footer stays whole in view;
 * - heights: medium — about half the screen, large — nearly all of it (phone; from 820 every sheet is the centred window);
 * - a nested step is a page inside the sheet: «Дальше» → another title and «‹ Назад» (it also takes Esc), which returns.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const phone = h.layout.width < 820;
  const vh = p.viewportSize().height;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const top = () => p.locator('[aria-modal="true"]').last();
  const titleOf = async () => (await top().getByTestId("sheet-title").innerText()).trim();
  await h.go("/settings/design-system");
  await vis("showcase-windows").waitFor({ timeout: 5000 });

  const open = async (id) => {
    await vis(`showcase-sheet-${id}`).getByRole("button").first().click();
    await top().getByTestId("sheet-title").waitFor({ timeout: 3000 });
  };
  const titleTop = async () => (await top().getByTestId("sheet-title").boundingBox()).y;

  // the pinned bottom bar
  await open("footer");
  const foot = top().getByTestId("sheet-footer");
  await foot.waitFor({ timeout: 3000 });
  const fb = await foot.boundingBox();
  h.expect(fb.y >= 0 && fb.y + fb.height <= vh + 1, `the footer is whole in view (${fb.y}..${fb.y + fb.height} of ${vh})`);
  const body = top().getByTestId("sheet-body");
  const scrolls = await body.evaluate((el) => [...el.querySelectorAll("*")].some((e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible"));
  h.expect(scrolls, "the body scrolls: its content is taller than the sheet");
  const last = top().getByText("Строка 40", { exact: true });
  h.expect((await last.count()) === 1, "the 40th line is in the body");
  h.expect((await last.boundingBox()).y > vh, "…below the screen until the body scrolls — the footer does not scroll away");
  const save = foot.getByRole("button", { name: "Сохранить", exact: true });
  h.expect((await save.count()) === 1, "the main button is in the footer");
  await save.click();
  await p.locator('[aria-modal="true"]').filter({ has: p.getByTestId("sheet-footer") }).waitFor({ state: "detached", timeout: 3000 });

  // heights (phone)
  if (phone) {
    await open("medium");
    const ty = await titleTop();
    h.expect(ty > vh * 0.4 && ty < vh * 0.65, `medium: the title is about the middle of the screen (y ${ty} of ${vh})`);
    await pressEscUntilClosed(p);
    await open("large");
    const ly = await titleTop();
    h.expect(ly < vh * 0.2, `large: the title is near the top (y ${ly} of ${vh})`);
    await pressEscUntilClosed(p);
  }

  // a page inside the sheet
  await open("pages");
  const first = await titleOf();
  h.expect((await p.getByTestId("sheet-back").count()) === 0, "page 1 has no «‹ Назад»");
  await top().getByTestId("sheet-footer").getByRole("button", { name: "Дальше", exact: true }).click();
  await p.waitForFunction((t) => document.querySelector('[aria-modal="true"] [data-testid="sheet-back"]') && true, first, { timeout: 3000 });
  const second = await titleOf();
  h.expect(second !== first, `page 2 has another title (${first} → ${second})`);
  h.expect((await top().getByTestId("sheet-back").count()) === 1, "page 2 has «‹ Назад»");
  // Esc on a page goes back one page, not out of the sheet
  await pressEscUntilClosed(p, top().getByTestId("sheet-back")); // Esc until the «‹ Назад» is gone: back one page
  h.expect((await titleOf()) === first, "Esc on page 2 returns to page 1 (the sheet stays)");
  await top().getByTestId("sheet-footer").getByRole("button", { name: "Дальше", exact: true }).click();
  await top().getByTestId("sheet-back").waitFor({ timeout: 3000 });
  await top().getByTestId("sheet-back").click();
  await p.waitForFunction(() => !document.querySelector('[aria-modal="true"] [data-testid="sheet-back"]'), null, { timeout: 3000 });
  h.expect((await titleOf()) === first, "«‹ Назад» returns to page 1");
  await pressEscUntilClosed(p);
};
