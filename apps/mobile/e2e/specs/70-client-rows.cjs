/**
 * Wave 4 (docs/specs/13-app-structure.md §3.3): the client card is rows with counters, not tabs. «Работы» and «Лиды»
 * are new rows; each row opens its own list at /client/<id>?s=<row>; «Адрес для счетов» opens the client form.
 * The tech has no Leads / Invoices / billing rows. S8a: a lead won by hand does not make an archived or
 * «do not service» client active (the server changes only a prospect).
 */
exports.run = async (h) => {
  const p = h.page;
  const rows = () => p.getByTestId("client-rows");
  const rowText = async () => (await rows().innerText()).replace(/\s+/g, " ");
  const row = async (name) => { await rows().getByRole("button", { name, exact: true }).click(); await p.waitForTimeout(500); };
  const db0 = await (async () => { await h.go("/clients"); return h.db(); })();

  // Sarah: two jobs (one per property), counted by Job.customerId
  await h.go("/client/c1");
  const jobsOfSarah = db0.jobs.filter((j) => j.customerId === "c1");
  h.expect(jobsOfSarah.length === 2, `seed: Sarah has 2 jobs (${jobsOfSarah.length})`);
  h.expect(new RegExp(`Работы\\s*${jobsOfSarah.length}\\b`).test(await rowText()), `row «Работы» counts ${jobsOfSarah.length}`);
  for (const name of ["Объекты", "Адрес для счетов", "Люди", "Работы", "Лиды", "Сметы", "Счета и квитанции", "Задачи", "Заметки", "Файлы", "История"]) {
    h.expect((await rows().getByRole("button", { name, exact: true }).count()) === 1, `row «${name}» on the client`);
  }
  // the card shows rows, not section tabs; the phone's bottom bar (its 5 tabs) is on every card now (docs/specs/28)
  h.expect((await p.getByRole("tab").count()) - (await p.getByTestId("tab-bar").getByRole("tab").count()) === 0, "no section tabs on the client card");
  await h.shot("rows");

  await row("Работы");
  h.expect(p.url().includes("/client/c1?s=jobs"), `«Работы» opens the jobs (${p.url()})`);
  for (const j of jobsOfSarah) await h.expectText(new RegExp(j.number), `job ${j.number} in the list`);
  await h.shot("jobs");
  await p.getByRole("button", { name: new RegExp(`^${jobsOfSarah[0].number}`) }).first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/job/${jobsOfSarah[0].id}`), `a job card opens the job (${p.url()})`);

  // Linda: her lead in «Лиды»; billing = the property until set
  await h.go("/client/c3");
  const lindaLeads = db0.leads.filter((l) => l.customerId === "c3");
  h.expect(new RegExp(`Лиды\\s*${lindaLeads.length}\\b`).test(await rowText()), `row «Лиды» counts ${lindaLeads.length}`);
  h.expect(/Адрес для счетов\s*Как у объекта/.test(await rowText()), "billing: same as the property");
  await row("Лиды");
  await h.expectText(new RegExp(lindaLeads[0].number), "lead in the list");
  await p.getByRole("button", { name: new RegExp(`^${lindaLeads[0].number}`) }).first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/lead/${lindaLeads[0].id}`), `a lead card opens the lead (${p.url()})`);
  await h.go("/client/c3");
  await row("Адрес для счетов");
  h.expect(p.url().includes("/client/edit?id=c3"), `billing row opens the form (${p.url()})`);

  // a row's list has its own «back» to the client
  await h.go("/client/c3?s=estimates");
  await h.expectText(/Сметы/, "estimates list");
  await p.getByRole("button", { name: /^Назад/ }).last().click();
  await p.waitForTimeout(600);
  h.expect(/\/client\/c3$/.test(p.url()), `back from a row's list → the client (${p.url()})`);

  // S8a: Linda «do not service», her lead won by hand — she stays «do not service»
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === "c3" ? { ...c, status: "do_not_service", statusReason: "Did not pay twice" } : c));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go(`/lead/${lindaLeads[0].id}`);
  await p.getByRole("button", { name: /^Статус:/ }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Сделать клиентом" }).click(); await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Сделать клиентом" }).click(); await p.waitForTimeout(500);
  const db1 = await h.db();
  h.expect(db1.leads.find((l) => l.id === lindaLeads[0].id).status === "won", "lead won by hand");
  h.expect(db1.customers.find((c) => c.id === "c3").status === "do_not_service", `client keeps «do not service» (${db1.customers.find((c) => c.id === "c3").status})`);

  // tech: own client, no leads / invoices / billing rows, no money
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/client/c2");
  const txt = await rowText();
  h.expect(/Работы/.test(txt) && /Объекты/.test(txt), "tech: jobs and properties rows");
  h.expect(!/Лиды/.test(txt) && !/Счета/.test(txt) && !/Адрес для счетов/.test(txt), `tech: no leads, invoices, billing (${txt})`);
  await h.go("/client/c2?s=invoices");
  h.expect(!/INV-/.test(await h.text()), "tech: the invoices list is not opened by address");
};
