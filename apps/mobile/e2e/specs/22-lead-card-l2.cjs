/**
 * Lead card, wave L2 (docs/14-leads-spec.md §7.2–7.3): what is missing, interest, "what next?" → book an estimate visit with
 * date / time / tech (S4: no second client when the lead already has one), status sheet → snooze, "lost or wait?", tabs.
 */
// a working day (П4a: by default Mon–Sat, Sunday off = no slots); the form counts days on the company's calendar (П4b)
const { pressEscUntilClosed, waited } = require("../sheet.cjs");
const { minuteOf, workdayOffset } = require("../companyTime.cjs");

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
  // the visit form (docs/specs/03 §7.1): day → person (with the day's load) → a free slot → note
  const chips = h.sheet().getByRole("radio");
  await chips.nth(workdayOffset(2)).click();
  await h.sheet().getByRole("button", { name: "Ivan Sokolov" }).click();
  await h.sheet().getByRole("radio", { name: /^10:30/ }).click();
  await h.sheet().getByPlaceholder(/Собака во дворе, где парковаться/).fill("Dog in the yard");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click(); await p.waitForTimeout(500);
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(300);
  let db = await h.db();
  tom = db.leads.find((x) => x.id === tom.id);
  // S4: an inspection is a visit of the lead at its property, without a job (docs/specs/03 §1)
  const visit = db.visits.find((v) => v.leadId === tom.id && !v.jobId && v.propertyId === tom.propertyId);
  h.expect(tom.status === "booked", "lead → estimate visit booked (S4)");
  h.expect(visit && visit.techId === "m-ivan" && minuteOf(visit.start) === 10 * 60 + 30, `visit with the picked tech and time: ${visit && visit.start}`);
  h.expect(visit.note === "Dog in the yard", "note for the tech (its own field, wave П3b)");
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
    raw.db.visits = raw.db.visits.filter((v) => v.leadId !== n.id && v.propertyId !== n.propertyId && !raw.db.jobs.some((j) => j.id === v.jobId && j.propertyId === n.propertyId));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, nina.id);
  await h.go(`/lead/${nina.id}`);
  await h.click("Потерян или подождать?");
  await h.sheet().getByRole("button", { name: /Подождать 7/ }).click(); await p.waitForTimeout(400);
  h.expect(!!(await lead("Nina Patel")).askAgainAt && (await lead("Nina Patel")).status === "estimate_sent", "wait 7 more days, still open");

  // a new lead with no client: booking makes ONE prospect client + property, a second booking does nothing (one planned visit)
  let angela = await lead("Angela Rossi");
  const c0 = (await h.db()).customers.length;
  await h.go(`/lead/${angela.id}`);
  // closing "did you get through?" without an answer still counts the call as an attempt
  await p.getByRole("button", { name: "Позвонить" }).first().click(); await p.waitForTimeout(400);
  await pressEscUntilClosed(p);
  // the store saves a moment later: wait for the attempt itself (before: a fixed 500 ms, and «Не ответил» pressed when
  // the Esc was lost — that hid whether Esc counts)
  const counted = await waited(p.waitForFunction((id) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.leads ?? []).some((x) => x.id === id && (x.callAttempts ?? 0) >= 1), angela.id, { timeout: 4000 }));
  angela = await lead("Angela Rossi");
  h.expect(counted && angela.status === "new", "a dismissed call is an attempt, not lost");
  const bookAngela = async () => {
    await h.clickText("Задачи");
    await h.click("Что дальше?");
    await h.sheet().getByRole("button", { name: "Записать на оценку" }).click(); await p.waitForTimeout(400);
    await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click(); await p.waitForTimeout(500);
    if (await h.sheet().getByRole("button", { name: "Не сейчас" }).count()) { await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(300); }
  };
  await bookAngela();
  db = await h.db();
  angela = db.leads.find((x) => x.name === "Angela Rossi");
  const prospect = db.customers.find((c) => c.id === angela.customerId);
  h.expect(angela.status === "booked" && prospect && prospect.status === "prospect" && db.customers.length === c0 + 1, "booking a lead without a client makes one prospect");
  const visitsOf = (d) => d.visits.filter((v) => v.leadId === angela.id).length;
  h.expect(visitsOf(db) === 1, "one visit");
  await bookAngela();
  db = await h.db();
  h.expect(visitsOf(db) === 1 && db.customers.length === c0 + 1, "second booking does nothing while a visit is planned");

  // a tech: no "make client", no booking or estimate from "what next?"
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  const kevin = await lead("Kevin Brooks");
  await h.go(`/lead/${kevin.id}`);
  await openStatus();
  h.expect((await h.sheet().getByRole("button", { name: "Сделать клиентом" }).count()) === 0, "tech: no make-client");
  await h.sheet().getByRole("button", { name: "Закрыть", exact: true }).last().click(); await p.waitForTimeout(300);
  await h.clickText("Задачи");
  await h.click("Что дальше?");
  h.expect((await h.sheet().getByRole("button", { name: "Записать на оценку" }).count()) === 0, "tech: no booking (the server would refuse it)");
  await h.sheet().getByRole("button", { name: "Позже" }).click(); await p.waitForTimeout(300);
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));

  // tabs: files has a real empty state with an action
  await h.clickText("Файлы");
  await h.expectText(/Фото|Файлов нет|Нет фото/, "files tab");
};
