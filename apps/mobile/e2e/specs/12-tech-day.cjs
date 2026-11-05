const { expectOneAccent } = require("../accent.cjs");
/** Technician day: summary → open next visit → en route → on site → photo (view, delete, undo) → own checklist item → all checked → sign → pay → progress grows. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/visits");
  await expectOneAccent(h, "Visits (tech)");
  let db = await h.db();
  const mine = db.visits.filter((v) => v.techId === db.me && new Date(v.start).toDateString() === new Date().toDateString());
  h.expect(mine.length > 0, "tech has visits today");
  const doneBefore = mine.filter((v) => v.step === "paid").length;
  await h.expectText(new RegExp(`Готово ${doneBefore} из ${mine.length}`), "day progress");
  await h.expectText(/Собрано сегодня/, "collected tile");
  await h.shot("day");

  await h.click("Открыть выезд");
  const id = p.url().split("/visit/")[1];
  let v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v && v.step === "scheduled", "opened the next (not started) visit");
  if (v.checklist.length) await h.expectText(new RegExp(`Пунктов: ${v.checklist.length}`), "checklist visible before work");

  await h.click("Я в пути");
  await h.click("На месте");
  // photo before: the file picker on web
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: "Добавить фото" }).last().click()]);
  await chooser.setFiles({ name: "before.png", mimeType: "image/png", buffer: PNG });
  await p.waitForTimeout(600);
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.photos.length === 1, "photo added");
  // view → delete → undo
  await h.click("Фото 1");
  await h.click("Удалить фото");
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.photos.length === 0, "photo deleted");
  await h.click("Отменить");
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.photos.length === 1, "undo restores the photo");

  await p.getByRole("button", { name: /^Дальше: Работа/ }).last().click();
  await p.waitForTimeout(400);
  // own checklist item
  await p.getByPlaceholder("Свой пункт чек-листа").last().fill("Check for leaks");
  await h.click("Добавить");
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.checklist.some((x) => x.label === "Check for leaks" && !x.done), "own item added");
  for (const item of v.checklist.filter((x) => !x.done)) {
    await p.getByRole("checkbox", { name: item.label, exact: true }).last().click();
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(400);
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.checklist.every((x) => x.done), `all items checked: ${JSON.stringify(v.checklist)}`);
  await h.shot("work");

  // client signs on the tech's phone
  const pad = p.getByLabel(/расписывается/i).last();
  await pad.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await p.mouse.move(bb.x + 30, bb.y + 60);
  await p.mouse.down();
  for (let i = 0; i < 20; i++) await p.mouse.move(bb.x + 30 + i * 10, bb.y + 60 - Math.sin(i / 2) * 25);
  await p.mouse.up();
  await h.click("Подтвердить подпись");
  await h.clickText("Наличные");
  await h.click("Записать оплату");
  db = await h.db();
  v = db.visits.find((x) => x.id === id);
  h.expect(v.step === "paid" && v.payment && v.payment.method === "cash", "paid in cash");

  await h.go("/visits");
  await h.expectText(new RegExp(`Готово ${doneBefore + 1} из ${mine.length}`), "progress grew");
  await h.shot("after");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
