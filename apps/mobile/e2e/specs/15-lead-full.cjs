/** Full lead: quick lead (duplicate warning, a new person source), call → history, task, contact edit, declined → reopen, filters, tech access. */
exports.run = async (h) => {
  const p = h.page;
  const lead = async (id) => (await h.db()).leads.find((l) => l.id === id);
  await h.go("/lead/new");
  // the same phone as an existing lead → warning before saving
  await p.getByPlaceholder("(555) 555-0100").last().fill("8185550170");
  await h.expectText(/Этот номер уже есть/, "duplicate warning");
  await h.expectText(/Kevin Brooks/, "the existing lead is shown");
  await p.getByPlaceholder("(555) 555-0100").last().fill("");
  await p.getByPlaceholder("(555) 555-0100").last().pressSequentially("6265550111");
  await p.getByPlaceholder("Имя", { exact: true }).last().fill("Maria Lopez");
  await p.getByPlaceholder("Улица, дом, офис").last().fill("45 Oak St");
  await p.getByPlaceholder("Pasadena").last().fill("Glendale");
  // a new source — a person
  await p.getByRole("button", { name: "Thumbtack" }).last().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Новый источник" }).click();
  await p.waitForTimeout(250);
  await h.sheet().getByPlaceholder(/Коля/).fill("Angela & Natasha");
  await h.sheet().getByPlaceholder("(555) 555-0100").fill("3105550123");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  await h.click("Сохранить лид");
  await p.waitForTimeout(700);
  const id = p.url().split("/lead/")[1];
  let db = await h.db();
  const src = db.sources.find((s) => s.name === "Angela & Natasha");
  h.expect(src && src.kind === "person" && src.phone === "(310) 555-0123", "person source created");
  let l = db.leads.find((x) => x.id === id);
  h.expect(l && l.sourceId === src.id && l.assigneeId === "m-alex" && l.status === "new" && l.phone === "(626) 555-0111", `lead saved: ${JSON.stringify(l)}`);
  await h.expectText(/Без ответа/, "reply timer");
  await h.shot("card-new");

  // call from the card → first response, "in touch", history line
  await p.getByRole("button", { name: "Позвонить" }).first().click();
  await p.waitForTimeout(500);
  l = await lead(id);
  h.expect(l.status === "replied" && !!l.firstResponseAt, "call → in touch, timer stopped");
  await h.clickText("История");
  await h.expectText(/Звонок клиенту/, "call in the history");
  await h.expectText(/Лид пришёл: Angela & Natasha/, "received line with the source");

  // no next step → add a task for tomorrow, then mark it done
  await h.clickText("Обзор");
  await h.expectText(/Нет следующего шага/, "next step warning");
  await h.clickText("Задачи");
  await h.click("Новая задача");
  await h.sheet().getByPlaceholder(/перезвонить/).fill("Call back about the date");
  await h.sheet().getByText("Завтра 9:00", { exact: true }).click();
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  const task = db.tasks.find((x) => x.subjectId === id);
  h.expect(task && task.title === "Call back about the date" && task.dueAt && !task.doneAt, "task saved");
  h.expect((await p.getByText(/Нет следующего шага/).count()) === 0, "warning gone with a task");
  await p.getByRole("button", { name: "Отметить выполненной" }).first().click();
  await p.waitForTimeout(300);
  h.expect(!!(await h.db()).tasks.find((x) => x.id === task.id).doneAt, "task done");

  // edit the contact: email + second phone
  await h.clickText("Обзор");
  await p.getByRole("button", { name: "Изменить: Контакт" }).click();
  await p.waitForTimeout(300);
  await h.sheet().getByPlaceholder("client@example.com").fill("maria@example.com");
  await h.sheet().getByPlaceholder("(555) 555-0100").nth(1).pressSequentially("6265550112");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(300);
  l = await lead(id);
  h.expect(l.email === "maria@example.com" && l.phone2 === "(626) 555-0112", "contact edited");

  // declined (we decided) with a reason, then back to work
  await h.click("Закрыть лид");
  await h.sheet().getByText("Отклонён", { exact: true }).click();
  await h.sheet().getByRole("radio", { name: "Невыгодно" }).click();
  await h.sheet().getByRole("button", { name: "Отклонить лид" }).click();
  await p.waitForTimeout(400);
  l = await lead(id);
  h.expect(l.status === "declined" && l.lostReason === "not_profitable", "declined with a contractor reason");
  await h.expectText(/Отклонён: Невыгодно/, "reason on the card");
  await h.click("Вернуть в работу");
  l = await lead(id);
  h.expect(l.status === "replied" && !l.lostReason, "back to work");
  await h.shot("card-overview");

  // list filters and search
  await h.go("/inbox?tab=leads");
  await p.getByPlaceholder("Имя, телефон, адрес, услуга").fill("0111");
  await p.waitForTimeout(300);
  h.expect((await p.getByRole("button", { name: "Maria Lopez" }).count()) === 1, "found by phone");
  await p.getByPlaceholder("Имя, телефон, адрес, услуга").fill("");
  await p.getByText(/^Без ответа · \d+$/).last().click();
  await p.waitForTimeout(300);
  h.expect((await p.getByRole("button", { name: "Maria Lopez" }).count()) === 0, "replied lead is not in 'no reply'");
  await h.shot("list");

  // hand a lead to Ivan; a tech who is neither its owner nor its creator does not see it (demo "me" = Alex)
  await h.go("/lead/l2");
  await h.clickText("Обзор");
  await p.getByRole("button", { name: "Alex Petrov" }).last().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Ivan Sokolov" }).click();
  await p.waitForTimeout(400);
  h.expect((await lead("l2")).assigneeId === "m-ivan", "assigned to Ivan");
  await h.clickText("История");
  await h.expectText(/Лид передан: Ivan Sokolov/, "assignment in the history");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/lead/l2");
  await h.expectText(/Этот лид ведёт другой человек/, "tech has no access");
  await h.go(`/lead/${id}`);
  await h.expectText(/Maria Lopez/, "but sees the lead he created");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
