/**
 * «Бригады сейчас» on «Сегодня» as list cards (step 10а, PR10a), every view (3 widths × 2 themes).
 * - a tech on a visit: name, «Выездов сегодня: N», the visit's status in words, the client of the visit «now», call / SMS;
 * - the card opens the current visit; a tech with nothing started opens «План»;
 * - assignees through assigneeIds (#105); no «…».
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  const today = new Date().toDateString();
  const assigned = (v, id) => (v.assigneeIds?.length ? v.assigneeIds : v.techId ? [v.techId] : []).includes(id);
  const techs = db.members.filter((m) => m.roles.includes("tech"));
  // put one of today's visits «in work» so a tech has a current visit
  const tech = techs.find((m) => db.visits.some((v) => new Date(v.start).toDateString() === today && assigned(v, m.id)));
  h.expect(tech, "demo has a tech with a visit today");
  const visit = db.visits.filter((v) => new Date(v.start).toDateString() === today && assigned(v, tech.id)).sort((a, b) => a.start.localeCompare(b.start))[0];
  await p.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = raw.db.visits.map((v) => (v.id === id ? { ...v, step: "working", closed: false } : v));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, visit.id);
  await h.go("/today");
  const cards = p.locator('[data-testid="crew-card"]');
  h.expect((await cards.count()) === techs.length, `one card per tech (${await cards.count()} vs ${techs.length})`);
  const card = cards.filter({ hasText: tech.name }).first();
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  const n = db.visits.filter((v) => new Date(v.start).toDateString() === today && assigned(v, tech.id)).length;
  const prop = db.properties.find((x) => x.id === db.jobs.find((j) => j.id === visit.jobId)?.propertyId) ?? db.properties.find((x) => x.id === visit.propertyId);
  const client = prop && db.customers.find((c) => c.id === prop.customerId);
  for (const s of [tech.name, `Выездов сегодня: ${n}`, "Идёт работа", client?.name].filter(Boolean)) h.expect(txt.includes(s), `crew card shows «${s}»: ${txt.slice(0, 220)}`);
  if (tech.phone) h.expect((await card.getByRole("button", { name: /Позвонить/ }).count()) > 0, "call button for the tech");
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…» on the screen");
  await h.shot("crews");

  // the card opens the current visit
  await card.click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/visit/${visit.id}`), `card opens the current visit (${p.url()})`);

  // a tech with nothing started → «План»
  await h.go("/today");
  const idle = techs.find((m) => !db.visits.some((v) => new Date(v.start).toDateString() === today && assigned(v, m.id) && v.step !== "scheduled" && v.step !== "paid" && v.step !== "done") && m.id !== tech.id);
  if (idle) {
    await cards.filter({ hasText: idle.name }).first().click();
    await p.waitForTimeout(600);
    h.expect(p.url().includes("/plan"), `a tech without a current visit opens the plan (${p.url()})`);
  }
};
