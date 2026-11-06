/**
 * Properties inside a client (wave C2, docs/specs/04 §7.3): "+ Property" in the client's row «Объекты», the property card
 * (address, now at the property, access notes + gate code, people of the property), and "‹ Client" above it.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/client/c1");
  // the row «Объекты» counts the client's properties and opens their list (13 §3.3)
  const rows = p.getByTestId("client-rows");
  h.expect((await rows.innerText()).replace(/\s+/g, " ").includes("Объекты"), "row «Объекты» on the client");
  await rows.getByRole("button", { name: "Объекты", exact: true }).click();
  await p.waitForTimeout(400);
  h.expect(p.url().includes("/client/c1?s=properties"), `row opens the properties (${p.url()})`);

  // + property
  await h.click("Добавить объект");
  await h.sheet().getByPlaceholder("Улица и дом", { exact: true }).fill("77 Maple Dr");
  await h.sheet().getByPlaceholder("Квартира / офис", { exact: true }).fill("3");
  await h.sheet().getByPlaceholder("Город", { exact: true }).fill("Pasadena");
  await h.sheet().getByPlaceholder("91103", { exact: true }).fill("91105");
  await h.sheet().getByPlaceholder("Дом, Сдаётся, Офис…", { exact: true }).fill("Сдаётся");
  await h.sheet().getByRole("radio", { name: "Многоквартирный" }).click();
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  let db = await h.db();
  let pr = db.properties.find((x) => x.address === "77 Maple Dr");
  h.expect(pr && pr.customerId === "c1" && pr.unit === "3" && pr.kind === "multi_family" && pr.label === "Сдаётся", `property saved: ${JSON.stringify(pr)}`);
  h.expect(pr.city === "Pasadena, CA 91105", `city line: ${pr.city}`);
  h.expect((await p.getByRole("button", { name: /^77 Maple Dr/ }).count()) >= 1, "the new property is in the list");
  await h.go("/client/c1");
  const propRow = (await rows.getByRole("button", { name: "Объекты", exact: true }).innerText()).trim();
  h.expect(/\b3$/.test(propRow), `the row counts three properties (${propRow})`);
  await rows.getByRole("button", { name: "Объекты", exact: true }).click();
  await p.waitForTimeout(400);

  // the property card
  await p.getByRole("button", { name: /77 Maple Dr, #3/ }).first().click();
  await p.waitForTimeout(400);
  h.expect(p.url().includes(`/property/${pr.id}`), "card opens the property");
  await h.expectText(/Сейчас на объекте/, "now at the property");
  await h.expectText(/Открытых смет и работ нет/, "nothing open yet");
  await h.expectText(/Многоквартирный/, "kind on the card");

  // access: notes + gate code
  await p.getByRole("button", { name: "Изменить: Доступ" }).click();
  await p.waitForTimeout(300);
  await h.sheet().getByPlaceholder("Собака, калитка, парковка", { exact: true }).fill("Dog in the yard");
  await h.sheet().getByPlaceholder("#1234", { exact: true }).fill("#4242");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  pr = db.properties.find((x) => x.id === pr.id);
  h.expect(pr.accessNotes === "Dog in the yard" && pr.gateCode === "#4242", "access saved");
  await h.expectText(/Код ворот: #4242/, "office sees the gate code");

  // people of the property: the client's spouse
  await p.getByRole("button", { name: "Изменить: Люди объекта" }).click();
  await p.waitForTimeout(300);
  await h.sheet().getByText(/^Tom Mitchell · /).click();
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  h.expect(db.properties.find((x) => x.id === pr.id).contactIds.includes("pp-c1-2"), "Tom is a person of this property");
  await h.expectText(/Tom Mitchell/, "person on the card");
  await h.shot("property-card");

  // tabs (C2b): a task and a note of the property; empty documents and files say so
  await h.clickText("Задачи");
  await h.click("Новая задача");
  await h.sheet().getByPlaceholder(/перезвонить/).fill("Fix the side gate latch");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  h.expect(db.tasks.some((x) => x.subjectType === "property" && x.subjectId === pr.id && x.title === "Fix the side gate latch"), "task of the property saved");
  await h.expectText(/Fix the side gate latch/, "task on the tab");
  // notes of a property: codes go to "Access" (shown to the tech only on the day of the visit), not to notes
  await h.expectText(/Код ворот и пароли пишите в поле «Доступ»/, "notes: access hint on a property");
  await h.clickText("Документы");
  await h.expectText(/Смет и счетов по объекту нет/, "no documents yet");
  await h.clickText("Файлы");
  await h.expectText(/Фото с визитов появятся здесь/, "no photos yet");
  await h.clickText("История");
  await h.expectText(/Здесь пока ничего не было|Заметка/, "history tab opens");
  await h.clickText("Обзор");

  // a tech with no visit here today or tomorrow does not see the code, but sees the notes
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go(`/property/${pr.id}`);
  await h.expectText(/Dog in the yard/, "tech sees access notes");
  await h.expectText(/Код покажется в день визита и накануне/, "tech: code hidden without a visit");
  h.expect((await p.getByText(/#4242/).count()) === 0, "tech: no code on the screen");
};
