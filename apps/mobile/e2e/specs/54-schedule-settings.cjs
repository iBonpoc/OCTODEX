/**
 * П4a (docs/specs/03 «П4 — этап 0», §6.1; story map S4, S9, S15): «Ещё → Компания → Расписание».
 * The director sets the inspection to 60 min and «late» to 30 min, saves; the visit form opens with 60 min and tells
 * what the client sees (the 2 h window); a visit 16 min past its start is not late any more, 31 min is.
 * The time zone moved here: the address section shows a line to it. A dispatcher does not open the screen (only the director).
 * Own visits on a free client (no reliance on the demo time).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/company");
  await h.clickText("Расписание");
  await h.expectText(/Рабочие часы/, "the schedule screen opened from the company");
  await h.expectText(/Суббота/, "the days of the week are listed");
  await h.shot("screen");
  await h.click("Осмотр +15");
  for (let i = 0; i < 3; i++) await h.click("«Опаздывает» через +5");
  await h.expectText(/Клиент увидит: «Мастер приедет \d{1,2}:\d{2}[\s ]?[AP]M–\d{1,2}:\d{2}[\s ]?[AP]M»/, "the example of the 2 h window");
  await h.click("Сохранить");
  let db = await h.db();
  const s = db.company.scheduleSettings || {};
  h.expect(s.inspectionMin === 60 && s.lateAfterMin === 30, `saved: ${JSON.stringify(s)}`);
  h.expect(db.company.businessHours && db.company.businessHours.sat && !db.company.businessHours.sun, "hours saved: Mon–Sat, Sunday off");

  // the address section (where the zone was): now a line that leads to «Расписание»
  await h.go("/company/address");
  await h.expectText(/Часовой пояс: Los Angeles/, "the address section shows the time zone line");

  // the visit form takes the length from the settings and tells the client's window
  const angela = db.leads.find((x) => x.name === "Angela Rossi");
  await h.go(`/lead/${angela.id}`);
  await h.clickText("Задачи");
  await h.click("Что дальше?");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).click(); await p.waitForTimeout(400);
  const form = await h.sheet().innerText();
  h.expect(/Длительность\s*[\s\S]{0,20}?60\s*мин/.test(form), `the inspection is 60 min by default: ${form.slice(0, 300)}`);
  h.expect(/Клиент увидит окно \d{1,2}:\d{2}[\s ]?[AP]M–\d{1,2}:\d{2}[\s ]?[AP]M/.test(form), "the form says the client's window");
  await h.shot("form");
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);

  // «late» after 30 min: 16 min past the start is not late, 31 min is
  db = await h.db();
  const me = db.members.find((m) => m.id === db.me);
  const custOf = (pid) => db.properties.find((x) => x.id === pid)?.customerId;
  const busyClients = new Set(db.visits.map((v) => custOf(v.propertyId ?? db.jobs.find((j) => j.id === v.jobId)?.propertyId)));
  const free = db.properties.filter((x) => x.customerId && !busyClients.has(x.customerId) && db.customers.some((c) => c.id === x.customerId));
  const a = free[0];
  h.expect(a, "demo has a client without visits");
  const client = db.customers.find((c) => c.id === a.customerId).name;
  const plant = (ago) => p.evaluate((v) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [v, ...raw.db.visits.filter((x) => !x.id.startsWith("e2e-"))];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, { id: "e2e-late", propertyId: a.id, kind: "inspection", techId: me.id, assigneeIds: [me.id], start: new Date(Date.now() - ago * 60_000).toISOString(), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 });
  const item = new RegExp(`Мастер опаздывает · ${me.name} → ${client}`);
  await plant(16);
  await h.go("/triage");
  await h.expectText(/Требует внимания|Разбор/, "triage opened");
  h.expect(!item.test(await h.text()), "16 min past the start: not late with the threshold 30");
  await plant(31);
  await h.go("/triage");
  await h.expectText(item, "31 min past the start: late");

  // the office sees the schedule settings but cannot change them (spec 26 §3, decision 07.11)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("dispatcher")));
  await h.go("/company/schedule");
  await h.expectText(/Только просмотр — менять может директор/, "the dispatcher sees the schedule read-only");
  h.expect((await p.getByRole("button", { name: "Сохранить", exact: true }).locator("visible=true").count()) === 0, "no «Сохранить» for the dispatcher");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
