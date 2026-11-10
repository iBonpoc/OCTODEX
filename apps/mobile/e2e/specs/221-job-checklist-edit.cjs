/**
 * e2e 221 — the office edits the checklist from the job card (#606; docs/specs/08 §7.4, CH3): the job's first visit not
 * started yet (j1 → v1, today; v7 tomorrow waits) gets the same editor as the visit screen. A new item, «Отменить»,
 * «Ниже»; the visit shows the item. A job whose only visit has started (j5 → v4 «working») — no editor; the tech — none.
 * Found by testID and the db.
 */
exports.run = async (h) => {
  const p = h.page;
  const visit = async (id) => (await h.db()).visits.find((x) => x.id === id);
  const until = async (id, ok) => {
    for (let i = 0; i < 20 && !ok(await visit(id)); i++) await p.waitForTimeout(150);
    return visit(id);
  };
  const editor = () => p.getByTestId("chk-editor").last();

  await h.go("/job/j1");
  await editor().waitFor();
  await editor().getByText(/^Чек-лист выезда · /).waitFor();
  const before = (await visit("v1")).checklist.length;
  const v7 = (await visit("v7")).checklist.length;
  await h.shot("job");

  // a new item of the office: into v1, required by default; «Отменить» takes it back (rule 5)
  await editor().getByPlaceholder("Свой пункт чек-листа").fill("Ladder on site");
  await editor().getByRole("button", { name: "Добавить", exact: true }).click();
  let v = await until("v1", (x) => x.checklist.length === before + 1);
  const added = v.checklist[v.checklist.length - 1];
  h.expect(added.label === "Ladder on site" && added.required === true, `a new required item in v1: ${JSON.stringify(added)}`);
  h.expect((await visit("v7")).checklist.length === v7, "the later visit is not touched");
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  v = await until("v1", (x) => x.checklist.length === before);
  h.expect(!v.checklist.some((c) => c.label === "Ladder on site"), "«Отменить» takes the item back");

  // again, then «Ниже» on the first item
  await editor().getByPlaceholder("Свой пункт чек-листа").fill("Ladder on site");
  await editor().getByRole("button", { name: "Добавить", exact: true }).click();
  v = await until("v1", (x) => x.checklist.length === before + 1);
  const first = v.checklist[0].id;
  await p.getByTestId("chk-edit-0").last().getByRole("button", { name: /^Ниже/ }).click();
  v = await until("v1", (x) => x.checklist[1].id === first);
  h.expect(v.checklist[1].id === first, "moved down from the job card");
  await h.shot("edited");

  // the visit shows what the job card changed
  await h.go("/visit/v1");
  await editor().getByText("Ladder on site").waitFor();

  // a job whose visit has started: nothing to edit before the visit
  await h.go("/job/j5");
  await p.getByTestId("job-visit-v4").waitFor();
  h.expect((await p.getByTestId("chk-editor").count()) === 0, "j5: the visit has started — no editor");

  // the tech: no editor on the job card (the server would refuse the edits)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/job/j1");
  await p.getByTestId("job-visit-v1").waitFor();
  h.expect((await p.getByTestId("chk-editor").count()) === 0, "tech: no editor");
};
