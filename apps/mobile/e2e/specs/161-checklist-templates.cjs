/**
 * e2e 161 — checklist templates (docs/specs/08 §6, §7.1, §7.2; step 14 CH2; S9).
 * The director: «Компания → Чек-листы» → the demo template's card → a new template (name, «Работа» only, a check and a
 * photo item, 2 photos after) → no name is refused. S9: a job scheduled after that gets a snapshot — the demo template's
 * items and the new one's, with its photo minimum. The template edited later does not change the visit. Archive with
 * «Отменить». Photo rules of the company. Found by testID.
 */
const { workdayOffset } = require("../companyTime.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/company");
  await p.getByTestId("company-checklists").last().click();
  await p.getByTestId("chk-tpl-tpl-job").last().waitFor();
  h.expect(/Every job visit/.test(await p.getByTestId("chk-tpl-tpl-job").last().innerText()), "the demo template's card");
  await h.shot("list");

  // a template without a name is refused on the phone (the server would refuse it and hold the queue)
  await p.getByTestId("chk-tpl-new").last().getByRole("button").click();
  await p.getByTestId("chk-tpl-save").last().waitFor();
  await p.getByTestId("chk-tpl-save").last().getByRole("button").click();
  await h.expectText(/Введите название/, "no name: refused");

  // a new template: «Работа» only, a check item and a photo item, 2 photos after
  await p.getByTestId("chk-tpl-name").last().getByRole("textbox").fill("Attic check");
  await p.getByRole("switch", { name: "Каждый выезд", exact: true }).last().click();
  await p.getByRole("switch", { name: "Вид выезда · Работа" }).last().click();
  await p.getByTestId("chk-tpl-item-0").last().getByRole("textbox").fill("Check the attic vents");
  await p.getByTestId("chk-tpl-add-item").last().getByRole("button").click();
  await p.getByTestId("chk-tpl-item-1").last().getByRole("textbox").fill("Photo of the attic");
  await p.getByTestId("chk-tpl-item-1").last().getByRole("radio", { name: "Фото" }).click();
  await p.getByRole("button", { name: "Фото после +1" }).last().click();
  await p.getByRole("button", { name: "Фото после +1" }).last().click();
  await h.shot("editor");
  await p.getByTestId("chk-tpl-save").last().getByRole("button").click();
  await p.getByTestId("chk-tpl-tpl-job").last().waitFor();
  let db = await h.db();
  for (let i = 0; i < 20 && !db.checklistTemplates.some((x) => x.name === "Attic check"); i++) {
    await p.waitForTimeout(150);
    db = await h.db();
  }
  const tpl = db.checklistTemplates.find((x) => x.name === "Attic check");
  h.expect(tpl && !tpl.appliesTo.everyVisit && tpl.appliesTo.visitKinds.join() === "work" && tpl.minPhotosAfter === 2, `saved: ${JSON.stringify(tpl)}`);
  h.expect(tpl.items.map((x) => `${x.kind}:${x.label}`).join("|") === "check:Check the attic vents|photo:Photo of the attic", `items: ${JSON.stringify(tpl.items)}`);
  await p.getByTestId(`chk-tpl-${tpl.id}`).last().waitFor();

  // S9: a visit scheduled now gets the snapshot of both templates and the minimum of photos after
  await h.go("/job/schedule?jobId=j2");
  await p.getByRole("radiogroup").first().getByRole("radio").nth(workdayOffset(3)).click();
  await p.getByRole("button", { name: "Ivan Sokolov" }).last().click();
  await p.getByRole("radio", { name: /^1:00/ }).last().click();
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click();
  await h.sheet().getByRole("button", { name: "Не сейчас" }).waitFor();
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click();
  const fresh = (d) => d.visits.find((x) => x.jobId === "j2" && x.id !== "v2");
  for (let i = 0; i < 20 && !fresh(await h.db()); i++) await p.waitForTimeout(150);
  db = await h.db();
  const v = fresh(db);
  h.expect(!!v, "the new visit of the job");
  const labels = v.checklist.map((x) => x.label);
  h.expect(
    labels.join("|") === "Protect floors and furniture|Confirm scope with the client|Clean up the work area|Walk through with the client|Check the attic vents|Photo of the attic",
    `the snapshot: «Every job visit», then «Attic check»: ${labels.join("|")}`,
  );
  h.expect(v.checklist.every((x) => !x.done) && v.checklist.find((x) => x.label === "Photo of the attic").kind === "photo", "items not done; the photo item is a photo item");
  h.expect(v.photoMins && v.photoMins.after === 2, `the template's minimum comes with the visit: ${JSON.stringify(v.photoMins)}`);

  // the template edited later: the visit keeps its snapshot
  await h.go(`/company/checklist/${tpl.id}`);
  await p.getByTestId("chk-tpl-item-0").last().getByRole("textbox").fill("Changed later");
  await p.getByTestId("chk-tpl-save").last().getByRole("button").click();
  for (let i = 0; i < 20 && (await h.db()).checklistTemplates.find((x) => x.id === tpl.id).items[0].label !== "Changed later"; i++) await p.waitForTimeout(150);
  db = await h.db();
  h.expect(db.checklistTemplates.find((x) => x.id === tpl.id).items[0].label === "Changed later", "the template changed");
  h.expect(db.visits.find((x) => x.id === v.id).checklist.some((x) => x.label === "Check the attic vents"), "the visit keeps the snapshot");

  // archive with «Отменить» (rule 5)
  await h.go(`/company/checklist/${tpl.id}`);
  await p.getByTestId("chk-tpl-archive").last().getByRole("button").click();
  await h.expectText(/Шаблон в архиве/, "the toast");
  for (let i = 0; i < 20 && !(await h.db()).checklistTemplates.find((x) => x.id === tpl.id).archivedAt; i++) await p.waitForTimeout(150);
  h.expect(!!(await h.db()).checklistTemplates.find((x) => x.id === tpl.id).archivedAt, "archived");
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  for (let i = 0; i < 20 && (await h.db()).checklistTemplates.find((x) => x.id === tpl.id).archivedAt; i++) await p.waitForTimeout(150);
  h.expect(!(await h.db()).checklistTemplates.find((x) => x.id === tpl.id).archivedAt, "«Отменить» brings it back");

  // photo rules (the director's): «after» off
  await p.getByTestId("chk-photo-rules").last().scrollIntoViewIfNeeded();
  await p.getByRole("switch", { name: "Фото после работы обязательно" }).last().click();
  for (let i = 0; i < 20 && (await h.db()).company.visitSettings?.photosAfterRequired !== false; i++) await p.waitForTimeout(150);
  h.expect((await h.db()).company.visitSettings.photosAfterRequired === false, "photos after: off");
  await h.shot("photo-rules");
};
