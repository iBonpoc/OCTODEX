/**
 * Header trail like an address bar (founder 05.11.2026): "⌂ Today › Clients › Client card".
 * Every level is a link; the parent is the "back" button.
 * v2 (HIG, BUILD-SPEC «Назад»): on a phone one «‹ <parent>» top left and no trail; the trail is 820/1280 only (surfaces.tsx).
 */
exports.run = async (h) => {
  const p = h.page;
  const phone = h.layout.width < 820;
  await h.go("/today");
  const db = await h.db();
  const trail = () => p.getByRole("toolbar", { name: "Где вы" }).last();
  const back = (name) => p.getByRole("button", { name }).locator("visible=true");

  // Client card: home › Clients › (Client card)
  const cust = db.customers[0];
  await h.go(`/client/${cust.id}`);
  await back("Назад: Клиенты").first().waitFor({ timeout: 5000 });
  if (phone) {
    h.expect((await p.getByRole("toolbar", { name: "Где вы" }).locator("visible=true").count()) === 0, "phone: no trail, one «‹ Клиенты»");
    h.expect((await back("Назад: Клиенты").count()) === 1, "phone: the parent is the back button");
  } else {
    await h.expectText(/Клиент/, "current level at the end of the trail");
    h.expect(await trail().getByRole("button", { name: "Перейти: Главная" }).count() === 1, "home crumb");
    h.expect(await trail().getByRole("button", { name: "Назад: Клиенты" }).count() === 1, "parent crumb = back");
  }
  await h.shot("client-trail");
  if (!phone) {
    // jump straight home, skipping a level
    await trail().getByRole("button", { name: "Перейти: Главная" }).click();
    await p.waitForURL(/\/today$/, { timeout: 5000 });
  }

  // Job: home › Clients › Client — "Clients" jumps two levels up
  const job = db.jobs[0];
  const owner = db.properties.find((x) => x.id === job.propertyId).customerId;
  await h.go(`/job/${job.id}`);
  const name = db.customers.find((c) => c.id === owner).name;
  await back(`Назад: ${name}`).first().waitFor({ timeout: 5000 });
  if (phone) {
    h.expect((await back(`Назад: ${name}`).count()) === 1, "phone: parent = client");
    await back(`Назад: ${name}`).first().click();
    await p.waitForURL(new RegExp(`/client/${owner}`), { timeout: 5000 });
  } else {
    h.expect(await trail().getByRole("button", { name: `Назад: ${name}` }).count() === 1, "parent = client");
    await trail().getByRole("button", { name: "Перейти: Клиенты" }).click();
    await p.waitForURL(/\/clients$/, { timeout: 5000 });
    h.expect(await p.getByRole("toolbar", { name: "Где вы" }).locator("visible=true").count() === 0, "no trail on a tab root");
  }

  // Receipt: the longest chain — every level shown on 820/1280; the phone has its parent only
  const pay = db.payments.find((x) => x.invoiceId);
  h.expect(!!pay, "the demo has a receipt of an invoice");
  await h.go(`/receipt/${pay.id}`);
  const inv = db.invoices.find((i) => i.id === pay.invoiceId);
  const parent = new RegExp(`^Назад: ${inv.number}`);
  await back(parent).first().waitFor({ timeout: 5000 });
  if (!phone) {
    h.expect(await trail().getByRole("button", { name: parent }).count() === 1, "parent = invoice");
    h.expect((await trail().getByRole("button", { name: "Скрытые уровни" }).count()) === 0, "tablet and desktop show every level");
    h.expect((await trail().getByRole("button").count()) >= 3, "the receipt's trail has its levels");
    await h.shot("receipt-trail");
  } else {
    await back(parent).first().click();
    await p.waitForURL(new RegExp(`/invoice/${inv.id}`), { timeout: 5000 });
  }
};
