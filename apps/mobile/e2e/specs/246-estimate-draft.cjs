/**
 * e2e 246 — смета в конструкторе не пропадает (#760, audit Q-01, «Ядро: надёжность данных» №1).
 * A new estimate is kept on the phone while it is built: «Назад» and opening «+ Смета» from the same place again,
 * a reload — the client, the title and the lines are there, with «Продолжен черновик». «Начать заново» drops it;
 * a saved estimate leaves no draft. Every view; waits on what it checks (testID).
 */
const { sheetGone } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const NEW = "/estimate/new?customerId=c2&propertyId=p2";
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const titleInput = () => tid("ue-title").locator("input, textarea").first();
  const titleValue = async () => { await tid("ue-title").waitFor({ timeout: 8000 }); return titleInput().inputValue(); };
  const hasLine = async () => (await p.locator('[data-testid^="ue-line-"]').locator("visible=true").count()) > 0;
  const draftShown = async () => (await p.getByTestId("est-draft").locator("visible=true").count()) > 0;
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem("octo.drafts.v1.demo") || "[]"));

  await h.go("/today");
  await h.go(NEW);
  h.expect((await titleValue()) === "", "a fresh builder: empty");
  h.expect(!(await draftShown()), "a fresh builder: no «Продолжен черновик»");
  await titleInput().fill("Крыша, черновик");
  await p.getByRole("button", { name: "Добавить позицию" }).first().click();
  await h.sheet().getByPlaceholder(/Начните писать/).fill("Вывезти мусор");
  await h.sheet().getByText(/Своя позиция:/).click();
  await h.sheet().locator('input[inputmode="decimal"]').nth(1).fill("150");
  await h.sheet().getByRole("button", { name: "Готово" }).click();
  await sheetGone(p);
  await waitFor(hasLine, "the line is in the builder");
  await waitFor(async () => (await stored()).some((d) => d.title === "Крыша, черновик" && d.doc.options[0].lines.length === 1), "kept on the phone at once");

  // «Назад»: the builder leaves; «+ Смета» from the same client again → it goes on
  await p.goBack();
  await waitFor(async () => !p.url().includes("/estimate/new"), "back: the builder left");
  await h.go(NEW);
  await waitFor(draftShown, "again: «Продолжен черновик»");
  h.expect((await titleValue()) === "Крыша, черновик", "again: the title is there");
  await waitFor(hasLine, "again: the line is there");
  await h.expectText(/Вывезти мусор/, "again: the line's name");
  await h.shot("continued");

  // a reload (the app closed): still there
  await p.reload();
  await waitFor(draftShown, "reload: «Продолжен черновик»");
  h.expect((await titleValue()) === "Крыша, черновик", "reload: the title is there");
  await waitFor(hasLine, "reload: the line is there");

  // «Начать заново»: empty, and the draft is gone for good
  await tid("est-draft-restart").locator('[role="button"]').first().click();
  await waitFor(async () => !(await draftShown()), "restart: the note goes");
  await waitFor(async () => (await titleInput().inputValue()) === "" && !(await hasLine()), "restart: an empty builder");
  await waitFor(async () => (await stored()).length === 0, "restart: no draft on the phone");
  await p.reload();
  h.expect((await titleValue()) === "", "restart → reload: empty");
  h.expect(!(await draftShown()), "restart → reload: no «Продолжен черновик»");

  // saved: the draft goes; the next «+ Смета» starts empty
  await titleInput().fill("Сохранённая");
  await p.getByRole("button", { name: "Добавить позицию" }).first().click();
  await h.sheet().getByPlaceholder(/Начните писать/).fill("Вывезти мусор");
  await h.sheet().getByText(/Своя позиция:/).click();
  await h.sheet().locator('input[inputmode="decimal"]').nth(1).fill("150");
  await h.sheet().getByRole("button", { name: "Готово" }).click();
  await sheetGone(p);
  await waitFor(hasLine, "the line is in the builder");
  await tid("ue-save").locator('[role="button"]').first().click();
  await waitFor(async () => /\/estimate\/[^n/][^/]*$/.test(new URL(p.url()).pathname), "saved: the estimate opens");
  await waitFor(async () => (await stored()).length === 0, "saved: no draft on the phone");
  await h.go(NEW);
  h.expect((await titleValue()) === "", "after a save: «+ Смета» starts empty");
  h.expect(!(await draftShown()), "after a save: no «Продолжен черновик»");
};
