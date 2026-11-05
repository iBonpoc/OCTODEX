const { expectOneAccent } = require("../accent.cjs");
/**
 * S4 (docs/specs/03-visit-and-plan.md §1, wave П1): an inspection is a visit of the lead at the property, WITHOUT a job.
 * Both sides: the lead goes to "booked", a prospect client + property appear once (S3), the visit carries lead and
 * property, no job is made; it shows in the Plan and its card opens with "‹ Plan" above it.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/inbox");
  let db = await h.db();
  const angela = db.leads.find((x) => x.name === "Angela Rossi");
  h.expect(angela && !angela.customerId && angela.status === "new", "Angela is a new lead without a client");
  const jobs0 = db.jobs.length;
  const visits0 = db.visits.length;

  await h.go(`/lead/${angela.id}`);
  await h.clickText("Задачи");
  await h.click("Что дальше?");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).click(); await p.waitForTimeout(400);
  await expectOneAccent(h, "the visit form");
  await h.sheet().getByRole("button", { name: "Ivan Sokolov" }).click();
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click(); await p.waitForTimeout(600);
  // «Сообщить клиенту?»: a ready text; copying it marks the visit as told (nothing is sent by us)
  await h.expectText(/Сообщить клиенту\?/, "notify sheet after booking");
  await h.sheet().getByRole("button", { name: "Скопировать" }).click(); await p.waitForTimeout(400);

  db = await h.db();
  const lead = db.leads.find((x) => x.id === angela.id);
  const v = db.visits.find((x) => x.leadId === angela.id);
  h.expect(lead.status === "booked", "lead side: booked");
  h.expect(!!lead.customerId && !!lead.propertyId, "S3: the lead got its prospect client and property");
  h.expect(v && v.kind === "inspection" && !v.jobId && v.propertyId === lead.propertyId, `visit side: an inspection at the property without a job (${JSON.stringify(v && { kind: v.kind, jobId: v.jobId })})`);
  h.expect(v.techId === "m-ivan", "the picked tech");
  h.expect(!!v.customerNotifiedAt, "the client was told (copy pressed)");
  h.expect(db.jobs.length === jobs0, `no job is made for an inspection (${jobs0} → ${db.jobs.length})`);
  h.expect(db.visits.length === visits0 + 1, "exactly one new visit");

  // the visit card opens; up is the Plan (an inspection has no job)
  await h.go(`/visit/${v.id}`);
  await h.expectText(/Angela Rossi/, "the inspection card shows the client");
  await h.expectText(/План/, "up to the Plan");

  // S10: on site the inspection ends with "Done" — no work, signature or payment
  await p.getByRole("button", { name: /в пути/i }).last().click(); await p.waitForTimeout(400);
  await p.getByRole("button", { name: /На месте/ }).last().click(); await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Готово", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  const done = db.visits.find((x) => x.id === v.id);
  h.expect(done.step === "done" && done.closed, `inspection done and closed (${done.step})`);
  h.expect(!db.invoices.some((i) => i.jobId === undefined && i.customerId === lead.customerId && i.kind === "final"), "no invoice for an inspection");
};
