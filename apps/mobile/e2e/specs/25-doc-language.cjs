/**
 * Client language (founder's rule 05.11.2026, docs/specs/07 §2.1): the company sets the default for client documents;
 * each person of a lead / client can have their own; the card shows it. The app's language does not change.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/company/profile");
  await h.expectText(/Язык документов для клиентов/, "company setting is there");
  await p.getByRole("radio", { name: "Español" }).last().click();
  await h.click("Сохранить");
  await p.waitForTimeout(400);
  let db = await h.db();
  h.expect(db.company.docLanguage === "es", "company default for client documents: Spanish");

  // a person's own language beats the company's: Tom Becker reads English
  const tom = db.leads.find((x) => x.name === "Tom Becker");
  await h.go(`/lead/${tom.id}`);
  await h.clickText("Обзор");
  await h.click("Телефоны, email и люди");
  await h.sheet().getByRole("radio", { name: "English" }).first().click();
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  const t2 = db.leads.find((x) => x.id === tom.id);
  h.expect(t2.people && t2.people[0].language === "en", "main person: English");
  await h.expectText(/EN/, "language on the lead card");
  // the app itself stays in Russian
  await h.expectText(/Телефоны, email и люди/, "app language unchanged");
};
