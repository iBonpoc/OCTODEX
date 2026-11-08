/**
 * Wave 4b-2 «Импорт из CSV» (docs/specs/13-app-structure.md §3.16, 15-flows §1.13, 04 §12.5): Клиенты → «…» →
 * «Импорт из CSV» → file → columns guessed from the headers (changeable) → «Добавим N, пропустим M» with every skipped
 * row and why (a client already there by phone or email, a repeat in the file, no way to reach them) → import →
 * the result on the screen (04 §14, the server's answers; demo — the same rule on the phone) → the clients are
 * `active` in the list (once, even on a double tap); «Отменить» takes the whole import back with the properties;
 * without the network the import button is off. The tech and sales have no import (04 §14.4).
 */
const CSV = [
  "First Name,Last Name,Company,Mobile Phone,Email,Street Address,City",
  "Ann,Lee,,(310) 555-7001,ann@lee.test,7 Palm Ave,Pasadena",
  'Sara,M,,626.555.0142,,"1 Main St, Apt 2",Pasadena', // Sarah Mitchell's phone — already a client
  "Ann,L,,+1 310 555 7001,,,", // the same phone again in the file
  "No,Contact,,,,9 Nowhere,LA", // no phone, no email
  ',,"Ray Roofing, LLC",,bob@ray.test,5 Oak St,Glendale', // a company with an email only
].join("\r\n");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/clients");
  const before = (await h.db()).customers.length;
  await p.getByRole("button", { name: "Ещё действия" }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Импорт из CSV" }).click(); await p.waitForTimeout(600);
  h.expect(p.url().includes("/client/import"), `«…» → «Импорт из CSV» opens the import (${p.url()})`);
  h.expect((await p.getByRole("button", { name: /^Импортировать/ }).count()) === 0, "nothing to import before a file");

  const chooser = p.waitForEvent("filechooser");
  await p.getByRole("button", { name: "Выбрать файл CSV" }).click();
  await (await chooser).setFiles({ name: "clients.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
  await p.waitForTimeout(800);
  await h.expectText(/clients\.csv · строк: 5/, "the file is read");
  await h.expectText(/Добавим 2, пропустим 3/, "the check: 2 to add, 3 skipped");
  await h.expectText(/Уже есть клиент: Sarah Mitchell/, "a client already there by phone");
  await h.expectText(/Повтор в файле: Ann Lee/, "a repeat inside the file");
  await h.expectText(/Нет ни телефона, ни email/, "a row with no way to reach them");
  // the columns were guessed from the headers; a column can be taken off
  h.expect(/Mobile Phone/.test(await h.text()), "phone ← «Mobile Phone»");
  await p.getByRole("button", { name: "Город", exact: true }).click(); await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Нет в файле" }).click(); await p.waitForTimeout(300);
  await h.expectText(/Город \| Нет в файле/, "the city column taken off");
  await h.shot("check");

  // a double tap imports once (review #199): two clicks in the same moment
  await p.getByRole("button", { name: "Импортировать (2)" }).evaluate((el) => { el.click(); el.click(); });
  await p.getByTestId("import-result").locator("visible=true").first().waitFor({ timeout: 5000 });
  await h.expectText(/Готово: добавлено 2, возможных дублей 0, пропущено 3/, "the result on the screen");
  await h.expectText(/Добавлено 2, пропущено 3/, "the toast says what happened");
  // the store writes the phone's copy a moment after the change: wait for what is checked (CHECKS §9)
  let db = await h.db();
  for (let i = 0; i < 40 && db.customers.length < before + 2; i++) { await p.waitForTimeout(150); db = await h.db(); }
  const ann = db.customers.find((c) => c.name === "Ann Lee");
  const ray = db.customers.find((c) => c.name === "Ray Roofing, LLC");
  h.expect(db.customers.length === before + 2, `two clients added (${db.customers.length - before})`);
  h.expect(ann && ann.status === "active" && ann.phone === "(310) 555-7001" && ann.email === "ann@lee.test", "Ann Lee: active, phone and email");
  h.expect(ann && ann.firstName === "Ann" && ann.lastName === "Lee", "Ann Lee: name parts kept");
  h.expect(ray && ray.status === "active" && ray.email === "bob@ray.test" && ray.companyName === "Ray Roofing, LLC", "the company with an email only");
  const annProp = db.properties.find((x) => x.customerId === ann.id);
  h.expect(annProp && annProp.address === "7 Palm Ave" && annProp.city === "", `Ann's property, the city column was off (${annProp && annProp.city})`);
  await p.getByRole("button", { name: "К клиентам" }).click(); await p.waitForTimeout(600);
  h.expect(/\/clients$/.test(p.url()), `«К клиентам» (${p.url()})`);
  await h.expectText(/Ann Lee/, "Ann in the list");

  // «Отменить» takes the whole import back
  await p.getByRole("button", { name: "Отменить" }).last().click();
  await h.expectText(/Импорт отменён: снято клиентов 2/, "the toast says the import was undone");
  db = await h.db();
  for (let i = 0; i < 40 && db.customers.length !== before; i++) { await p.waitForTimeout(150); db = await h.db(); }
  h.expect(db.customers.length === before && !db.customers.some((c) => c.name === "Ann Lee"), "undo: the import is gone");
  h.expect(!db.properties.some((x) => x.customerId === ann.id || x.customerId === ray.id), "undo: their properties are gone too");
  const queued = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.queue.v1") || "[]"));
  h.expect(queued.length === 0, `undo: nothing left in the queue (${queued.length})`);

  // no network: the file is checked, the import button is off and says why
  await h.go("/settings");
  await p.getByRole("switch", { name: "Проверка: режим без сети" }).click(); await p.waitForTimeout(300);
  const wide = h.layout.width > 390;
  // in-app navigation keeps the offline switch (a page load would reset it): settings → back → the Clients tab
  if (!wide) { await p.getByTestId("back-more").locator("visible=true").first().click(); await p.waitForTimeout(600); }
  await p.getByTestId(wide ? "side-clients" : "tab-clients").locator("visible=true").first().click(); await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Ещё действия" }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Импорт из CSV" }).click(); await p.waitForTimeout(600);
  const chooser2 = p.waitForEvent("filechooser");
  await p.getByRole("button", { name: "Выбрать файл CSV" }).click();
  await (await chooser2).setFiles({ name: "clients.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
  await p.waitForTimeout(800);
  await h.expectText(/Нужна сеть/, "offline: says the network is needed");
  h.expect(await p.getByRole("button", { name: "Импортировать (2)" }).isDisabled(), "offline: the import button is off");

  // sales: no «…» any more (was: everyone but the tech; 04 §14.4)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("sales")));
  await h.go("/clients");
  h.expect((await p.getByRole("button", { name: "Ещё действия" }).count()) === 0, "sales: no «…» on the clients");
  await h.go("/client/import");
  h.expect((await p.getByRole("button", { name: "Выбрать файл CSV" }).count()) === 0, "sales: the import does not open");

  // the tech: no «…», no import by address
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/clients");
  h.expect((await p.getByRole("button", { name: "Ещё действия" }).count()) === 0, "tech: no «…» on the clients");
  await h.go("/client/import");
  h.expect((await p.getByRole("button", { name: "Выбрать файл CSV" }).count()) === 0, "tech: the import does not open");
};
