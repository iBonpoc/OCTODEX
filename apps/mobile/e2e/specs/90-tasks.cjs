const { listSearch, listSearchClear } = require("../listSearch.cjs");
/**
 * Wave 6-1 «Задачи» (docs/specs/20 §7, §9; 13 §3.7): «Ещё» → «Задачи» opens the list «Задачи (n) · n% готово»;
 * «＋» asks «к чему» first (nothing loose, 13 §2.4), then a task with a time is saved, shows in the list and in the Plan;
 * «Выполнено» on the card with «Отменить» (rule 5); the filters and the search; the task's subject opens the client.
 * The lead's task sheet is the same form (one TaskSheet). The technician ties a task to his own job (20 §6-4, db T67).
 */
const { menuApi } = require("../menu.cjs");
const path = (h) => new URL(h.page.url()).pathname;
const TITLE = "Позвонить про водостоки";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const m = menuApi(h);
  const plus = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');

  // «Ещё» → «Задачи»
  await h.go("/today");
  await m.open();
  await m.menu().getByRole("button", { name: "Задачи", exact: true }).locator("visible=true").click();
  await p.waitForTimeout(800);
  h.expect(path(h) === "/tasks", `«Задачи» → /tasks (${p.url()})`);
  await h.expectText(/Задачи \(1\) · 0% готово/, "the progress of the demo's one task");
  await h.expectText(/Send the painting estimate/, "the demo task is a card");
  await h.expectText(/Открытые · 1/, "the open filter counts it");

  // «＋»: first «к чему», then the task
  await plus().click(); await p.waitForTimeout(500);
  const sheet = h.sheet();
  await sheet.getByPlaceholder("Клиент, лид, работа или адрес").fill("Sarah"); await p.waitForTimeout(300);
  h.expect((await sheet.getByRole("button", { name: "Сохранить", exact: true }).last().isDisabled()) === true, "no save before «к чему» and the title");
  await sheet.getByText("Sarah Mitchell", { exact: true }).first().click(); await p.waitForTimeout(300);
  await sheet.getByPlaceholder("Например: перезвонить и уточнить объём").fill(TITLE);
  await sheet.getByText("Со временем", { exact: true }).last().click(); await p.waitForTimeout(300);
  await h.shot("form");
  await sheet.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(700);
  let db = await h.db();
  const task = db.tasks.find((x) => x.title === TITLE);
  h.expect(task && task.subjectType === "customer" && task.subjectId === "c1", "the task is tied to Sarah Mitchell");
  h.expect(task.startsAt && task.endsAt && Date.parse(task.endsAt) > Date.parse(task.startsAt) && !task.allDay, "with a time: a start and an end");
  await h.expectText(/Задачи \(2\) · 0% готово/, "two tasks now");
  await h.expectText(new RegExp(`${TITLE}.*Клиент: Sarah Mitchell`), "the card says what it is tied to");
  await h.shot("list");

  // «Выполнено» → done, «Отменить» → open again
  const card = p.getByTestId(`task-${task.id}`).locator("visible=true");
  await card.getByRole("button", { name: "Выполнено", exact: true }).click(); await p.waitForTimeout(500);
  await h.expectText(/Задача выполнена/, "the toast says done");
  db = await h.db();
  h.expect(!!db.tasks.find((x) => x.id === task.id).doneAt, "done in the store");
  await h.expectText(/Задачи \(2\) · 50% готово/, "the progress moved");
  await h.expectText(/Выполненные · 1/, "the done filter counts it");
  await h.click("Отменить"); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(!db.tasks.find((x) => x.id === task.id).doneAt, "«Отменить» took it back");
  await h.expectText(/Задачи \(2\) · 0% готово/, "the progress is back");

  // filters and search
  // spec 31: a chip with nothing behind it is hidden — «Выполненные · 0» is not on the lane
  h.expect((await p.getByText("Выполненные · 0", { exact: true }).locator("visible=true").count()) === 0, "no empty «Выполненные» chip");
  await h.clickText("Открытые · 2");
  await listSearch(p, "водосток");
  await h.expectText(new RegExp(TITLE), "the search finds it by the title");
  h.expect((await p.getByText("Send the painting estimate").locator("visible=true").count()) === 0, "the other task is not shown");
  await listSearch(p, "Mitchell");
  await h.expectText(new RegExp(TITLE), "the search finds it by the client");
  await listSearch(p, "zzzz");
  await h.expectText(/Задач не найдено/, "nothing found");
  await listSearchClear(p);

  // the task with a time is in the Plan
  await h.go("/plan");
  await p.getByRole("radio", { name: "Лента", exact: true }).or(p.getByRole("tab", { name: "Лента", exact: true })).or(p.getByText("Лента", { exact: true })).locator("visible=true").first().click(); await p.waitForTimeout(500);
  await h.expectText(new RegExp(TITLE), "the task with a time shows in the Plan");

  // the task's subject opens the client
  await h.go("/tasks");
  await p.getByTestId(`task-${task.id}`).locator("visible=true").click(); await p.waitForTimeout(500);
  await h.expectText(/К чему/, "the form shows what it is tied to");
  await h.sheet().getByText("Sarah Mitchell", { exact: true }).first().click(); await p.waitForTimeout(800);
  h.expect(path(h) === "/client/c1", `the subject opens the client (${p.url()})`);

  // the lead's task sheet is the same form
  await h.go("/lead/l3");
  await p.getByRole("tab", { name: /^Задачи/ }).locator("visible=true").first().click(); await p.waitForTimeout(400);
  await h.click("Новая задача"); await p.waitForTimeout(400);
  await h.expectText(/К чему.*Lead|К чему.*Лид/, "the lead's form shows its subject");
  await h.expectText(/В Плане/, "and has «В Плане»");
  await h.shot("lead-form");

  // the technician: a task on his own job (the job of his visit), in «Мои»
  const d0 = await h.db();
  const myVisit = d0.visits.find((v) => v.jobId && !v.closed && (v.techId === "m-alex" || (v.assigneeIds || []).includes("m-alex")) && Date.parse(v.start) > Date.now() - 86400000);
  const myJob = d0.jobs.find((j) => j.id === myVisit.jobId);
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/tasks");
  await plus().click(); await p.waitForTimeout(500);
  const ts = h.sheet();
  await ts.getByPlaceholder("Клиент, лид, работа или адрес").fill(myJob.title.slice(0, 6)); await p.waitForTimeout(300);
  await ts.getByText(myJob.title, { exact: true }).first().click(); await p.waitForTimeout(300);
  await ts.getByPlaceholder("Например: перезвонить и уточнить объём").fill("Купить кронштейны");
  await h.shot("tech-form");
  await ts.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(700);
  db = await h.db();
  const mine = db.tasks.find((x) => x.title === "Купить кронштейны");
  h.expect(mine && mine.subjectType === "job" && mine.subjectId === myJob.id && mine.assigneeId === db.me, "the tech's task is on his job, assigned to him");
  await h.expectText(/Купить кронштейны/, "it is in his «Мои»");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
