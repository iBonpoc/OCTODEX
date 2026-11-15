/**
 * Handoffs S3 → S5 → S6 → S7 → S8 in one flow, checking BOTH sides of every handoff (docs/15-story-map.md §4):
 * lead → estimate from the lead (prospect client + property appear) → sent (lead "estimate sent") → client opens the
 * page → signs (estimate approved, lead won by approval, client active, job waits for a date, deposit invoice)
 * → pays the deposit (payment with a receipt).
 */
/** S8b (docs/specs/07 §2.2 А, founder 05.11): an employee signs the contract for the company on the estimate screen. */
async function countersign(h, estimateId) {
  await h.go(`/estimate/${estimateId}`);
  const pad = h.page.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded(); await h.page.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await h.page.mouse.move(bb.x + 30, bb.y + 90); await h.page.mouse.down();
  for (let i = 0; i < 20; i++) await h.page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await h.page.mouse.up();
  await h.page.getByRole("button", { name: "Подписать договор" }).last().click(); await h.page.waitForTimeout(700);
}

exports.run = async (h) => {
  await h.go("/inbox");
  await h.page.getByText("Kevin Brooks", { exact: true }).first().click(); await h.page.waitForTimeout(700);
  let db = await h.db();
  const lead0 = db.leads.find((l) => l.name === "Kevin Brooks");
  h.expect(lead0 && !["won", "lost", "declined"].includes(lead0.status), "Kevin is an open lead");

  // S5: estimate from the lead (S3: prospect client + property are created for it)
  await h.clickText("Сметы");
  await h.click("Смета");
  await require("../estimateLine.cjs").addCustom(h, "Replace water heater", "1850");

  // S6: sent (the link goes to the client when it is copied / shared)
  await h.page.getByRole("button", { name: "Сохранить и отправить" }).click(); await h.page.waitForTimeout(700);
  await h.page.getByRole("button", { name: "Копировать ссылку" }).click(); await h.page.waitForTimeout(400);
  db = await h.db();
  const lead = db.leads.find((l) => l.id === lead0.id);
  const cust = db.customers.find((c) => c.id === lead.customerId);
  const prop = db.properties.find((p) => p.id === lead.propertyId);
  h.expect(cust && cust.status === "prospect", "S3: lead has a prospect client");
  h.expect(cust.phone === lead.phone && cust.name === lead.name, "S3: client takes the lead's name and phone");
  h.expect(prop && prop.customerId === cust.id, "S3: a property of that client");
  h.expect(db.customers.filter((c) => c.phone === lead.phone && c.id !== cust.id && c.name === lead.name).length === 0, "S3: no duplicate client");
  const est = db.estimates.find((e) => e.leadId === lead.id);
  h.expect(est && est.customerId === cust.id && est.propertyId === prop.id, "S5: the estimate belongs to the lead, its client and property");
  h.expect(est.status === "sent" && !!est.sentAt && !!est.token, "S6: estimate is sent and has a client link");
  h.expect(lead.status === "estimate_sent", "S6: lead → estimate sent");

  // S7: the client opens the page
  await h.go(`/p/${est.token}`);
  await h.expectText(/Replace water heater/, "client sees the line");
  // S7 "viewed" is set by the server (supabase/tests T8); the demo page on the same device does not mark it, and there is
  // no "opened N times" counter yet — gap recorded in docs/15-story-map.md §4.

  // S8: signs
  await h.sign("Kevin Brooks");
  await h.expectText(/Estimate approved/, "approved on the client page (in the client's language, rule 7)");
  db = await h.db();
  h.expect(db.estimates.find((e) => e.id === est.id).status === "awaiting_countersign", "S8: the client signed, awaiting the company");
  h.expect(!db.jobs.some((j) => j.estimateId === est.id), "S8: no job before the company signs");
  h.expect(db.leads.find((l) => l.id === lead.id).status !== "won", "S8: lead not won before the company signs");
  // S8b: an employee signs for the company
  await countersign(h, est.id);
  db = await h.db();
  const e2 = db.estimates.find((e) => e.id === est.id);
  const l2 = db.leads.find((l) => l.id === lead.id);
  const c2 = db.customers.find((c) => c.id === cust.id);
  const job = db.jobs.find((j) => j.estimateId === est.id);
  h.expect(e2.status === "approved", "S8: estimate approved");
  h.expect(l2.status === "won" && l2.wonVia === "approval", "S8: lead won by approval");
  h.expect(c2.status === "active", "S8: client active");
  h.expect(job && job.status === "unscheduled" && job.propertyId === prop.id, "S8: job waits for a date, on the lead's property");
  h.expect(!db.visits.some((v) => v.jobId === job.id), "S8: no visit until a date is picked");
  const dep = db.invoices.find((i) => i.jobId === job.id && i.kind === "deposit");
  if (e2.depositCents > 0) h.expect(!!dep && dep.totalCents === e2.depositCents, "S8: deposit invoice for the estimate's deposit");
  else h.expect(!dep, "S8: no deposit invoice when the estimate has no deposit");
};
