/**
 * The client card's sections (#1343, prototype v6 approved by the founder 14.11; DS §9 А1п — was wave 4's rows):
 * view tabs Обзор · Сметы · Счета · Работы · Задачи · Заметки · Файлы · История, all always; the number on a tab is what
 * waits for an action (jobs not done, …). A tab shows its list right there; a job / lead card opens its own screen; the
 * open tab is in the address, so back returns to it. «Обзор»: the properties, «Адрес для счетов» (opens the client form),
 * people, leads. An old link /client/<id>?s=<row> still opens that row's own list with its «back».
 * The tech has no «Счета» tab, no leads, no billing. S8a: a lead won by hand does not make an archived or
 * «do not service» client active (the server changes only a prospect).
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const tab = async (k) => {
    await tid(`client-tabs-${k}`).scrollIntoViewIfNeeded();
    await tid(`client-tabs-${k}`).click();
    await tid(`client-tab-${k}`).waitFor({ timeout: 4000 });
  };
  const db0 = await (async () => { await h.go("/clients"); return h.db(); })();

  // Sarah: two jobs (one per property), counted by Job.customerId; not done → the number on «Работы»
  await h.go("/client/c1");
  await tid("client-tabs").waitFor({ timeout: 8000 });
  const jobsOfSarah = db0.jobs.filter((j) => j.customerId === "c1");
  h.expect(jobsOfSarah.length === 2, `seed: Sarah has 2 jobs (${jobsOfSarah.length})`);
  for (const k of ["overview", "estimates", "invoices", "jobs", "tasks", "notes", "files", "history"]) {
    h.expect((await p.getByTestId(`client-tabs-${k}`).locator("visible=true").count()) === 1, `tab «${k}» on the client`);
  }
  const notDone = jobsOfSarah.filter((j) => j.status !== "done").length;
  const jobsCount = await p.getByTestId("client-tabs-jobs-count").locator("visible=true").count();
  h.expect(notDone ? jobsCount === 1 && (await tid("client-tabs-jobs-count").innerText()).trim() === String(notDone) : jobsCount === 0, `«Работы» shows ${notDone || "no number"}`);
  h.expect((await p.getByTestId("client-tabs-history-count").count()) === 0, "«История» has no number");
  h.expect((await p.getByTestId("client-rows").count()) === 0, "no rows of sections any more");
  await h.shot("tabs");

  await tab("jobs");
  for (const j of jobsOfSarah) await h.expectText(new RegExp(j.number), `job ${j.number} in the tab`);
  h.expect(/[?&]tab=jobs\b/.test(p.url()), `the open tab is in the address (${p.url()})`);
  await h.shot("jobs");
  await p.getByTestId(`client-job-${jobsOfSarah[0].id}`).first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/job/${jobsOfSarah[0].id}`), `a job card opens the job (${p.url()})`);
  await p.goBack();
  await tid("client-tab-jobs").waitFor({ timeout: 4000 });

  // Linda: her lead on «Обзор»; billing = the property until set
  await h.go("/client/c3");
  const lindaLeads = db0.leads.filter((l) => l.customerId === "c3");
  await tid("client-tab-overview").waitFor({ timeout: 8000 });
  h.expect(/Как у объекта/.test(await tid("client-billing").innerText()), "billing: same as the property");
  h.expect(new RegExp(`${lindaLeads.length}\\b`).test(await tid("client-leads").innerText()), `«Лиды» counts ${lindaLeads.length}`);
  await tid("client-leads").getByRole("button").first().click();
  await h.expectText(new RegExp(lindaLeads[0].number), "lead in the list");
  await p.getByTestId(`client-lead-${lindaLeads[0].id}`).first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/lead/${lindaLeads[0].id}`), `a lead card opens the lead (${p.url()})`);
  await h.go("/client/c3");
  await tid("client-billing").getByRole("button").first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes("/client/edit?id=c3"), `billing row opens the form (${p.url()})`);

  // an old link to a row's list still works, with its own «back» to the client
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

  // tech: own client, no «Счета» tab, no leads, no billing, no money
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/client/c2");
  await tid("client-tabs").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("client-tabs-jobs").locator("visible=true").count()) === 1, "tech: the jobs tab");
  h.expect((await p.getByTestId("client-tabs-invoices").count()) === 0, "tech: no invoices tab");
  h.expect((await p.getByTestId("client-leads").count()) === 0 && (await p.getByTestId("client-billing").count()) === 0, "tech: no leads, no billing");
  await h.go("/client/c2?s=invoices");
  h.expect(!/INV-/.test(await h.text()), "tech: the invoices list is not opened by address");
};
