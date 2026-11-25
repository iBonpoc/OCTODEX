/**
 * e2e 517 — #2220 for the task form (founder 19.11 on the event form; the director: «TaskSheet — та же ошибка»). Every view.
 * «Задачи» → «＋»: the new task says nothing and «Сохранить» is live; «Сохранить» → the form stays, nothing is saved,
 * «Выберите, к чему задача» under «К чему» and «Напишите, что сделать» under the title (aria-invalid); «к чему» picked → its error
 * goes; a title typed → its error goes; «Сохранить» → saved (the store, the sheet gone).
 * Finds things by testID and the store; waits on what it checks (no pauses).
 */
const { sheetGone } = require("../sheet.cjs");
const { listCreate } = require("../listScreen.cjs");
const KEY = "octo.db.v5";
const TITLE = "T517 call about the gutters";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const tasks = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.tasks || []).length, KEY);

  await h.go("/tasks");
  // v2: «＋» of the List template's header
  await listCreate(p, "tasks", "tasks-create-new");
  await tid("task-save").waitFor({ timeout: 5000 });
  const before = await tasks();

  h.expect((await tid("task-subject-error").count()) === 0 && (await tid("task-title-error").count()) === 0, "a new task says nothing before «Сохранить»");
  h.expect(!(await tid("task-save").isDisabled()), "«Сохранить» is live on a new task");
  await tid("task-save").click();
  await tid("task-subject-error").filter({ hasText: "Выберите, к чему задача" }).waitFor({ timeout: 5000 });
  await tid("task-title-error").filter({ hasText: "Напишите, что сделать" }).waitFor({ timeout: 5000 });
  h.expect((await tid("task-save").count()) === 1, "the form stays open");
  h.expect((await tasks()) === before, "nothing is saved with a problem");
  h.expect((await tid("task-title").locator('[aria-invalid="true"]').count()) === 1, "the title field is marked invalid");
  await h.shot("errors");

  // «к чему»: the first place of the list
  await tid("task-places").locator('[role="button"]').first().click();
  await tid("task-subject-error").waitFor({ state: "detached", timeout: 5000 });
  await tid("task-title").locator("input, textarea").first().fill(TITLE);
  await tid("task-title-error").waitFor({ state: "detached", timeout: 5000 });
  await tid("task-save").click();
  await sheetGone(p);
  await p
    .waitForFunction(([k, t]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.tasks || []).some((x) => x.title === t), [KEY, TITLE], { timeout: 5000 })
    .catch(() => h.expect(false, "the task is saved"));
};
