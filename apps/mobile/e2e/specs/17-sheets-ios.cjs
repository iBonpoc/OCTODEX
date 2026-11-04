/** iOS-style sheets: drag the grabber down to close; unsaved changes ask Save / Don't save / Cancel; Undo toast has a countdown ring. */
exports.run = async (h) => {
  const p = h.page;
  const dragDown = async (dy) => {
    const g = p.getByLabel("Шторка", { exact: true }).last();
    const b = await g.boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + (dy * i) / 10);
    await p.mouse.up();
    await p.waitForTimeout(600);
  };
  const sheetOpen = async () => (await p.locator('[aria-modal="true"]').count()) > 0;

  await h.go("/lead/l1");
  await h.clickText("Обзор");
  // no changes: drag down closes
  await p.getByRole("button", { name: "Изменить: Контакт" }).click();
  await p.waitForTimeout(400);
  h.expect(await sheetOpen(), "sheet opened");
  await dragDown(220);
  h.expect(!(await sheetOpen()), "drag down closes the sheet");

  // a small drag springs back
  await p.getByRole("button", { name: "Изменить: Контакт" }).click();
  await p.waitForTimeout(400);
  await dragDown(40);
  h.expect(await sheetOpen(), "a short drag does not close");

  // unsaved changes: close asks; "Don't save" keeps the old value
  await h.sheet().getByPlaceholder("client@example.com").fill("kb@example.com");
  await h.sheet().getByRole("button", { name: "Закрыть" }).last().click();
  await p.waitForTimeout(300);
  await h.expectText(/Сохранить изменения\?/, "unsaved question on close");
  await h.sheet().getByRole("button", { name: "Не сохранять" }).click();
  await p.waitForTimeout(500);
  let l = (await h.db()).leads.find((x) => x.id === "l1");
  h.expect(!l.email, "not saved");

  // drag with changes → question → Save
  await p.getByRole("button", { name: "Изменить: Контакт" }).click();
  await p.waitForTimeout(400);
  await h.sheet().getByPlaceholder("client@example.com").fill("kb@example.com");
  await dragDown(220);
  await h.expectText(/Сохранить изменения\?/, "unsaved question on drag");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(500);
  l = (await h.db()).leads.find((x) => x.id === "l1");
  h.expect(l.email === "kb@example.com", "saved from the question");

  // toast Undo has the countdown ring
  const undo = p.getByRole("button", { name: "Отменить" }).last();
  h.expect(await undo.isVisible(), "undo toast");
  h.expect((await undo.locator("svg rect").count()) === 1, "countdown ring around Undo");
  await h.shot("toast-ring");
};
