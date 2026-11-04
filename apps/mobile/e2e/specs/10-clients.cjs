/** Clients: new client by hand → active with a property → found by search; filters count; each client a card. */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/clients");
  const before = await h.db();
  const active = before.customers.filter((c) => c.status !== "prospect").length;
  await h.expectText(new RegExp(`Все · ${active}`), "All filter count");

  // Create is disabled until name + phone + address.
  await h.click("Новый клиент");
  const create = p.getByRole("button", { name: "Создать клиента" }).last();
  h.expect(await create.isDisabled(), "create disabled when empty");
  await p.getByPlaceholder("Имя", { exact: true }).last().fill("Tom Becker");
  await p.getByPlaceholder("(555) 555-0100").last().fill("(626) 555-0199");
  await p.getByPlaceholder("Улица, дом, офис").last().fill("77 Lake Ave");
  await p.getByPlaceholder("Pasadena, CA 91103").last().fill("Pasadena, CA 91101");
  await h.clickText("Google");
  await create.click();
  await p.waitForTimeout(500);
  await h.expectText(/Tom Becker/, "client page opened");
  await h.shot("created");

  const db = await h.db();
  const c = db.customers.find((x) => x.name === "Tom Becker");
  h.expect(c && c.status === "active" && c.source === "Google" && c.phone === "(626) 555-0199", "client saved as active with source");
  const prop = db.properties.find((x) => x.customerId === c.id);
  h.expect(prop && prop.address === "77 Lake Ave" && prop.city === "Pasadena, CA 91101", "property saved");

  // List: count +1, search by phone digits and by address.
  await h.go("/clients");
  await h.expectText(new RegExp(`Все · ${active + 1}`), "All count grew");
  await p.getByPlaceholder("Имя, телефон или адрес").fill("5550199");
  await p.waitForTimeout(300);
  h.expect((await p.getByRole("button", { name: "Tom Becker" }).count()) === 1, "found by phone");
  await p.getByPlaceholder("Имя, телефон или адрес").fill("lake ave");
  await p.waitForTimeout(300);
  h.expect((await p.getByRole("button", { name: "Tom Becker" }).count()) === 1, "found by address");
  await p.getByPlaceholder("Имя, телефон или адрес").fill("");

  // Filters: «Должны» lists only clients with a balance; Tom (no invoices) is not there.
  await p.getByText(/^Должны · \d+$/).last().click();
  await p.waitForTimeout(300);
  h.expect((await p.getByRole("button", { name: "Tom Becker" }).count()) === 0, "new client does not owe");
  await h.shot("owes");
};
