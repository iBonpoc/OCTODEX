/**
 * Header trail like an address bar (founder 05.11.2026): "⌂ Today › Clients › Client card".
 * Every level is a link; the parent is the "back" button; on a phone a long trail folds into "⌂ › … › Parent".
 */
exports.run = async (h) => {
  const p = h.page;
  const phone = h.layout.width < 820;
  await h.go("/today");
  const db = await h.db();
  const trail = () => p.getByRole("toolbar", { name: "Где вы" }).last();

  // Client card: home › Clients › (Client card)
  const cust = db.customers[0];
  await h.go(`/client/${cust.id}`);
  await h.expectText(/Клиент/, "current level at the end of the trail");
  h.expect(await trail().getByRole("button", { name: "Перейти: Главная" }).count() === 1, "home crumb");
  h.expect(await trail().getByRole("button", { name: "Назад: Клиенты" }).count() === 1, "parent crumb = back");
  await h.shot("client-trail");
  // jump straight home, skipping a level
  await trail().getByRole("button", { name: "Перейти: Главная" }).click();
  await p.waitForTimeout(600);
  h.expect(/\/today$/.test(p.url()), `home crumb → Today (${p.url()})`);

  // Job: home › Clients › Client — "Clients" jumps two levels up
  const job = db.jobs[0];
  const owner = db.properties.find((x) => x.id === job.propertyId).customerId;
  await h.go(`/job/${job.id}`);
  const name = db.customers.find((c) => c.id === owner).name;
  h.expect(await trail().getByRole("button", { name: `Назад: ${name}` }).count() === 1, "parent = client");
  await trail().getByRole("button", { name: "Перейти: Клиенты" }).click();
  await p.waitForTimeout(600);
  h.expect(/\/clients$/.test(p.url()), `Clients crumb from a job (${p.url()})`);
  h.expect(await p.getByRole("toolbar", { name: "Где вы" }).count() === 0, "no trail on a tab root");

  // Receipt: the longest chain. Phone folds the middle into "…", the menu opens the hidden levels.
  const pay = db.payments.find((x) => x.invoiceId);
  if (pay) {
    await h.go(`/receipt/${pay.id}`);
    const inv = db.invoices.find((i) => i.id === pay.invoiceId);
    h.expect(await trail().getByRole("button", { name: new RegExp(`^Назад: ${inv.number}`) }).count() === 1, "parent = invoice");
    const more = trail().getByRole("button", { name: "Скрытые уровни" });
    const folded = (await more.count()) === 1;
    const levels = await trail().getByRole("button").count();
    if (phone && levels + (folded ? -1 : 0) > 2) h.expect(folded, "phone folds a long trail");
    if (!phone) h.expect(!folded, "tablet and desktop show every level");
    if (folded) {
      await more.click();
      await p.waitForTimeout(300);
      await h.shot("receipt-hidden-levels");
      const item = p.getByRole("menuitem").first();
      h.expect(await item.count() === 1, "hidden levels menu");
      await item.click();
      await p.waitForTimeout(600);
      h.expect(!/\/receipt\//.test(p.url()), `menu level opens (${p.url()})`);
    }
  }
};
