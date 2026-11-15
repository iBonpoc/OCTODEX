/**
 * e2e 281 — a technician's lead: its estimates and a new one (#1138; the server's estimates_select / estimates_insert).
 * The bugs it guards (the demo): the lead card showed the tech every estimate of the lead and its client — a tap led to
 * «нет доступа»; «＋ Смета» on a lead where he has no visit let him save an estimate that then vanished behind «нет
 * доступа» (the server would not take it). Now the card lists only the estimates he may see; where he does not work, no
 * «＋ Смета», and the builder says the office makes it — «Сохранить» stays active and, pressed, says so and saves
 * nothing. The office sees and adds as before.
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
  // a template with one line (тестовые): the builder opens with content, so «Сохранить» is not off for an empty estimate
  const doc = JSON.parse(JSON.stringify(db.estimates.find((e) => e.doc).doc));
  doc.options = [{ ...doc.options[0], lines: [{ id: "tl281", group: "service", name: "Nightly 281 line (тестовые)", quantity: "1", unit: "ea", unitPriceCents: 10000 }] }];
  db.estimateTemplates = [...(db.estimateTemplates || []), { id: "tpl281", name: "Nightly 281 template", doc }];
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

  // the builder at that address: the office makes it — the main button stays active (DS §11 п.3); pressed, it says
  // why and saves nothing (the director's review of #1169)
  await h.go("/estimate/new?template=tpl281&customerId=c7&propertyId=p7&leadId=l4");
  await p.getByTestId("ue-not-here").first().waitFor({ state: "visible", timeout: 15000 });
  const before = (await h.db()).estimates.length;
  await p.getByTestId("ue-save").first().getByRole("button").click();
  await p.getByText(/Смету по этому адресу составит офис/).last().waitFor({ state: "visible", timeout: 10000 });
  h.expect((await h.db()).estimates.length === before, "the tech: «Сохранить» saved no estimate where he does not work");
  h.expect(/\/estimate\/new/.test(p.url()), `the tech: still in the builder (${p.url()})`);

  // the office: the estimate is there, and «＋ Смета»
  await h.seed("octo.role.v1", "director");
  await h.go("/lead/l4");
  await p.getByTestId("lead-estimate-e-281").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("lead-new-estimate").count()) > 0, "the office: «＋ Смета» as before");
};
