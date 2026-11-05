/**
 * S4a / S9a (docs/specs/03 §4, §7.3, §7.4; wave П2): the office moves and cancels visits on the visit card.
 * Both sides: a move keeps the status; cancelling the last inspection sends the lead back to "In touch";
 * cancelling the only visit of a job makes the job wait for a date again. One yellow per screen (rule 2).
 */
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/inbox");
  let db = await h.db();
  const angela = db.leads.find((x) => x.name === "Angela Rossi");

  // book an inspection through the form
  await h.go(`/lead/${angela.id}`);
  await h.clickText("Задачи");
  await h.click("Что дальше?");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click(); await p.waitForTimeout(500);
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(300);
  db = await h.db();
  let v = db.visits.find((x) => x.leadId === angela.id);
  h.expect(v && db.leads.find((x) => x.id === angela.id).status === "booked", "inspection booked, lead booked");

  // «Когда и кто» on the visit card; move it to another day — the status stays
  await h.go(`/visit/${v.id}`);
  await h.expectText(/Когда и кто/, "when and who block for the office");
  await expectOneAccent(h, "visit card (office)");
  const before = v.start;
  await p.getByRole("button", { name: "Перенести", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("radio").nth(3).click();
  await h.sheet().getByRole("button", { name: "Перенести", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  v = db.visits.find((x) => x.id === v.id);
  h.expect(v.start !== before && v.step === "scheduled", `moved, status kept (${before} → ${v.start})`);
  h.expect(db.leads.find((x) => x.id === angela.id).status === "booked", "S4a: a move keeps the lead booked");

  // cancel the only inspection: the sheet says what happens; the lead goes back to "In touch"
  await p.getByRole("button", { name: "Отменить выезд", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.expectText(/Лид вернётся в «На связи»/, "the cancel sheet tells the consequence");
  await h.sheet().getByRole("button", { name: "Другое" }).click();
  h.expect(await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().isDisabled(), "«other» needs a text");
  await h.sheet().getByRole("button", { name: "Клиент отменил" }).click();
  await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().click(); await p.waitForTimeout(600);
  db = await h.db();
  h.expect(!db.visits.some((x) => x.id === v.id), "the cancelled visit leaves the Plan and the day");
  const gone = (db.cancelledVisits ?? []).find((x) => x.id === v.id);
  h.expect(gone && gone.cancelReason === "client_cancelled", "…but it is kept with its reason (§5.2)");
  h.expect(db.leads.find((x) => x.id === angela.id).status === "replied", "S4a: lead back to «На связи»");
  // the lead's feed shows the cancelled inspection with the reason
  await h.go(`/lead/${angela.id}`);
  await h.clickText("Переписка");
  await h.expectText(/Осмотр отменён: клиент отменил/, "the lead's feed keeps the cancelled inspection");

  // S9a: the only visit of a scheduled job (demo j2) — the job waits for a date again
  h.expect(db.jobs.find((j) => j.id === "j2").status === "scheduled" && db.visits.filter((x) => x.jobId === "j2").length === 1, "j2 has one visit");
  await h.go("/visit/v2");
  await p.getByRole("button", { name: "Отменить выезд", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.expectText(/Работа снова будет ждать даты/, "the cancel sheet tells the job consequence");
  await h.sheet().getByRole("button", { name: "Мы отменили" }).click();
  await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().click(); await p.waitForTimeout(600);
  db = await h.db();
  h.expect(db.jobs.find((j) => j.id === "j2").status === "unscheduled", "S9a: job waits for a date again");
  // «Отменить» in the toast (5 s) brings the visit and the job back
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(db.visits.some((x) => x.id === "v2") && db.jobs.find((j) => j.id === "j2").status === "scheduled", "undo: the visit and the job are back");

  // a visit already on site: no move, no cancel (demo v4 is working)
  await h.go("/visit/v4");
  h.expect((await p.getByRole("button", { name: "Отменить выезд", exact: true }).count()) === 0, "on site: no cancel");
  h.expect((await p.getByRole("button", { name: "Перенести", exact: true }).count()) === 0, "on site: no move");
};
