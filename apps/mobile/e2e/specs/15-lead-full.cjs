const { listSearch, listSearchClear } = require("../listSearch.cjs");
const { objSection } = require("../objectScreen.cjs");
const { listChip } = require("../listScreen.cjs");
/**
 * Full lead: quick lead (duplicate warning, a new person source), call → history, task, contact edit, declined → reopen, filters,
 * tech access. v2 (#2350): the lead is the Object template — «Сейчас» with the ONE main step (`lead-next-<step>`), the quick
 * actions `lead-call`…, the sections strip `lead-screen-sections-<key>`; found by testID (CHECKS §9 №2/№26).
 */
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
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const now = () => tid("lead-now").innerText();
  // «Сейчас»: whose turn — the client waits for our reply, the step «Ответить»
  h.expect(/Клиент ждёт \d+ мин/.test(await now()), `reply timer (whose turn): ${await now()}`);
  await tid("lead-next-reply").waitFor();
  h.expect(/^LEA-\d{4}$/.test(l.number ?? ""), `the lead has its number (${l.number})`);
  await h.shot("card-new");

  // call from the card → "did you get through?": no answer keeps the timer; yes → in touch, then "what next?"
  await tid("lead-call").click();
  await h.sheet().getByRole("button", { name: "Не ответил" }).click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((x) => x.id === id)?.callAttempts === 1, id, { timeout: 5000 });
  l = await lead(id);
  h.expect(l.status === "new" && !l.firstResponseAt && l.callAttempts === 1, "no answer = attempt, timer keeps going");
  await tid("lead-next-reply").waitFor();
  await tid("lead-call").click();
  await h.sheet().getByRole("button", { name: "Да, поговорили" }).waitFor();
  h.expect(/попыток: 1/.test(await h.sheet().innerText()), "the call sheet says the attempts");
  await h.sheet().getByRole("button", { name: "Да, поговорили" }).click();
  await p.waitForTimeout(500);
  await h.expectText(/Что дальше\?/, "what next? after a real conversation");
  await h.sheet().getByRole("button", { name: "Позже" }).click();
  await p.waitForTimeout(400);
  l = await lead(id);
  h.expect(l.status === "replied" && !!l.firstResponseAt, "call → in touch, timer stopped");
  await objSection(p, "lead-screen", "history");
  await h.expectText(/Звонок клиенту/, "call in the history");
  await h.expectText(/Лид пришёл: Angela & Natasha/, "received line with the source");

  // no next step → «Что дальше?» is the main step; add a task for tomorrow, then mark it done
  await objSection(p, "lead-screen", "overview");
  await tid("lead-next-next").waitFor();
  h.expect(/Шага нет/.test(await now()), "no next step (whose turn)");
  await objSection(p, "lead-screen", "tasks");
  await tid("lead-task-new").click();
  await h.sheet().getByPlaceholder(/перезвонить/).fill("Call back about the date");
  await h.sheet().getByTestId("task-when-button").click(); // «Когда ⌄» is a row with a menu (spec 56 wave 5а)
  await p.getByTestId("task-when-tomorrow").locator("visible=true").first().click();
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.tasks.some((x) => x.subjectId === id), id, { timeout: 5000 });
  db = await h.db();
  const task = db.tasks.find((x) => x.subjectId === id);
  h.expect(task && task.title === "Call back about the date" && task.dueAt && !task.doneAt, "task saved");
  await tid(`lead-task-${task.id}`).waitFor();
  h.expect((await p.getByTestId("lead-next-next").locator("visible=true").count()) === 0, "no-step gone with a task");
  const doneIs = (v) => p.waitForFunction(([tk, v]) => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.tasks.find((x) => x.id === tk)?.doneAt === v, [task.id, v], { timeout: 5000 });
  // on «Задачи» the main step is the task itself: «Выполнено»
  await tid("lead-next-tasks").click();
  await doneIs(true);
  // B3 (recipe E): «Отменить» in the toast takes it back (armed after toastArmMs)
  await p.getByTestId("toast").filter({ hasText: /выполнен/i }).locator('[data-testid="toast-undo"][aria-busy="false"]').first().click();
  await doneIs(false);
  // the row's own move (a swipe; a long press on the web): done, then «Вернуть» on the done row
  const rowMove = async () => {
    // in the middle of the screen: the toast at the bottom must not cover the row
    await tid(`lead-task-${task.id}`).evaluate((e) => e.scrollIntoView({ block: "center" }));
    const box = await tid(`lead-task-${task.id}`).boundingBox();
    await p.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
    await p.mouse.down();
    await tid(`lead-task-done-${task.id}-menu`).waitFor({ timeout: 3000 });
    await p.mouse.up();
    await tid(`lead-task-done-${task.id}-menu`).click();
  };
  await rowMove();
  await doneIs(true);
  await rowMove();
  await doneIs(false);
  await rowMove();
  await doneIs(true);

  // edit the contact: email + second phone (people sheet, L2 part 2) — the contact row opens it
  await objSection(p, "lead-screen", "overview");
  await tid("lead-person-main").click();
  await h.sheet().getByTestId("people-0-emails-add").click();
  await h.sheet().getByPlaceholder("Email", { exact: true }).first().fill("maria@example.com");
  await h.sheet().getByTestId("people-0-phones-add").click();
  await h.sheet().getByPlaceholder("Телефон", { exact: true }).nth(1).pressSequentially("6265550112");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((x) => x.id === id)?.email === "maria@example.com", id, { timeout: 5000 });
  l = await lead(id);
  h.expect(l.email === "maria@example.com" && l.people && l.people[0].phones[1].number === "(626) 555-0112", "contact edited");

  // declined (we decided) with a reason, then back to work
  await tid("lead-header-status").click();
  await h.sheet().getByRole("button", { name: "Закрыть лид" }).click(); await p.waitForTimeout(300);
  await h.sheet().getByText("Отклонён", { exact: true }).click();
  await h.sheet().getByRole("radio", { name: "Невыгодно" }).click();
  await h.sheet().getByRole("button", { name: "Отклонить лид" }).click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((x) => x.id === id)?.status === "declined", id, { timeout: 5000 });
  l = await lead(id);
  h.expect(l.status === "declined" && l.lostReason === "not_profitable", "declined with a contractor reason");
  h.expect(/Отклонён: Невыгодно/.test(await tid("lead-header-status").innerText()), "reason on the card");
  await tid("lead-next-reopen").click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((x) => x.id === id)?.status === "replied", id, { timeout: 5000 });
  l = await lead(id);
  h.expect(l.status === "replied" && !l.lostReason, "back to work");
  await h.shot("card-overview");

  // list filters and search
  await h.go("/inbox?tab=leads");
  await p.waitForURL(/\/leads/);
  await listSearch(p, "0111");
  await tid(`lead-row-${id}`).waitFor({ timeout: 5000 });
  await listSearchClear(p);
  await listChip(p, "leads", /^Новые/).click();
  await tid("lead-row-l1").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId(`lead-row-${id}`).locator("visible=true").count()) === 0, "replied lead is not in «Новые»");
  await h.shot("list");
  await listChip(p, "leads", /^Все/).click(); // the chip is kept on the device

  // hand a lead to Ivan; a tech who is neither its owner nor its creator does not see it (demo "me" = Alex)
  await h.go("/lead/l2");
  await tid("lead-assignee-row").click();
  await h.sheet().getByRole("button", { name: "Ivan Sokolov" }).click();
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((x) => x.id === "l2")?.assigneeId === "m-ivan", null, { timeout: 5000 });
  await objSection(p, "lead-screen", "history");
  await h.expectText(/Лид передан: Ivan Sokolov/, "assignment in the history");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/lead/l2");
  await h.expectText(/Этот лид ведёт другой человек/, "tech has no access");
  await h.go(`/lead/${id}`);
  await tid("lead-screen").waitFor();
  h.expect((await tid("screen-head-big").innerText()).includes("Maria Lopez"), "but sees the lead he created");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
