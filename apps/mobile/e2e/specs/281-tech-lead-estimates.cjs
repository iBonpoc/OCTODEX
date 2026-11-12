/**
 * e2e 281 — a technician's lead: its estimates and a new one (#1138; the server's estimates_select / estimates_insert).
 * The bugs it guards (the demo): the lead card showed the tech every estimate of the lead and its client — a tap led to
 * «нет доступа»; «＋ Смета» on a lead where he has no visit let him save an estimate that then vanished behind «нет
 * доступа» (the server would not take it). Now the card lists only the estimates he may see; where he does not work, no
 * «＋ Смета», and the builder says the office makes it, its «Сохранить» off. The office sees and adds as before.
 * The demo seed, changed from a page without the app (h.seed): the tech's lead l4 at p7 (no visit of his there) with an
 * estimate made by another (e-281); the card opens on its «Сметы» tab.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const db = raw.db;
  const lead = db.leads.find((l) => l.id === "l4");
  Object.assign(lead, { propertyId: "p7", customerId: undefined, status: "booked" });
  const base = db.estimates.find((e) => e.id === "e2");
  db.estimates.push({ ...base, id: "e-281", leadId: "l4", propertyId: "p7", customerId: "c7", title: "Nightly 281 estimate", createdBy: "m-ivan" });
  await h.seed("octo.db.v5", raw);
  await h.seed("octo.leadTab.v2", "estimates");

  // the tech: no estimate of another, no «＋ Смета» where he does not work
  await h.seed("octo.role.v1", "tech");
  await h.go("/lead/l4");
  // the «Сметы» tab has drawn (its section, by testID) — then what is not in it is checked
  await p.getByTestId("lead-estimates").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("lead-estimate-e-281").count()) === 0, "the tech: the lead card has no estimate he may not see");
  h.expect((await p.getByTestId("lead-new-estimate").count()) === 0, "the tech: no «＋ Смета» where he has no visit");
  await h.shot("tech-lead");

  // the builder at that address: the office makes it — «Сохранить» off
  await h.go("/estimate/new?customerId=c7&propertyId=p7&leadId=l4");
  await p.getByTestId("ue-not-here").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect(await p.getByTestId("ue-save").first().getByRole("button").isDisabled(), "the tech: «Сохранить» is off where he does not work");

  // the office: the estimate is there, and «＋ Смета»
  await h.seed("octo.role.v1", "director");
  await h.go("/lead/l4");
  await p.getByTestId("lead-estimate-e-281").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("lead-new-estimate").count()) > 0, "the office: «＋ Смета» as before");
};
