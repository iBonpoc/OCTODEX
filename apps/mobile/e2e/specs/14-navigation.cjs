/** Header shows where you are (the trail "⌂ › … › Parent › Kind", e2e 24) and "‹ Parent" goes one level up, even when the screen was opened directly. */
exports.run = async (h) => {
  const p = h.page;
  const db0 = await (async () => { await h.go("/today"); return h.db(); })();
  const est = db0.estimates.find((e) => e.leadId && db0.leads.some((l) => l.id === e.leadId)) ?? db0.estimates[0];
  const lead = db0.leads.find((l) => l.id === est.leadId);
  const back = (name) => p.getByRole("button", { name: new RegExp(`^Назад: ${name}`) }).last();

  // opened directly (deep link / notification): the parent is still known
  await h.go(`/estimate/${est.id}`);
  await h.expectText(/Смета/, "kind at the end of the trail");
  const parentName = lead ? lead.name : db0.customers.find((c) => c.id === est.customerId).name;
  await back(parentName).click();
  await p.waitForTimeout(700);
  h.expect(p.url().includes(lead ? `/lead/${lead.id}` : `/client/${est.customerId}`), `up from the estimate goes to its owner: ${p.url()}`);

  if (lead) {
    await h.expectText(/Карточка лида|Лид/, "lead kind");
    await back("Лиды").click();
    await p.waitForTimeout(700);
    h.expect(p.url().includes("/leads"), `up from the lead goes to Leads: ${p.url()}`);
    await h.expectText(/Лиды/, "Sales opened on Leads");
  }

  // Clients → Client → Job: up from the job returns to its client
  const job = db0.jobs[0];
  const cust = db0.properties.find((x) => x.id === job.propertyId).customerId;
  await h.go(`/job/${job.id}`);
  await back(db0.customers.find((c) => c.id === cust).name).click();
  await p.waitForTimeout(700);
  h.expect(p.url().includes(`/client/${cust}`), `job → client: ${p.url()}`);
  await back("Клиенты").click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith("/clients"), `client → clients: ${p.url()}`);
  // a tab root has no back button
  h.expect((await p.getByRole("button", { name: /^Назад/ }).count()) === 0, "no back on a tab root");
  await h.shot("clients-root");

  // Plan is a tab for every role now (13 §2.1): no back; another role's home (Triage) sits under the director's Home
  await h.go("/plan");
  h.expect((await p.getByRole("toolbar", { name: "Где вы" }).count()) === 0 && (await p.getByRole("button", { name: /^Назад: Ещё/ }).count()) === 0, "no trail and no «‹ Ещё» on the Plan tab");
  await h.go("/triage");
  await back("Главная").click();
  await p.waitForTimeout(500);
  h.expect(p.url().endsWith("/today"), `triage → home: ${p.url()}`);
  // Money and invoices: one name, the expense button lives here
  await h.go("/money");
  await h.expectText(/Деньги и счета/, "same name as in the menu");
  await p.getByRole("button", { name: "Расход", exact: true }).last().click();
  await p.waitForTimeout(500);
  h.expect(p.url().includes("/expense/new"), "expense from Money");
  await back("Деньги и счета").click();
  await p.waitForTimeout(500);
  h.expect(p.url().endsWith("/money"), `expense → money: ${p.url()}`);

  // ☰ roots (13а §3): Catalog has ☰, no «back» and no trail; its item goes up to Catalog
  await h.go("/catalog");
  h.expect((await p.getByRole("button", { name: /^Назад/ }).count()) === 0 && (await p.getByRole("toolbar", { name: "Где вы" }).count()) === 0, "catalog is a ☰ root");
  h.expect((await p.getByRole("button", { name: "Меню", exact: true }).count()) >= 1, "☰ on Catalog");
};
