/**
 * Wave 3a: the job screen (docs/specs/13 §3.4, 17-job §7.1) — «Работа JOB-0001», «Связано», Детали · Деньги · История.
 * - Детали: the action row goes by the next open visit (Начать → the visit);
 * - Деньги: the office sees «Прибыль»; the technician sees «К оплате» and no profit;
 * - История: a note added at the bottom shows under «Заметки», not under «Звонки».
 */
const { atMinute, todayKey } = require("../companyTime.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  await h.go("/visits");
  const db = await h.db();
  const job = db.jobs.find((j) => j.id === "j2");
  await p.evaluate((v) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [...raw.db.visits.filter((x) => x.jobId !== v.jobId), v];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, { id: "e2e63", jobId: job.id, propertyId: job.propertyId, kind: "install", techId: db.me, assigneeIds: [db.me], start: atMinute(todayKey(), 23 * 60), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 });

  await setRole(h, "director");
  await h.go(`/job/${job.id}`);
  await h.expectText(new RegExp(`Работа ${job.number}`), "header «Работа JOB-…»");
  for (const tab of ["Детали", "Деньги", "История"]) h.expect((await p.getByRole("tab", { name: tab, exact: true }).locator("visible=true").count()) === 1, `tab «${tab}»`);
  await h.expectText(/Расписание[\s\S]*Ближайший выезд/, "Детали: the next visit");
  await h.shot("details");

  // Деньги: the office sees the profit
  await p.getByRole("tab", { name: "Деньги", exact: true }).locator("visible=true").click();
  await h.expectText(/Прибыль/, "office: profit on «Деньги»");
  await h.shot("money");

  // История: add a note → it is under «Заметки», not under «Звонки»
  await p.getByRole("tab", { name: "История", exact: true }).locator("visible=true").click();
  await p.getByPlaceholder("Собака во дворе, где парковаться…").locator("visible=true").fill("Ключ у соседа");
  await h.click("Добавить заметку");
  await p.getByRole("tab", { name: "Заметки", exact: true }).locator("visible=true").click();
  await h.expectText(/Заметка[\s\S]*Ключ у соседа/, "the note in the history under «Заметки»");
  h.expect((await p.getByText("Ключ у соседа").locator("visible=true").count()) === 1, "the note is shown once (no second notes list)");
  await p.getByRole("tab", { name: "Звонки", exact: true }).locator("visible=true").click();
  await h.expectText(/Событий пока нет/, "no calls on this job");
  h.expect(!/Ключ у соседа/.test(await h.text()), "«Звонки» does not show notes");
  await h.shot("history");

  // the technician: «К оплате», no profit; «Начать» opens his visit
  await setRole(h, "tech");
  await h.go(`/job/${job.id}`);
  await p.getByRole("tab", { name: "Деньги", exact: true }).locator("visible=true").click();
  await h.expectText(/К оплате/, "tech: «К оплате»");
  h.expect(!/Прибыль/.test(await h.text()), "tech: no profit");
  await p.getByRole("tab", { name: "Детали", exact: true }).locator("visible=true").click();
  await h.click("Начать");
  await p.waitForTimeout(600);
  h.expect(path(h) === "/visit/e2e63", `«Начать» → the next visit (${p.url()})`);
};
