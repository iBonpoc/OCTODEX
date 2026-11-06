/**
 * Wave 4a-2 (docs/specs/13-app-structure.md §3.3 «Объект»): the property card is rows with counters, like the client —
 * people of the property · leads · jobs · estimates · invoices · visits · tasks · notes · files · history; each opens its
 * list at /property/<id>?s=<row>, «back» returns to the property; «<client> ›» opens the client. The tech has no leads
 * or invoices rows and sees only his own visits.
 */
exports.run = async (h) => {
  const p = h.page;
  const rows = () => p.getByTestId("property-rows");
  const rowCount = async (name) => (await rows().getByRole("button", { name, exact: true }).innerText()).trim().split(/\s+/).at(-1);
  const row = async (name) => { await rows().getByRole("button", { name, exact: true }).click(); await p.waitForTimeout(500); };
  await h.go("/clients");
  const db0 = await h.db();
  const vprop = (v) => v.propertyId ?? db0.jobs.find((j) => j.id === v.jobId)?.propertyId;

  await h.go("/property/p1");
  for (const name of ["Люди объекта", "Лиды", "Работы", "Сметы", "Счета", "Выезды", "Задачи", "Заметки", "Файлы", "История"]) {
    h.expect((await rows().getByRole("button", { name, exact: true }).count()) === 1, `row «${name}» on the property`);
  }
  h.expect((await p.getByRole("tab").count()) === 0, "no tabs on the property card");
  await h.expectText(/Сейчас на объекте/, "now at the property stays on top");
  const jobs = db0.jobs.filter((j) => j.propertyId === "p1");
  const visits = db0.visits.filter((v) => vprop(v) === "p1");
  h.expect((await rowCount("Работы")) === String(jobs.length), `row «Работы» counts ${jobs.length}`);
  h.expect((await rowCount("Выезды")) === String(visits.length), `row «Выезды» counts ${visits.length}`);
  await h.shot("rows");

  // visits of this property only
  await row("Выезды");
  h.expect(p.url().includes("/property/p1?s=visits"), `«Выезды» opens the visits (${p.url()})`);
  await p.getByRole("button", { name: /^Назад/ }).last().click();
  await p.waitForTimeout(600);
  h.expect(/\/property\/p1$/.test(p.url()), `back → the property (${p.url()})`);

  // jobs → a job
  await row("Работы");
  await p.getByRole("button", { name: new RegExp(`^${jobs[0].number}`) }).first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/job/${jobs[0].id}`), `a job card opens the job (${p.url()})`);

  // the client from the property
  await h.go("/property/p1");
  const sarah = db0.customers.find((c) => c.id === "c1");
  await p.getByRole("button", { name: `${sarah.name} ›` }).first().click();
  await p.waitForTimeout(600);
  h.expect(/\/client\/c1$/.test(p.url()), `«${sarah.name} ›» opens the client (${p.url()})`);

  // leads at a property (Linda's lead at 2207 Ocean Park)
  await h.go("/property/p3");
  const leads = db0.leads.filter((l) => l.propertyId === "p3");
  h.expect((await rowCount("Лиды")) === String(leads.length), `row «Лиды» counts ${leads.length}`);
  await row("Лиды");
  await h.expectText(new RegExp(leads[0].number), "the lead in the list");

  // tech: no leads / invoices rows, only his visits
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/property/p1");
  const txt = (await rows().innerText()).replace(/\s+/g, " ");
  h.expect(!/Лиды/.test(txt) && !/Счета/.test(txt), `tech: no leads or invoices rows (${txt})`);
  const mine = visits.filter((v) => v.techId === db0.me || (v.assigneeIds ?? []).includes(db0.me)).length;
  h.expect((await rowCount("Выезды")) === String(mine), `tech: only his visits (${mine})`);
};
