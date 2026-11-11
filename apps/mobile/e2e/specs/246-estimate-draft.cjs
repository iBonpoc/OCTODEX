/**
 * e2e 246 — смета в конструкторе не пропадает (#760, audit Q-01, «Ядро: надёжность данных» №1; review of #859).
 * A new estimate is kept on the phone while it is built: «Назад» and opening «+ Смета» from the same place again,
 * a reload — the client, the title and the lines are there, with «Продолжен черновик». Another place — no draft.
 * «Начать заново» asks «Удалить черновик?» first (rule 5). A template opened and left untouched leaves no draft.
 * A saved estimate leaves no draft. Every view; finds by testID (rule 19), waits on what it checks.
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
  // the builder's line cards (ue-line-<id>), not the line sheet's own parts (ue-line-search/-custom/-price/-save…)
  const SHEET_PARTS = ["search", "custom", "price", "save", "remove", "source-hint"].map((x) => `:not([data-testid="ue-line-${x}"])`).join("");
  const hasLine = async () => (await p.locator(`[data-testid^="ue-line-"]${SHEET_PARTS}`).locator("visible=true").count()) > 0;
  const draftShown = async () => (await p.getByTestId("est-draft").locator("visible=true").count()) > 0;
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem("octo.drafts.v1.demo") || "[]"));
  const addCustomLine = async (name, price) => {
    await tid("ue-add-line").getByRole("button").click();
    await tid("ue-line-search").locator("input").fill(name);
    await tid("ue-line-custom").getByRole("button").click();
    await tid("ue-line-price").locator("input").fill(price);
    await tid("ue-line-save").getByRole("button").click();
    await sheetGone(p);
    await waitFor(hasLine, `the line «${name}» is in the builder`);
  };

  await h.go("/today");
  await h.go(NEW);
  h.expect((await titleValue()) === "", "a fresh builder: empty");
  h.expect(!(await draftShown()), "a fresh builder: no «Продолжен черновик»");
  await titleInput().fill("Крыша, черновик");
  await addCustomLine("Вывезти мусор", "150");
  await waitFor(async () => (await stored()).some((d) => d.title === "Крыша, черновик" && d.doc.options[0].lines.length === 1), "kept on the phone at once");

  // «Назад»: the builder leaves; «+ Смета» from the same client again → it goes on
  await p.goBack();
  await waitFor(async () => !p.url().includes("/estimate/new"), "back: the builder left");
  await h.go(NEW);
  await waitFor(draftShown, "again: «Продолжен черновик»");
  h.expect((await titleValue()) === "Крыша, черновик", "again: the title is there");
  await waitFor(hasLine, "again: the line is there");
  await h.shot("continued");

  // another place (another client): its own builder, no draft from here
  await h.go("/estimate/new?customerId=c1&propertyId=p1");
  h.expect((await titleValue()) === "", "another place: empty");
  h.expect(!(await draftShown()), "another place: no «Продолжен черновик»");

  // a reload (the app closed): still there
  await h.go(NEW);
  await p.reload();
  await waitFor(draftShown, "reload: «Продолжен черновик»");
  h.expect((await titleValue()) === "Крыша, черновик", "reload: the title is there");
  await waitFor(hasLine, "reload: the line is there");

  // «Начать заново» asks first (rule 5: a confirmation): «Отмена» keeps everything
  await tid("est-draft-restart").getByRole("button").click();
  await tid("est-draft-ask").waitFor({ timeout: 5000 });
  await tid("est-draft-keep").getByRole("button").click();
  await sheetGone(p);
  h.expect(await draftShown(), "«Отмена»: the note stays");
  h.expect((await titleInput().inputValue()) === "Крыша, черновик" && (await hasLine()), "«Отмена»: the estimate is there");
  h.expect((await stored()).some((d) => d.title === "Крыша, черновик"), "«Отмена»: the draft is on the phone");
  // «Удалить»: empty, the draft is gone for good
  await tid("est-draft-restart").getByRole("button").click();
  await tid("est-draft-ask").waitFor({ timeout: 5000 });
  await h.shot("restart-ask");
  await tid("est-draft-delete").getByRole("button").click();
  await sheetGone(p);
  await waitFor(async () => !(await draftShown()), "«Удалить»: the note goes");
  await waitFor(async () => (await titleInput().inputValue()) === "" && !(await hasLine()), "«Удалить»: an empty builder");
  await waitFor(async () => (await stored()).length === 0, "«Удалить»: no draft on the phone");
  await p.reload();
  h.expect((await titleValue()) === "", "«Удалить» → reload: empty");
  h.expect(!(await draftShown()), "«Удалить» → reload: no «Продолжен черновик»");

  // a template opened and left untouched: no draft (its name and lines are not a change, review №1)
  // the template is put in before the app starts on each load (a write from the running page would be overwritten)
  await p.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem("octo.db.v5") || "null");
    if (!s?.db || (s.db.estimateTemplates || []).some((x) => x.id === "tpl246")) return;
    const doc = JSON.parse(JSON.stringify(s.db.estimates.find((e) => e.doc).doc));
    doc.options = [{ ...doc.options[0], lines: [{ id: "tl1", group: "service", name: "Clean gutters (test)", quantity: "1", unit: "ea", unitPriceCents: 20000 }] }];
    s.db.estimateTemplates = [...(s.db.estimateTemplates || []), { id: "tpl246", name: "Gutter cleaning (test)", doc }];
    localStorage.setItem("octo.db.v5", JSON.stringify(s));
  });
  const TPL = "/estimate/new?template=tpl246&customerId=c2&propertyId=p2";
  await h.go(TPL);
  h.expect((await titleValue()) === "Gutter cleaning (test)", "a template: its name");
  await waitFor(hasLine, "a template: its line");
  await p.waitForTimeout(600); // past the 250 ms of a write
  h.expect((await stored()).length === 0, "a template untouched: nothing kept");
  await h.go("/today"); // left (the previous page in the history is another builder)
  h.expect((await stored()).length === 0, "a template left untouched: nothing kept");
  await h.go(TPL);
  h.expect(!(await draftShown()), "a template opened again: no false «Продолжен черновик»");

  // saved: the draft goes; the next «+ Смета» starts empty (a template exists now: «С чего начать?» → «Пустая смета»)
  await h.go(NEW);
  await tid("est-start-blank").getByRole("button").click();
  await sheetGone(p);
  await titleInput().fill("Сохранённая");
  await addCustomLine("Вывезти мусор", "150");
  await waitFor(async () => (await stored()).length === 1, "kept before the save");
  await tid("ue-save").getByRole("button").click();
  await waitFor(async () => /\/estimate\/[^n/][^/]*$/.test(new URL(p.url()).pathname), "saved: the estimate opens");
  await waitFor(async () => (await stored()).length === 0, "saved: no draft on the phone");
  await h.go(NEW);
  await tid("est-start").waitFor({ timeout: 8000 }); // a fresh builder asks «С чего начать?» again: no draft took its place
  h.expect((await titleValue()) === "", "after a save: «+ Смета» starts empty");
  h.expect(!(await draftShown()), "after a save: no «Продолжен черновик»");
};
