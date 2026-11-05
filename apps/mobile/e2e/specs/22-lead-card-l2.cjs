/**
 * Lead card, wave L2 (docs/14-leads-spec.md §7.2–7.3): what is missing, interest, "what next?" → book an estimate visit with
 * date / time / tech (S4: no second client when the lead already has one), status sheet → snooze, "lost or wait?", tabs.
 */
exports.run = async (h) => {
  const p = h.page;
  const lead = async (name) => (await h.db()).leads.find((x) => x.name === name);
  const openStatus = async () => { await p.getByRole("button", { name: /^Статус:/ }).first().click(); await p.waitForTimeout(300); };

  // Tom Becker: in touch, no step yet
  await h.go("/inbox?tab=leads");
  let tom = await lead("Tom Becker");
  await h.go(`/lead/${tom.id}`);
  await h.expectText(/LEA-\d{4}/, "lead number");
  await h.expectText(/Чего не хватает для сметы/, "what is missing");

  // interest: one tap
  await p.getByText("Горячий", { exact: true }).last().click(); await p.waitForTimeout(300);
  h.expect((await lead("Tom Becker")).interest === "hot", "interest saved");

  // the estimate first: it makes the prospect client + property (S3)
  await h.clickText("Сметы");
  await h.click("Смета");
  await p.waitForTimeout(500);
  tom = await lead("Tom Becker");
  const clients0 = (await h.db()).customers.length;
  h.expect(!!tom.customerId && !!tom.propertyId, "estimate gave the lead a client and property");

  // "what next?" → book the estimate visit: in 2 days, 10:30, Ivan, 90 min
  await h.go(`/lead/${tom.id}`);
  await h.clickText("Задачи");
  await h.click("Что дальше?");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).click(); await p.waitForTimeout(400);
  const chips = h.sheet().getByRole("radio");
  await chips.nth(2).click();
  for (let i = 0; i < 3; i++) await h.sheet().getByRole("button", { name: /Начало \+30/ }).click();
  await h.sheet().getByRole("radio", { name: "Ivan Sokolov" }).click();
  await h.sheet().getByPlaceholder(/Код ворот/).fill("Dog in the yard");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click(); await p.waitForTimeout(500);
  let db = await h.db();
  tom = db.leads.find((x) => x.id === tom.id);
  const visit = db.visits.find((v) => db.jobs.find((j) => j.id === v.jobId && j.propertyId === tom.propertyId && j.status === "estimate"));
  h.expect(tom.status === "booked", "lead → estimate visit booked (S4)");
  h.expect(visit && visit.techId === "m-ivan" && new Date(visit.start).getHours() === 10 && new Date(visit.start).getMinutes() === 30, `visit with the picked tech and time: ${visit && visit.start}`);
  h.expect(visit.scope.includes("Dog in the yard"), "note for the tech");
  h.expect(db.customers.length === clients0, "no second client for the same lead");

  // status sheet → snooze 3 months → leaves "open", shows under "snoozed", keeps its stage
  await openStatus();
  await h.sheet().getByRole("button", { name: "Отложить" }).click(); await p.waitForTimeout(300);
  await h.sheet().getByPlaceholder("Позвонить весной").fill("spring");
  await h.sheet().getByRole("button", { name: "Отложить" }).last().click(); await p.waitForTimeout(400);
  tom = await lead("Tom Becker");
  h.expect(!!tom.snoozedUntil && tom.status === "booked" && tom.snoozeReason === "spring", "snoozed, stage kept");
  await h.expectText(/Отложен до/, "snoozed on the card");
  await h.click("Вернуть сейчас");
  h.expect(!(await lead("Tom Becker")).snoozedUntil, "back now");

  // "lost or wait?" after the reminder went unanswered 15 days
  const nina = await lead("Nina Patel");
  await h.go("/today");
  await p.evaluate((nid) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const n = raw.db.leads.find((x) => x.id === nid);
    n.status = "estimate_sent";
    n.lastOutboundAt = new Date(Date.now() - 20 * 86400000).toISOString();
    n.remindedAt = new Date(Date.now() - 15 * 86400000).toISOString();
    raw.db.tasks = raw.db.tasks.filter((t) => t.subjectId !== nid);
    raw.db.visits = raw.db.visits.filter((v) => !raw.db.jobs.some((j) => j.id === v.jobId && j.propertyId === n.propertyId));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, nina.id);
  await h.go(`/lead/${nina.id}`);
  await h.click("Потерян или подождать?");
  await h.sheet().getByRole("button", { name: /Подождать 7/ }).click(); await p.waitForTimeout(400);
  h.expect(!!(await lead("Nina Patel")).askAgainAt && (await lead("Nina Patel")).status === "estimate_sent", "wait 7 more days, still open");

  // tabs: files has a real empty state with an action
  await h.clickText("Файлы");
  await h.expectText(/Фото|Файлов нет|Нет фото/, "files tab");
};
