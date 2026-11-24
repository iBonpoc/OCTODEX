/**
 * 17-job §11.1 (PR 3b-1, «Работы и выезды» №5): a job of a client «Не обслуживаем» offers no new visit and no estimate
 * (no «Запланировать работу» / «Ещё один выезд», no «＋», /job/schedule says why); the visit already set is finished
 * as usual. «Позвонить» on a job writes the call on the job; «Написать» opens «Новое сообщение» to the client;
 * «В пути» of a visit is a line in the job's «История».
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const { objSection } = require("../objectScreen.cjs");
exports.run = async (h) => {
  const p = h.page;
  // v2 (#2350, the Object template): «＋» of the job's header (`job-screen-create`) makes its visit and estimate; the sections
  // strip `job-screen-sections-<key>`; the quick actions `job-call` / `job-write`
  const plusItems = async () => {
    const plus = p.getByTestId("job-screen-create").locator("visible=true");
    if (!(await plus.count())) return [];
    await plus.first().getByRole("button").first().click();
    await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ timeout: 3000 });
    const ids = await p.getByTestId("menu-items").locator("visible=true").first().locator("[data-testid]").evaluateAll((e) => e.map((x) => x.dataset.testid));
    await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
    return ids;
  };
  const visits = async () => {
    await objSection(p, "job-screen", "visits");
    return p.getByRole("button", { name: /^(Ещё один выезд|Запланировать работу)$/ }).locator("visible=true").count();
  };
  const patch = (fn) => p.evaluate(fn);

  // an ordinary job: «＋ → Выезд / Смета» and «Ещё один выезд» / «Запланировать работу» are there
  await h.go("/job/j3");
  await h.expectText(/Drywall patch/, "the job opens");
  const ids0 = await plusItems();
  h.expect(ids0.includes("job-create-estimate") && ids0.includes("job-create-visit"), `an ordinary job: «＋» makes a visit and an estimate (${ids0})`);
  h.expect((await visits()) >= 1, "an ordinary job can be planned");

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
  h.expect((await visits()) === 0, "no new visit from the job");
  const ids1 = await plusItems();
  h.expect(!ids1.includes("job-create-estimate") && !ids1.includes("job-create-visit"), `no new estimate or visit on the job (${ids1})`);
  await h.shot("job");
  await h.go("/job/schedule?jobId=j3");
  await h.expectText(/новых выездов и смет нет/, "/job/schedule refuses");
  h.expect((await p.getByRole("button", { name: /Сохранить|Запланировать/ }).count()) === 0, "no form to save");
  await h.go("/visit/v3");
  await h.expectText(/Linda Alvarez/, "the set visit still opens");

  // «Позвонить» on a job: the call is written on the job
  await h.go("/job/j1");
  await p.getByTestId("job-call").locator("visible=true").first().click();
  await h.expectText(/Записать звонок/, "after «Позвонить» — the call sheet");
  await h.sheet().getByText("Поговорили", { exact: true }).last().click();
  await h.sheet().getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  const a = (await h.db()).activities.find((x) => x.kind === "call" && x.subjectType === "job" && x.subjectId === "j1");
  h.expect(a && a.meta.outcome === "answered", "the call is on the job");

  // «SMS»: «Новое сообщение» to the client
  await p.getByTestId("job-write").locator("visible=true").first().click();
  await h.expectText(/Новое сообщение/, "«SMS» opens the messages sheet");
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
  await objSection(p, "job-screen", "notes");
  await h.expectText(/В пути/, "«В пути» is in the job's history");
  await h.shot("history");
};
