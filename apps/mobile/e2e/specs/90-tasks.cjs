const { listSearch, listSearchClear } = require("../listSearch.cjs");
const { listCreate } = require("../listScreen.cjs");
const { objMore, objSection } = require("../objectScreen.cjs");
const { pressUndo } = require("../gutters.cjs");
const { dayKey } = require("../companyTime.cjs");
/**
 * Wave 6-1 «Задачи» (docs/specs/20 §7, §9; 13 §3.7): «Ещё» → «Задачи» opens the list «Задачи · n» (v2 #2350, the List template:
 * groups by the day, no «% готово» and no status chips — «Показать выполненные» is an item of «⋯»);
 * «＋» asks «к чему» first (nothing loose, 13 §2.4), then a task with a time is saved, shows in the list and in the Plan;
 * the row's done circle with «Отменить» (rule 5); «Показать выполненные» and the search; the task's subject opens the client.
 * The lead's task sheet is the same form (one TaskSheet). The technician ties a task to his own job (20 §6-4, db T67).
 */
const { menuApi } = require("../menu.cjs");
const path = (h) => new URL(h.page.url()).pathname;
const TITLE = "Позвонить про водостоки";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const m = menuApi(h);
  const plus = () => listCreate(p, "tasks", "tasks-create-new");
  // the demo's open tasks: t1 and the test client Daniel Whitaker's t2, t3 (#3024)
  const OPEN = 3;
  const count = async (n, what) => h.expectText(new RegExp(`Задачи · ${n}( |\\||$)`), what);

  // «Ещё» → «Задачи»
  await h.go("/today");
  await m.open();
  await m.menu().getByRole("button", { name: "Задачи", exact: true }).locator("visible=true").click();
  await p.waitForTimeout(800);
  h.expect(path(h) === "/tasks", `«Задачи» → /tasks (${p.url()})`);
  await count(OPEN, "the demo's open tasks");
  await h.expectText(/Send the painting estimate/, "the demo task is a row");
  h.expect((await p.getByTestId("task-t1").locator("visible=true").count()) === 1, "the demo task's row");

  // «＋»: first «к чему», then the task
  await plus(); await p.waitForTimeout(500);
  const sheet = h.sheet();
  await sheet.getByPlaceholder("Клиент, лид, работа или адрес").fill("Sarah"); await p.waitForTimeout(300);
  // #2220: «Сохранить» is live; a try without «к чему» says so under it and saves nothing (e2e 517 in detail)
  await sheet.getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await h.expectText(/Выберите, к чему задача/, "a try without «к чему» says what is missing");
  await sheet.getByText("Sarah Mitchell", { exact: true }).first().click(); await p.waitForTimeout(300);
  await sheet.getByPlaceholder("Например: перезвонить и уточнить объём").fill(TITLE);
  await sheet.getByTestId("task-plan-mode-button").click(); // «В плане ⌄» is a row with a menu (spec 56 wave 5а)
  await p.getByTestId("task-plan-mode-time").locator("visible=true").first().click(); await p.waitForTimeout(300);
  await h.shot("form");
  await sheet.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(700);
  let db = await h.db();
  const task = db.tasks.find((x) => x.title === TITLE);
  h.expect(task && task.subjectType === "customer" && task.subjectId === "c1", "the task is tied to Sarah Mitchell");
  h.expect(task.startsAt && task.endsAt && Date.parse(task.endsAt) > Date.parse(task.startsAt) && !task.allDay, "with a time: a start and an end");
  await count(OPEN + 1, "one more task now");
  const rowText = await p.getByTestId(`task-${task.id}`).locator("visible=true").first().innerText();
  h.expect(rowText.includes(TITLE) && /клиент Sarah Mitchell/.test(rowText), `the row says what it is tied to: ${rowText}`);
  await h.shot("list");

  // the done circle → done (the row leaves the open ones), «Отменить» → open again
  await p.getByTestId(`task-done-${task.id}`).locator("visible=true").first().click(); await p.waitForTimeout(500);
  await h.expectText(/Задача выполнена/, "the toast says done");
  db = await h.db();
  h.expect(!!db.tasks.find((x) => x.id === task.id).doneAt, "done in the store");
  await count(OPEN, "back to the demo's open tasks");
  h.expect((await p.getByTestId(`task-${task.id}`).locator("visible=true").count()) === 0, "a done task hides by default");
  // «⋯ → Показать выполненные»: the group «Выполнено» holds it
  await objMore(p, "tasks", "tasks-more-done", { confirm: false });
  await p.getByTestId("tasks-group-done").locator("visible=true").first().waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("tasks-group-done").locator("visible=true").first().getByTestId(`task-${task.id}`).count()) === 1, "«Показать выполненные»: in «Выполнено»");
  await objMore(p, "tasks", "tasks-more-done", { confirm: false });
  await pressUndo(p, "Задача выполнена"); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(!db.tasks.find((x) => x.id === task.id).doneAt, "«Отменить» took it back");
  await count(OPEN + 1, "the new task open again");

  // the search
  await listSearch(p, "водосток");
  await h.expectText(new RegExp(TITLE), "the search finds it by the title");
  h.expect((await p.getByText("Send the painting estimate").locator("visible=true").count()) === 0, "the other task is not shown");
  await listSearch(p, "Mitchell");
  await h.expectText(new RegExp(TITLE), "the search finds it by the client");
  await listSearch(p, "zzzz");
  await h.expectText(/Задач не найдено/, "nothing found");
  await listSearchClear(p);

  // the task with a time is in the Plan: its day (v2: «Лента» is gone — the Day of the strip)
  await h.seed("octo.planMode.v1", "day");
  await h.go("/plan");
  if (h.layout.width >= 820) {
    // 820 / 1280: the day is the board by person, its tasks of a week are the Week's rows
    await h.seed("octo.planMode.v1", "week");
    await h.go("/plan");
  } else {
    await p.getByTestId(`plan-strip-${dayKey(task.startsAt)}`).locator("visible=true").first().click(); await p.waitForTimeout(500);
  }
  await h.expectText(new RegExp(TITLE), "the task with a time shows in the Plan");

  // the task's subject opens the client
  await h.go("/tasks");
  await p.getByTestId(`task-${task.id}`).locator("visible=true").click(); await p.waitForTimeout(500);
  await h.expectText(/К чему/, "the form shows what it is tied to");
  await h.sheet().getByText("Sarah Mitchell", { exact: true }).first().click(); await p.waitForTimeout(800);
  h.expect(path(h) === "/client/c1", `the subject opens the client (${p.url()})`);

  // the lead's task sheet is the same form
  await h.go("/lead/l3");
  // v2: the lead's section «Задачи», its group's «Новая задача»
  await objSection(p, "lead-screen", "tasks");
  await p.getByTestId("lead-task-new").locator("visible=true").first().click(); await p.waitForTimeout(400);
  await h.expectText(/К чему.*Lead|К чему.*Лид/, "the lead's form shows its subject");
  await h.expectText(/В Плане/, "and has «В Плане»");
  await h.shot("lead-form");

  // the technician: a task on his own job (the job of his visit), in «Мои»
  const d0 = await h.db();
  const myVisit = d0.visits.find((v) => v.jobId && !v.closed && (v.techId === "m-alex" || (v.assigneeIds || []).includes("m-alex")) && Date.parse(v.start) > Date.now() - 86400000);
  const myJob = d0.jobs.find((j) => j.id === myVisit.jobId);
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/tasks");
  await plus(); await p.waitForTimeout(500);
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
