/**
 * Sheet (DS §10 Б1, #944), every view — through the showcase (Настройки → Дизайн-система → «Окна: шторки»):
 * - the pinned bottom bar: a long body scrolls, the main button stays in view at the bottom (390: no scroll needed);
 * - heights: medium — about half the screen, large — nearly all of it (phone; from 820 every sheet is the centred window);
 * - a nested step is a page inside the sheet: «Дальше» → another title and «‹ Назад», which returns.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const phone = h.layout.width < 820;
  const vh = h.layout.width === 390 ? 844 : 900;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const sheetAt = (title) => p.locator('[aria-modal="true"]').filter({ hasText: title }).last();
  await h.go("/settings/design-system");
  await vis("showcase-windows").waitFor({ timeout: 5000 });

  const open = async (id, title) => {
    await vis(`showcase-sheet-${id}`).getByRole("button").first().click();
    await sheetAt(title).waitFor({ timeout: 3000 });
    await sheetAt(title).getByRole("button", { name: "Закрыть", exact: true }).first().waitFor({ timeout: 3000 });
  };
  const top = async (title) => (await sheetAt(title).getByText(title, { exact: true }).first().boundingBox()).y;

  // the pinned bottom bar
  await open("footer", "Шторка с нижней панелью");
  const foot = sheetAt("Шторка с нижней панелью").getByTestId("sheet-footer");
  await foot.waitFor({ timeout: 3000 });
  const fb = await foot.boundingBox();
  h.expect(fb.y + fb.height <= vh + 1, `the footer is in view without scrolling (bottom ${fb.y + fb.height} of ${vh})`);
  const save = sheetAt("Шторка с нижней панелью").getByTestId("sheet-footer").getByRole("button", { name: "Сохранить", exact: true });
  h.expect((await save.count()) === 1, "the main button is in the footer");
  // the long body is behind it: the last line is below the fold until the body scrolls
  h.expect((await sheetAt("Шторка с нижней панелью").getByText("Строка 14", { exact: true }).count()) === 1, "the long body is there");
  await save.click();
  await sheetAt("Шторка с нижней панелью").waitFor({ state: "detached", timeout: 3000 });

  // heights (phone)
  if (phone) {
    await open("medium", "Шторка половинная");
    const ty = await top("Шторка половинная");
    h.expect(ty > vh * 0.4 && ty < vh * 0.65, `medium: the title is about the middle of the screen (y ${ty} of ${vh})`);
    await pressEscUntilClosed(p);
    await open("large", "Шторка большая");
    const ly = await top("Шторка большая");
    h.expect(ly < vh * 0.2, `large: the title is near the top (y ${ly} of ${vh})`);
    await pressEscUntilClosed(p);
  }

  // a page inside the sheet
  await open("pages", "Шторка со страницей");
  h.expect((await p.getByTestId("sheet-back").count()) === 0, "page 1 has no «‹ Назад»");
  await sheetAt("Шторка со страницей").getByTestId("sheet-footer").getByRole("button", { name: "Дальше", exact: true }).click();
  await sheetAt("Вторая страница").waitFor({ timeout: 3000 });
  h.expect((await sheetAt("Вторая страница").getByTestId("sheet-back").count()) === 1, "page 2 has «‹ Назад»");
  await sheetAt("Вторая страница").getByTestId("sheet-back").click();
  await sheetAt("Шторка со страницей").getByText("Шторка со страницей", { exact: true }).first().waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("sheet-back").count()) === 0, "«‹ Назад» returned to page 1");
  await pressEscUntilClosed(p);
};
