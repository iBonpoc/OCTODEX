/**
 * iOS-style sheets: drag the grabber down to close; unsaved changes ask Save / Don't save / Keep editing (DS Б1, one rule); the Undo toast brings the old value back.
 * On tablet and desktop (820 / 1280) the sheet is a centred dialog without a grabber: closing is the "Закрыть" button, the
 * unsaved-changes question is the same.
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = (h.layout?.width ?? 390) >= 600;
  const closeBtn = async () => { await h.sheet().getByRole("button", { name: "Закрыть" }).last().click(); await p.waitForTimeout(500); };
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

  // v2: the lead's contact row (lead-person-main) opens «Контакты клиента»; its phone field is the one edited here
  const contact = () => p.getByTestId("lead-person-main").locator("visible=true").first();
  const phone = () => h.sheet().getByTestId("people-0-phones-row-0-value").locator("input").first();
  await h.go("/lead/l1");
  await h.clickText("Обзор");
  const phone0 = (await h.db()).leads.find((x) => x.id === "l1").phone;
  // no changes: drag down closes
  await contact().click();
  await p.waitForTimeout(400);
  h.expect(await sheetOpen(), "sheet opened");
  if (wide) {
    h.expect((await p.getByLabel("Шторка", { exact: true }).count()) === 0, "no grabber on a wide screen");
    await closeBtn();
    h.expect(!(await sheetOpen()), "close button closes the dialog");
    await contact().click();
    await p.waitForTimeout(400);
  } else {
    await dragDown(220);
    h.expect(!(await sheetOpen()), "drag down closes the sheet");
    // a small drag springs back
    await contact().click();
    await p.waitForTimeout(400);
    await dragDown(40);
    h.expect(await sheetOpen(), "a short drag does not close");
  }

  // unsaved changes: close asks; "Don't save" keeps the old value
  await phone().fill("(818) 555-0199");
  await h.sheet().getByRole("button", { name: "Закрыть" }).last().click();
  await p.waitForTimeout(300);
  await h.expectText(/Сохранить изменения\?/, "unsaved question on close");
  // DS Б1: the third button is «Продолжить правку», never «Отмена»; it returns to the form with the edit kept
  h.expect((await h.sheet().getByRole("button", { name: "Продолжить правку" }).count()) === 1, "third button «Продолжить правку»");
  h.expect((await h.sheet().getByRole("button", { name: "Отмена", exact: true }).count()) === 0, "no «Отмена» in the question");
  await h.sheet().getByRole("button", { name: "Продолжить правку" }).click();
  await h.sheet().getByRole("button", { name: "Продолжить правку" }).waitFor({ state: "hidden", timeout: 3000 });
  h.expect(await sheetOpen(), "«Продолжить правку» keeps the sheet open");
  h.expect((await phone().inputValue()) === "(818) 555-0199", "the edit is kept");
  await h.sheet().getByRole("button", { name: "Закрыть" }).last().click();
  await h.expectText(/Сохранить изменения\?/, "unsaved question again");
  await h.sheet().getByRole("button", { name: "Не сохранять" }).click();
  await p.waitForTimeout(500);
  let l = (await h.db()).leads.find((x) => x.id === "l1");
  h.expect(l.phone === phone0, `not saved (${l.phone})`);

  // drag with changes → question → Save
  await contact().click();
  await p.waitForTimeout(400);
  await phone().fill("(818) 555-0199");
  if (wide) await closeBtn();
  else await dragDown(220);
  await h.expectText(/Сохранить изменения\?/, "unsaved question on drag / close");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(500);
  l = (await h.db()).leads.find((x) => x.id === "l1");
  h.expect(l.phone === "(818) 555-0199", `saved from the question (${l.phone})`);

  // the toast «Отменить» (rule 5; v2: a solid plate, no countdown ring) brings the old value back
  const undo = p.getByTestId("toast-undo").last();
  h.expect(await undo.isVisible(), "undo toast");
  await h.shot("toast");
  await p.waitForFunction(() => { const b = [...document.querySelectorAll('[data-testid="toast-undo"]')].pop(); return !!b && b.getAttribute("aria-busy") !== "true"; }, null, { timeout: 3000 });
  await undo.click();
  const back = await p.waitForFunction((was) => JSON.parse(localStorage.getItem("octo.db.v5")).db.leads.find((x) => x.id === "l1").phone === was, phone0, { timeout: 3000 }).then(() => true, () => false);
  h.expect(back, "«Отменить» brings the old phone back");
};
