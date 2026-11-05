/**
 * People of a lead (wave L2 part 2, docs/14-leads-spec.md §2, Р12): a second phone for the lead itself and a spouse with
 * their own phone, saved in one sheet; then the estimate makes the client (S3) and the people are the client's.
 */
exports.run = async (h) => {
  const p = h.page;
  const lead = async (name) => (await h.db()).leads.find((x) => x.name === name);

  await h.go("/inbox?tab=leads");
  let tom = await lead("Tom Becker");
  await h.go(`/lead/${tom.id}`);
  await h.expectText(/\(626\) 555-0108/, "main phone on the card");
  await h.expectText(/Только основной контакт/, "no other people yet");

  // one sheet: + phone for Tom, + spouse Ann with her phone
  await h.click("Телефоны, email и люди");
  await h.sheet().getByRole("button", { name: "Телефон", exact: true }).first().click();
  await h.sheet().getByPlaceholder("Телефон", { exact: true }).nth(1).pressSequentially("6265550199");
  await h.sheet().getByRole("button", { name: /Дополнительный контакт/ }).click();
  await h.sheet().getByPlaceholder("Имя", { exact: true }).last().fill("Ann Becker");
  await h.sheet().getByPlaceholder("Телефон", { exact: true }).nth(2).pressSequentially("6265550177");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(400);
  tom = await lead("Tom Becker");
  h.expect(tom.people && tom.people.length === 2, `two people: ${JSON.stringify(tom.people)}`);
  h.expect(tom.people[0].name === "Tom Becker" && tom.people[0].phones.map((x) => x.number).join() === "(626) 555-0108,(626) 555-0199", "Tom has two phones");
  h.expect(tom.phone === "(626) 555-0108", "the lead keeps the main phone for search");
  h.expect(tom.people[1].name === "Ann Becker" && tom.people[1].role === "spouse" && tom.people[1].phones[0].number === "(626) 555-0177", "spouse with her phone");
  await h.expectText(/\(626\) 555-0199/, "second phone on the card");
  await h.expectText(/Ann Becker/, "spouse on the card");

  // the spouse's phone finds this lead from the inbox search
  await h.go("/inbox?tab=leads");
  const search = p.getByPlaceholder("Имя, телефон, адрес, услуга");
  await search.fill("5550177");
  await p.waitForTimeout(300);
  h.expect((await p.getByRole("button", { name: "Tom Becker" }).count()) === 1, "search by the spouse's phone");
  await search.fill("");

  // estimate → prospect client: the people go with the lead (S3)
  await h.go(`/lead/${tom.id}`);
  await h.clickText("Сметы");
  await h.click("Смета");
  await p.waitForTimeout(500);
  const db = await h.db();
  tom = db.leads.find((x) => x.id === tom.id);
  const client = db.customers.find((c) => c.id === tom.customerId);
  h.expect(!!client && client.people && client.people.map((x) => x.name).join() === "Tom Becker,Ann Becker", "client has the lead's people");
  h.expect(client.people[0].phones.length === 2, "and both of Tom's phones");
  await h.go(`/client/${client.id}`);
  await h.expectText(/Ann Becker/, "spouse on the client card");
  await h.go(`/lead/${tom.id}`);
  await h.clickText("Обзор");
  await h.expectText(/Контакты клиента/, "the lead card shows the client's people");
  await h.shot("lead-people");
};
