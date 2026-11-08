/**
 * e2e 163 — the office edits a visit's checklist before it starts (docs/specs/08 §5, §7.4, §11.8 №8; step 14 CH3).
 * The demo inspection v6 came without items (sales books inspections — no snapshot): the director opens it → an empty
 * checklist → «Добавить из шаблона» → the demo template's items (from «Every job visit»), a second time it is «Добавлен».
 * An item's text (a new line is cleaned), «Обязательный» off (the director), «Ниже» with «Отменить», a new required item.
 * The dispatcher may not turn «Обязательный» off; sales and the tech do not edit. Found by testID and the db.
 */
exports.run = async (h) => {
  const p = h.page;
  const ID = "v6";
  const visit = async () => (await h.db()).visits.find((x) => x.id === ID);
  const until = async (ok) => {
    for (let i = 0; i < 20 && !ok(await visit()); i++) await p.waitForTimeout(150);
    return visit();
  };
  const editor = () => p.getByTestId("chk-editor").last();

  await h.go(`/visit/${ID}`);
  await editor().waitFor();
  h.expect((await visit()).checklist.length === 0, "the inspection came without items");
  await h.expectText(/Пунктов пока нет/, "an empty checklist");

  // «Добавить из шаблона»: the template's items, a snapshot with its name
  await p.getByTestId("chk-from-template").last().getByRole("button").click();
  await h.sheet().getByText("Шаблоны чек-листов").waitFor();
  await h.shot("templates");
  await h.sheet().getByRole("button", { name: "Every job visit" }).click();
  await h.expectText(/Добавлено пунктов: 4/, "the toast");
  let v = await until((x) => x.checklist.length === 4);
  h.expect(
    v.checklist.map((x) => x.label).join("|") === "Protect floors and furniture|Confirm scope with the client|Clean up the work area|Walk through with the client",
    `the template's items: ${v.checklist.map((x) => x.label).join("|")}`,
  );
  h.expect(v.checklist.every((x) => x.templateId === "tpl-job" && x.templateName === "Every job visit" && !x.done && !x.id.startsWith("tpl-")), "a snapshot: new ids, the template's name");
  await p.getByTestId("chk-edit-3").last().waitFor();
  await h.shot("added");
  // a second time: «Добавлен», no doubles
  await p.getByTestId("chk-from-template").last().getByRole("button").click();
  await h.sheet().getByText("Добавлен").waitFor();
  h.expect((await h.sheet().getByRole("button", { name: "Every job visit" }).count()) === 0, "an added template is not pressed again");
  await p.keyboard.press("Escape");
  await h.sheet().waitFor({ state: "detached" }).catch(() => {});

  // the text of an item (a new line pasted is cleaned) and «Обязательный» off — the director
  await p.getByTestId("chk-edit-1").last().getByRole("button", { name: /^Изменить/ }).click();
  await h.sheet().getByText("Пункт чек-листа").waitFor();
  await h.sheet().getByRole("textbox").fill("Confirm scope\nwith the owner");
  await h.sheet().getByRole("switch", { name: "Обязательный" }).click();
  await h.sheet().getByTestId("chk-edit-save").getByRole("button").click();
  await h.expectText(/Пункт изменён/, "the toast");
  v = await until((x) => x.checklist[1].label === "Confirm scope with the owner" && x.checklist[1].required === false);
  h.expect(v.checklist[1].label === "Confirm scope with the owner" && v.checklist[1].required === false, `edited: ${JSON.stringify(v.checklist[1])}`);

  // «Ниже», then «Отменить» (rule 5)
  const first = v.checklist[0].id;
  await p.getByTestId("chk-edit-0").last().getByRole("button", { name: /^Ниже/ }).click();
  v = await until((x) => x.checklist[1].id === first);
  h.expect(v.checklist[1].id === first, "moved down");
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  v = await until((x) => x.checklist[0].id === first);
  h.expect(v.checklist[0].id === first, "«Отменить» brings the order back");

  // a new item of the office: required by default
  await editor().getByPlaceholder("Свой пункт чек-листа").fill("Dog in the yard");
  await editor().getByRole("button", { name: "Добавить", exact: true }).click();
  v = await until((x) => x.checklist.length === 5);
  h.expect(v.checklist[4].label === "Dog in the yard" && v.checklist[4].required === true, `a new required item: ${JSON.stringify(v.checklist[4])}`);
  await h.shot("edited");

  // the dispatcher: a required item stays required (only the director turns it off; the server's guard)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("dispatcher")));
  await h.go(`/visit/${ID}`);
  await p.getByTestId("chk-edit-0").last().getByRole("button", { name: /^Изменить/ }).click();
  await h.sheet().getByText("Пункт чек-листа").waitFor();
  h.expect((await h.sheet().getByText("Снять «Обязательный» может только директор").count()) === 0, "an optional item: the dispatcher may make it required");
  await p.keyboard.press("Escape");
  await h.sheet().waitFor({ state: "detached" }).catch(() => {});
  await p.getByTestId("chk-edit-2").last().getByRole("button", { name: /^Изменить/ }).click();
  await h.sheet().getByText("Снять «Обязательный» может только директор").waitFor();
  h.expect((await h.sheet().getByRole("switch", { name: "Обязательный" }).count()) === 0, "no switch for a required item");
  await h.shot("dispatcher");
  await p.keyboard.press("Escape");

  // sales and the tech: no editor (the server would refuse their edits)
  for (const role of ["sales", "tech"]) {
    await p.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);
    await h.go(`/visit/${ID}`);
    await h.expectText(/Пунктов: 5/, `${role}: the checklist is read`);
    h.expect((await p.getByTestId("chk-editor").count()) === 0, `${role}: no editor`);
  }
};
