/**
 * Wave 6 (docs/specs/20 §8, rule 6): without the network a call and a task are saved at once and wait in the queue.
 * The offline switch resets on a page load, so the spec moves inside the app (menu), never by address.
 */
const { menuApi } = require("../menu.cjs");
const queue = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("octo.queue.v1") || "[]"));

exports.run = async (h) => {
  const p = h.page;
  const m = menuApi(h);
  const wide = h.layout.width > 390;
  const plus = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');
  const go = async (name) => {
    await m.open();
    await m.menu().getByRole("button", { name, exact: true }).locator("visible=true").click(); await p.waitForTimeout(700);
  };

  await h.go("/settings");
  await p.getByRole("switch", { name: "Проверка: режим без сети" }).click(); await p.waitForTimeout(300);
  const before = (await queue(p)).length;

  // a call
  await go("Звонки");
  await plus().click(); await p.waitForTimeout(400);
  await h.sheet().getByText("Записать звонок", { exact: true }).last().click(); await p.waitForTimeout(500);
  await h.sheet().getByPlaceholder("Лид или клиент").fill("Tom"); await p.waitForTimeout(300);
  await h.sheet().getByText("Tom Becker", { exact: true }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByText("Поговорили", { exact: true }).last().click();
  await h.sheet().getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  await h.expectText(/Без сети\. Сохранено, отправится позже/, "offline: the call is saved and queued");
  await h.expectText(/Tom Becker.*Поговорили/, "the call is in the list at once");
  const q1 = await queue(p);
  h.expect(q1.length === before + 1, `the call waits in the queue (${before} → ${q1.length})`);
  // «Отменить»: the call leaves the queue and the list (rule 5)
  await h.click("Отменить"); await p.waitForTimeout(500);
  h.expect((await queue(p)).length === before, "«Отменить»: the call left the queue");
  h.expect(!(await h.db()).activities.some((x) => x.kind === "call" && x.subjectId === "l3" && x.meta && x.meta.outcome === "answered" && x.at > new Date(Date.now() - 60000).toISOString()), "«Отменить»: the call is gone");
  // and once more, to keep
  await plus().click(); await p.waitForTimeout(400);
  await h.sheet().getByText("Записать звонок", { exact: true }).last().click(); await p.waitForTimeout(500);
  await h.sheet().getByPlaceholder("Лид или клиент").fill("Tom"); await p.waitForTimeout(300);
  await h.sheet().getByText("Tom Becker", { exact: true }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByText("Поговорили", { exact: true }).last().click();
  await h.sheet().getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  h.expect((await queue(p)).length === before + 1, "saved again: in the queue");

  // a task
  await go("Задачи");
  await plus().click(); await p.waitForTimeout(500);
  await h.sheet().getByPlaceholder("Клиент, лид, работа или адрес").fill("Sarah"); await p.waitForTimeout(300);
  await h.sheet().getByText("Sarah Mitchell", { exact: true }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByPlaceholder("Например: перезвонить и уточнить объём").fill("Offline task");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(600);
  await h.expectText(/Без сети\. Сохранено, отправится позже/, "offline: the task is saved and queued");
  await h.expectText(/Offline task/, "the task is in the list at once");
  const q2 = await queue(p);
  h.expect(q2.length === before + 2, `the task waits in the queue too (${q2.length})`);
  await h.shot("offline");
};
