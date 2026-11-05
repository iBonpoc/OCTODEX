/**
 * S9 / S9b (docs/specs/03 §7.3, §7.4; wave П3a): several people on one visit, «Назначить» and «Снять всех».
 * Both sides: the office ticks two people on the visit card → both are on the visit, the summary names both, the second
 * person (a tech) sees it in his day; «Снять всех» → the visit is «Не назначено» in the Plan, «Отменить» brings them back.
 * People do not change once the tech is on site. One yellow per screen and per sheet (rule 2).
 */
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  let db = await h.db();
  const me = db.me;
  const todayMine = () => db.visits.filter((x) => (x.assigneeIds?.length ? x.assigneeIds : x.techId ? [x.techId] : []).includes(me) && new Date(x.start).toDateString() === new Date().toDateString());
  const before = todayMine().length;
  h.expect(db.visits.find((x) => x.id === "v6").techId === null, "demo v6 has nobody yet");

  // the office: «Когда и кто» → «Назначить» → Ivan and me
  await h.go("/visit/v6");
  await p.getByRole("button", { name: "Назначить", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.expectText(/Кому назначить/, "the assign sheet");
  await expectOneAccent(h, "assign sheet", '[aria-modal="true"]');
  await h.sheet().getByText("Ivan Sokolov").click();
  await h.sheet().getByText("Alex Petrov").click();
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click(); await p.waitForTimeout(500);
  db = await h.db();
  let v = db.visits.find((x) => x.id === "v6");
  h.expect(JSON.stringify(v.assigneeIds) === JSON.stringify(["m-ivan", "m-alex"]) && v.techId === "m-ivan", `two people, the first is techId (${JSON.stringify(v.assigneeIds)})`);
  await h.expectText(/Ivan Sokolov, Alex Petrov/, "«Когда и кто» names both");

  // the second person sees the visit in his day (the other side of S9b)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/visits");
  db = await h.db();
  h.expect(todayMine().length === before + 1, "the visit counts for the second person");
  await h.expectText(new RegExp(`из ${before + 1}`), "the tech's day shows it");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));

  // «Снять всех»: nobody left → «Не назначено» in the Plan; «Отменить» brings both back
  await h.go("/visit/v6");
  await p.getByRole("button", { name: "Назначить", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Снять всех", exact: true }).click(); await p.waitForTimeout(500);
  db = await h.db();
  v = db.visits.find((x) => x.id === "v6");
  h.expect(v.techId === null && v.assigneeIds.length === 0, "everyone taken off");
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  v = db.visits.find((x) => x.id === "v6");
  h.expect(v.assigneeIds.length === 2, "undo: both are back");
  await h.go("/visit/v6");
  await p.getByRole("button", { name: "Назначить", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Снять всех", exact: true }).click(); await p.waitForTimeout(500);
  await h.go("/plan");
  await h.expectText(/Не назначено · \d/, "the visit is «Не назначено» in the Plan");

  // on site: people do not change (demo v4 is working)
  await h.go("/visit/v4");
  h.expect((await p.getByRole("button", { name: "Назначить", exact: true }).count()) === 0, "on site: no «Назначить»");
};
