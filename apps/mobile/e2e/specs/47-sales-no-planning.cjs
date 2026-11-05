/**
 * Rights (docs/specs/03 §8.1; П3a security check): sales works leads and estimates but does not plan — no «Перенести»,
 * «Назначить», «Отменить выезд», no assigning in the Plan; it books an inspection without people («Назначит диспетчер»),
 * the office assigns. The server refuses the same (cancel_visit, assign_visit; db:T34, db:T35).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("sales")));
  await h.go("/inbox");
  await h.expectText(/Продажи|Лиды/, "sales lands on Sales");

  // a visit card: «Когда и кто» without the planning buttons
  await h.go("/visit/v1");
  for (const name of ["Перенести", "Назначить", "Отменить выезд"]) {
    h.expect((await p.getByRole("button", { name, exact: true }).count()) === 0, `sales: no «${name}»`);
  }
  // the Plan: to look at; no «Назначить» on unassigned visits
  await h.go("/plan");
  h.expect((await p.getByRole("button", { name: "Назначить", exact: true }).count()) === 0, "sales: no assigning in the Plan");

  // booking an inspection: no people to pick, the visit goes to the office
  let db = await h.db();
  const angela = db.leads.find((x) => x.name === "Angela Rossi");
  await h.go(`/lead/${angela.id}`);
  await h.clickText("Задачи");
  await h.click("Что дальше?");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).click(); await p.waitForTimeout(400);
  h.expect((await h.sheet().getByRole("button", { name: "Ivan Sokolov" }).count()) === 0, "sales: no person rows in the form");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click(); await p.waitForTimeout(600);
  db = await h.db();
  const v = db.visits.find((x) => x.leadId === angela.id);
  h.expect(v && v.techId === null && (v.assigneeIds ?? []).length === 0, `sales books without people (${JSON.stringify(v && v.assigneeIds)})`);
};
