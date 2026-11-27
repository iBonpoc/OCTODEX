const { objSection } = require("../objectScreen.cjs");
/**
 * The client card's sections, v2 (#2350, the Object template; features/client/nextStep `clientSectionKeys`): one strip
 * «Обзор · Работы · Сметы · Счета · Объекты · Журнал» («Счета» with money, «Объекты» from two addresses); a number only where it
 * means something (jobs, estimates, invoices, addresses). A section shows its list right there; a job / lead row opens its own
 * screen; the open section is in the address, so back returns to it. The billing address is a fact of the header's panel
 * (its «Изменить» opens the client form); the leads are in «Работы». An old link /client/<id>?s=<row> opens the section that
 * holds it now. The tech has no «Счета», no leads, no billing. S8a: a lead won by hand does not make an archived or
 * «do not service» client active (the server changes only a prospect).
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const S = "client-screen";
  const db0 = await (async () => { await h.go("/clients"); return h.db(); })();

  // Sarah: two jobs (one per property), counted by Job.customerId → the number on «Работы»
  await h.go("/client/c1");
  await tid(`${S}-sections`).waitFor({ timeout: 8000 });
  const jobsOfSarah = db0.jobs.filter((j) => j.customerId === "c1");
  h.expect(jobsOfSarah.length === 2, `seed: Sarah has 2 jobs (${jobsOfSarah.length})`);
  for (const k of ["overview", "work", "estimates", "money", "places", "log"]) {
    h.expect((await p.getByTestId(`${S}-sections-${k}`).locator("visible=true").count()) === 1, `section «${k}» on the client`);
  }
  h.expect((await tid(`${S}-sections-work-count`).innerText()).trim() === String(jobsOfSarah.length), `«Работы» shows ${jobsOfSarah.length}`);
  h.expect((await p.getByTestId(`${S}-sections-log-count`).count()) === 0, "«Журнал» has no number");
  await h.shot("tabs");

  await objSection(p, S, "work");
  const work = await tid("client-work").innerText();
  for (const j of jobsOfSarah) h.expect(work.includes(j.number), `job ${j.number} in «Работы»`);
  h.expect(/[?&]tab=work\b/.test(p.url()), `the open section is in the address (${p.url()})`);
  await h.shot("jobs");
  await tid(`client-job-${jobsOfSarah[0].id}`).click();
  await p.waitForURL((u) => u.pathname.includes(`/job/${jobsOfSarah[0].id}`), { timeout: 8000 });
  await p.goBack();
  await tid("client-work").waitFor({ timeout: 4000 });

  // Linda: her lead in «Работы»; billing = the property until set — the default is not said (#3023: «Для счетов» only when it differs)
  await h.go("/client/c3");
  const lindaLeads = db0.leads.filter((l) => l.customerId === "c3");
  await tid("client-facts").waitFor({ state: "attached", timeout: 8000 });
  h.expect((await p.getByTestId("client-billing").count()) === 0, "billing = the property: no «Для счетов» group");
  await objSection(p, S, "work");
  h.expect(new RegExp(`Лиды · ${lindaLeads.length}\\b`).test(await tid("client-leads").innerText()), `«Лиды» counts ${lindaLeads.length}`);
  h.expect((await tid(`client-lead-${lindaLeads[0].id}`).innerText()).includes(lindaLeads[0].number), "lead in the list");
  await tid(`client-lead-${lindaLeads[0].id}`).click();
  await p.waitForURL((u) => u.pathname.includes(`/lead/${lindaLeads[0].id}`), { timeout: 8000 });
  await h.go("/client/c3");
  // the panel's «Изменить» opens the client form, billing included
  await tid("client-header-toggle").click();
  await tid("client-header-edit").click();
  await p.waitForURL((u) => u.pathname.includes("/client/edit") && u.search.includes("id=c3"), { timeout: 8000 });

  // an old link to a row's list opens the section that holds it now
  await h.go("/client/c3?s=estimates");
  await p.locator(`[data-testid="${S}-sections-estimates"][aria-selected="true"]`).locator("visible=true").first().waitFor({ timeout: 8000 });
  await tid("client-estimates").waitFor({ timeout: 4000 });

  // S8a: Linda «do not service», her lead won by hand — she stays «do not service»
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === "c3" ? { ...c, status: "do_not_service", statusReason: "Did not pay twice" } : c));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go(`/lead/${lindaLeads[0].id}`);
  await p.getByTestId("lead-header-status").locator("visible=true").first().click(); // v2: the status of the header opens the sheet
  await h.sheet().getByRole("button", { name: "Сделать клиентом" }).click(); await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Сделать клиентом" }).click(); await p.waitForTimeout(500);
  const db1 = await h.db();
  h.expect(db1.leads.find((l) => l.id === lindaLeads[0].id).status === "won", "lead won by hand");
  h.expect(db1.customers.find((c) => c.id === "c3").status === "do_not_service", `client keeps «do not service» (${db1.customers.find((c) => c.id === "c3").status})`);

  // tech: own client, no «Счета», no leads, no billing, no money
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/client/c2");
  await tid(`${S}-sections`).waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId(`${S}-sections-work`).locator("visible=true").count()) === 1, "tech: the work section");
  h.expect((await p.getByTestId(`${S}-sections-money`).count()) === 0, "tech: no invoices section");
  await objSection(p, S, "work");
  h.expect((await p.getByTestId("client-leads").count()) === 0, "tech: no leads");
  h.expect((await p.getByTestId("client-billing").count()) === 0, "tech: no billing");
  await h.go("/client/c2?s=invoices");
  await tid(`${S}-sections`).waitFor({ timeout: 8000 });
  h.expect(!/INV-/.test(await h.text()), "tech: the invoices list is not opened by address");
};
