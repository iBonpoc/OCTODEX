/**
 * Rights (docs/specs/03 §8.1; П3a security check): sales works leads and estimates but does not plan — no «Перенести»,
 * «Назначить», «Отменить выезд», no assigning in the Plan; it books an inspection without people («Назначит диспетчер»),
 * the office assigns. The server refuses the same (cancel_visit, assign_visit; db:T34, db:T35).
 */
exports.run = async (h) => {
  const p = h.page;
  const { escOnPage } = require("../sheet.cjs");
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("sales")));
  await h.go("/inbox");
  await h.expectText(/Продажи|Лиды/, "sales lands on Sales");

  const vis = (id) => p.getByTestId(id).locator("visible=true");
  // a visit card: «Когда и кто» without the planning steps (v2 #2350: the office's are rows `vw-reschedule` / `vw-assign` and
  // the «⋯» of the visit; sales gets none of them)
  await h.go("/visit/v1");
  await vis("visit-screen").first().waitFor({ timeout: 8000 });
  for (const id of ["vw-reschedule", "vw-assign"]) h.expect((await vis(id).count()) === 0, `sales: no «${id}»`);
  // optional: the visit may have no «⋯» for sales at all (nothing of the office's in it) — then there is nothing to look into
  if (await vis("visit-screen-more").count()) {
    await vis("visit-screen-more").first().click();
    await vis("menu-items").first().waitFor({ timeout: 3000 });
    const items = (await vis("menu-items").first().innerText()).replace(/\n/g, " | ");
    for (const name of ["Перенести", "Назначить", "Отменить выезд"]) h.expect(!items.includes(name), `sales: no «${name}» in «⋯» (${items})`);
    await escOnPage(p);
  }
  for (const name of ["Перенести", "Назначить", "Отменить выезд"]) {
    h.expect((await p.getByRole("button", { name, exact: true }).count()) === 0, `sales: no «${name}»`);
  }
  // the Plan: to look at; no «Назначить» on unassigned visits
  await h.go("/plan");
  h.expect((await p.getByRole("button", { name: "Назначить", exact: true }).count()) === 0, "sales: no assigning in the Plan");

  // booking an inspection: no people to pick, the visit goes to the office (v2: the lead's «＋» → «Записать на оценку»)
  let db = await h.db();
  const angela = db.leads.find((x) => x.name === "Angela Rossi");
  await h.go(`/lead/${angela.id}`);
  await vis("lead-screen-create").first().click();
  await vis("lead-create-book").first().click();
  await h.sheet().waitFor({ timeout: 5000 });
  h.expect((await h.sheet().getByRole("option", { name: "Ivan Sokolov" }).count()) === 0, "sales: no person rows in the form");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "{}")?.db?.visits?.some((x) => x.leadId === id), angela.id, { timeout: 5000 });
  db = await h.db();
  const v = db.visits.find((x) => x.leadId === angela.id);
  h.expect(v && v.techId === null && (v.assigneeIds ?? []).length === 0, `sales books without people (${JSON.stringify(v && v.assigneeIds)})`);
};
