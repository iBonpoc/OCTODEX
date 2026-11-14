/**
 * Wave 4 (docs/specs/13-app-structure.md §3.3 «Изменить»): one form — first name, last name, company; the main person's
 * phones («+ Номер») and email; source; the billing address (one per client, default = the property). Saved offline
 * with «Отменить»; the client card shows the new name and the billing row.
 */
exports.run = async (h) => {
  const p = h.page;
  const field = (ph) => p.getByPlaceholder(ph, { exact: true }).last();
  await h.go("/clients");
  const db0 = await h.db();
  const david = db0.customers.find((c) => c.id === "c2");
  const src0 = db0.sources.find((s) => s.id === david.sourceId);

  await h.go("/client/edit?id=c2");
  // an old client with only a name: the form splits it
  h.expect((await field("Имя").inputValue()) === "David", `first name from the name (${await field("Имя").inputValue()})`);
  h.expect((await field("Фамилия").inputValue()) === "Kim", `last name from the name (${await field("Фамилия").inputValue()})`);
  await field("Если клиент — фирма").fill("Kim Remodeling");

  // name is required: no first, last or company → save disabled
  const save = p.getByRole("button", { name: "Сохранить", exact: true }).last();
  await field("Имя").fill("");
  await field("Фамилия").fill("");
  await field("Если клиент — фирма").fill("");
  h.expect(await save.isDisabled(), "save needs a name or a company");
  await h.expectText(/Нужно имя или компания/, "the form says why");
  await field("Имя").fill("David");
  await field("Фамилия").fill("Kim");
  await field("Если клиент — фирма").fill("Kim Remodeling");

  // + Номер: a second phone of the main person
  await h.click("Номер");
  await p.getByPlaceholder("(555) 555-0100").last().fill("(818) 555-0177");

  // source
  await p.getByRole("button", { name: new RegExp(src0 ? src0.name : "Выберите источник") }).last().click(); await p.waitForTimeout(300);
  await h.sheet().getByText("Google", { exact: true }).click(); await p.waitForTimeout(300);

  // billing: another address
  await p.getByRole("radio", { name: "Другой адрес" }).click();
  await p.waitForTimeout(200);
  h.expect(await save.isDisabled(), "another address needs a street and a city");
  await field("Улица и дом").fill("PO Box 4512");
  await field("Город").fill("Sherman Oaks");
  await field("91103").fill("91413");
  await h.shot("form");
  await save.click();
  await p.waitForTimeout(600);

  const db = await h.db();
  const c = db.customers.find((x) => x.id === "c2");
  h.expect(c.firstName === "David" && c.lastName === "Kim" && c.companyName === "Kim Remodeling" && c.name === "David Kim", `name parts saved: ${JSON.stringify([c.firstName, c.lastName, c.companyName, c.name])}`);
  h.expect(c.people[0].phones.map((x) => x.number).includes("(818) 555-0177") && c.people[0].phones.length === 2, `second phone saved: ${JSON.stringify(c.people[0].phones)}`);
  h.expect(c.people[0].phones[0].primary === true, "the first phone stays primary");
  h.expect(c.sourceId === "src-google", `source saved (${c.sourceId})`);
  h.expect(c.billing && c.billing.line1 === "PO Box 4512" && c.billing.city === "Sherman Oaks" && c.billing.zip === "91413", `billing saved: ${JSON.stringify(c.billing)}`);

  // the card shows the billing address in its row
  await h.go("/client/c2");
  const rows = (await p.getByTestId("client-billing").locator("visible=true").first().innerText()).replace(/\s+/g, " ");
  h.expect(/Адрес для счетов\s*PO Box 4512, Sherman Oaks, CA 91413/.test(rows), `billing row (${rows})`);
  await h.expectText(/\(818\) 555-0177/, "the new phone in the contacts");

  // «Без налога» (П-2a): a switch with the certificate; the card shows the label
  await h.go("/client/edit?id=c2");
  await p.getByRole("switch", { name: "Без налога" }).click();
  await field("Например, № сертификата перепродажи").fill("RC-4512");
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await p.waitForTimeout(600);
  const ce = (await h.db()).customers.find((x) => x.id === "c2");
  h.expect(ce.taxExempt === true && ce.taxExemptNote === "RC-4512", `tax exempt saved: ${JSON.stringify([ce.taxExempt, ce.taxExemptNote])}`);
  await h.go("/client/c2");
  await h.expectText(/Без налога/, "label «Без налога» on the card");

  // back to «same as the property»: billing cleared
  await h.go("/client/edit?id=c2");
  await p.getByRole("radio", { name: "Как у объекта" }).click();
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await p.waitForTimeout(600);
  h.expect(!(await h.db()).customers.find((x) => x.id === "c2").billing, "billing cleared = the property address");

  // the form is the office's: the tech does not open it by address (the server refuses his update)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/client/edit?id=c2");
  h.expect((await p.getByPlaceholder("Фамилия", { exact: true }).count()) === 0, "tech: no client form");
};
