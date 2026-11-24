/**
 * Client language (founder's rule 05.11.2026, docs/specs/07 §2.1): the company sets the default for client documents;
 * each person of a lead / client can have their own; the card shows it. The app's language does not change.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/company/documents");
  await h.expectText(/Язык документов для клиентов/, "company setting is there");
  await p.getByRole("radio", { name: "Español" }).last().click();
  await h.click("Сохранить");
  await p.waitForTimeout(400);
  let db = await h.db();
  h.expect(db.company.docLanguage === "es", "company default for client documents: Spanish");

  // a person's own language beats the company's: Tom Becker reads Russian
  const tom = db.leads.find((x) => x.name === "Tom Becker");
  await h.go(`/lead/${tom.id}`);
  // v2 (#2350): the lead's «Контакт» group — its main person's row opens the people sheet
  await p.getByTestId("lead-person-main").locator("visible=true").first().click();
  // «Язык · Любой ⌄» — a row with a menu (spec 56 §3а.3)
  await h.sheet().getByTestId("people-0-lang-button").click();
  await p.getByTestId("people-0-lang-ru").click();
  await p.getByRole("menu").waitFor({ state: "detached" });
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  const t2 = db.leads.find((x) => x.id === tom.id);
  h.expect(t2.people && t2.people[0].language === "ru", "main person: Russian");
  await h.expectText(/RU/, "language on the lead card");
  // the app itself stays in Russian
  await h.expectText(/Контакты клиента|Контакт/, "app language unchanged");
};
