// e2e 132: «Сообщить клиенту?» after a cancel (S4a / S9a; docs/specs/03 §7.4, §13), every view
/**
 * - S9a: the office cancels a job visit of a Spanish-speaking client → «Сообщить клиенту об отмене?» with the text in
 *   Spanish (rule 7: the client's language, the app stays Russian) → «SMS» opens the phone's SMS with that text and
 *   writes an `sms` event on the job (spec 20); «Отменить» on the toast takes the event back (rule 5);
 * - S4a: cancelling a lead's inspection asks too; «Не сейчас» writes nothing and goes back from the visit screen;
 * - the cancel itself is unchanged (the visit is kept in cancelledVisits with its reason).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/inbox");
  let db = await h.db();
  const j1 = db.jobs.find((j) => j.id === "j1");
  const prop = db.properties.find((x) => x.id === j1.propertyId);
  // the client's main person speaks Spanish (docLanguageFor: person → client's main person → lead → company)
  await p.evaluate((cid) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const c = raw.db.customers.find((x) => x.id === cid);
    if (!c.people?.length) c.people = [{ id: `${c.id}-main`, name: c.name, role: "main", phones: [{ number: c.phone, label: "mobile", primary: true }], emails: [] }];
    for (const person of c.people) person.language = "es";
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, prop.customerId);

  // S9a: cancel a job visit (demo v1 of j1)
  await h.go("/visit/v1");
  await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await p.getByRole("button", { name: "Отменить выезд", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Клиент отменил" }).click();
  await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().click(); await p.waitForTimeout(600);
  await h.expectText(/Сообщить клиенту об отмене\?/, "after the cancel the office is asked to tell the client");
  await h.expectText(/visita de trabajo .+ está cancelada/, "the text is in the client's language (es), not the app's");
  db = await h.db();
  h.expect(!db.visits.some((x) => x.id === "v1") && (db.cancelledVisits ?? []).some((x) => x.id === "v1" && x.cancelReason === "client_cancelled"), "the cancel itself: kept with its reason");
  const sms = (d) => d.activities.filter((a) => a.subjectType === "job" && a.subjectId === "j1" && a.kind === "sms" && /cancelada/.test(a.body ?? ""));
  h.expect(sms(db).length === 0, "nothing written before a button");
  await h.sheet().getByRole("button", { name: "SMS", exact: true }).click(); await p.waitForTimeout(500);
  const opened = await p.evaluate(() => window.__opened);
  h.expect(opened.length === 1 && /^sms:/.test(opened[0]) && decodeURIComponent(opened[0]).includes("cancelada"), `SMS opened with the Spanish text: ${opened[0]?.slice(0, 100)}`);
  db = await h.db();
  h.expect(sms(db).length === 1, "S9a → spec 20: an sms event on the job");
  // «Отменить» on the toast takes the event back (the last toast is the message's)
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click(); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(sms(db).length === 0, "undo: the event is taken back");

  // S4a: a lead's inspection — book it, then cancel; «Не сейчас» writes nothing and leaves the visit screen
  const angela = db.leads.find((x) => x.name === "Angela Rossi");
  await h.go(`/lead/${angela.id}`);
  await h.clickText("Задачи");
  await h.click("Что дальше?");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click(); await p.waitForTimeout(500);
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(300);
  db = await h.db();
  const v = db.visits.find((x) => x.leadId === angela.id);
  h.expect(!!v, "inspection booked");
  await h.go(`/visit/${v.id}`);
  await p.getByRole("button", { name: "Отменить выезд", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Мы отменили" }).click();
  await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().click(); await p.waitForTimeout(600);
  await h.expectText(/Сообщить клиенту об отмене\?/, "S4a: asked after an inspection cancel too");
  await h.expectText(/осмотр .+ отменён|estimate visit .+ is cancelled|visita de evaluación .+ está cancelada/, "the inspection text");
  const before = (await h.db()).activities.length;
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(db.activities.length === before, "«Не сейчас»: nothing written");
  h.expect(!p.url().includes(`/visit/${v.id}`), `the screen goes back after the question (${p.url()})`);
  h.expect(db.leads.find((x) => x.id === angela.id).status === "replied", "S4a unchanged: the lead is back «На связи»");
};
