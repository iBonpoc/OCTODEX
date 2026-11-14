/**
 * 17-job §11.1 (PR 3b-1, «Работы и выезды» №5): a job of a client «Не обслуживаем» offers no new visit and no estimate
 * (no «Запланировать работу» / «Ещё один выезд», no «＋», /job/schedule says why); the visit already set is finished
 * as usual. «Позвонить» on a job writes the call on the job; «Написать» opens «Новое сообщение» to the client;
 * «В пути» of a visit is a line in the job's «История».
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const plus = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');
  const patch = (fn) => p.evaluate(fn);

  // an ordinary job: «＋» and «Ещё один выезд» / «Запланировать работу» are there
  await h.go("/job/j3");
  await h.expectText(/Drywall patch/, "the job opens");
  h.expect((await plus().count()) === 1, "an ordinary job has «＋»");
  h.expect((await p.getByRole("button", { name: /^(Ещё один выезд|Запланировать работу)$/ }).count()) >= 1, "an ordinary job can be planned");

  // Linda (c3) becomes «Не обслуживаем»
  await patch(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === "c3" ? { ...c, status: "do_not_service", statusReason: "Did not pay twice" } : c));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/job/j3");
  await h.expectText(/новых выездов и смет нет/, "the job says the client is not served");
  await h.expectText(/Назначенный выезд можно доделать или перенести/, "and that the set visit is finished as usual");
  h.expect((await p.getByRole("button", { name: /^(Ещё один выезд|Запланировать работу)$/ }).count()) === 0, "no new visit from the job");
  h.expect((await plus().count()) === 0, "no «＋» (visit / estimate) on the job");
  await h.shot("job");
  await h.go("/job/schedule?jobId=j3");
  await h.expectText(/новых выездов и смет нет/, "/job/schedule refuses");
  h.expect((await p.getByRole("button", { name: /Сохранить|Запланировать/ }).count()) === 0, "no form to save");
  await h.go("/visit/v3");
  await h.expectText(/Linda Alvarez/, "the set visit still opens");

  // «Позвонить» on a job: the call is written on the job
  await h.go("/job/j1");
  await p.getByRole("button", { name: "Позвонить", exact: true }).first().click(); await p.waitForTimeout(500);
  await h.expectText(/Записать звонок/, "after «Позвонить» — the call sheet");
  await h.sheet().getByText("Поговорили", { exact: true }).last().click();
  await h.sheet().getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  const a = (await h.db()).activities.find((x) => x.kind === "call" && x.subjectType === "job" && x.subjectId === "j1");
  h.expect(a && a.meta.outcome === "answered", "the call is on the job");

  // «Написать»: «Новое сообщение» to the client
  await p.getByRole("button", { name: "Написать", exact: true }).first().click(); await p.waitForTimeout(500);
  await h.expectText(/Новое сообщение/, "«Написать» opens the messages sheet");
  await h.expectText(/Sarah Mitchell/, "to the client");
  await h.shot("message");
  await pressEscUntilClosed(p);

  // «В пути» in «История»
  await patch(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.visits = s.db.visits.map((v) => (v.id === "v1" ? { ...v, step: "en_route", enRouteAt: new Date(Date.now() - 600000).toISOString() } : v));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/job/j1");
  await p.getByRole("tab", { name: "История", exact: true }).locator("visible=true").click(); await p.waitForTimeout(400);
  await h.expectText(/В пути/, "«В пути» is in the job's history");
  await h.shot("history");
};
