/**
 * П3c (docs/specs/03 «П3c — этап 0»; story map S15, §5 «вычисляемые»): one rule «Опаздывает», start + 15 min.
 * Office side: «Требует внимания» and the notice «{tech} опаздывает на {client}, не выехал · начало …»;
 * the tech taps «Я в пути» → still late: «Опаздывает · в пути», «в пути с h:mm AM» (on the way does NOT clear it);
 * «На месте» → the item and the notice are gone. A visit tomorrow without people → «Завтра выезд без мастера»
 * (tomorrow of the company, П4a: 24 h from now, not the browser's calendar).
 * The tech sees neither the office notice nor the office items. No fixed demo time: the spec plants its own visits.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  const me = db.members.find((m) => m.id === db.me);
  // a client whose property has no demo visit today (v5 of the demo is late too, by the same rule)
  // (by client: one client may have several properties)
  const custOf = (pid) => db.properties.find((x) => x.id === pid)?.customerId;
  const busyClients = new Set(db.visits.map((v) => custOf(v.propertyId ?? db.jobs.find((j) => j.id === v.jobId)?.propertyId)));
  const busy = new Set(db.properties.filter((x) => busyClients.has(x.customerId)).map((x) => x.id));
  const prop = db.properties.find((x) => !busy.has(x.id) && db.customers.some((c) => c.id === x.customerId));
  h.expect(prop, "demo has a property without visits");
  const client = db.customers.find((c) => c.id === prop.customerId);
  // tomorrow without people: any other client (the item names the client)
  const other = db.properties.find((x) => x.customerId && x.customerId !== client.id && db.customers.some((c) => c.id === x.customerId));
  h.expect(other, "demo has a property of another client");
  const client2 = db.customers.find((c) => c.id === other.customerId);
  // «tomorrow» is the company's day (П4a, Los Angeles), not the browser's: 24 h from now is tomorrow in any zone
  const tomorrow = new Date(Date.now() + 24 * 3_600_000);
  await p.evaluate(([late, tm]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [late, tm, ...raw.db.visits.filter((v) => !v.id.startsWith("e2e-"))];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [
    { id: "e2e-late", propertyId: prop.id, kind: "inspection", techId: me.id, assigneeIds: [me.id], start: new Date(Date.now() - 16 * 60_000).toISOString(), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 },
    { id: "e2e-tm", propertyId: other.id, kind: "inspection", techId: null, assigneeIds: [], start: tomorrow.toISOString(), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 },
  ]);

  // the office: not left yet
  await h.go("/today");
  const notLeft = new RegExp(`${me.name} опаздывает на ${client.name}, не выехал · начало \\d{1,2}:\\d{2}[\\s\\u202f]?[AP]M`);
  await h.expectText(notLeft, "the office notice: not left, with the start in en-US");
  await h.expectText(/Опаздывает · не выехал/, "the sign: not left");
  await h.shot("office-not-left");
  // the whole list (Today shows the first people only): «Не назначено» tomorrow
  await h.go("/triage");
  const item = new RegExp(`Мастер опаздывает · ${me.name} → ${client.name}`);
  await h.expectText(item, "the item «Мастер опаздывает» is in «Требует внимания»");
  await h.expectText(new RegExp(`Завтра выезд без мастера · ${client2.name}`), "«Не назначено» tomorrow is in «Требует внимания»");

  // the tech sees none of the office's items
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/today");
  let body = await h.text();
  h.expect(!/опаздывает на/.test(body), "the tech sees no office notice");
  await h.go("/triage");
  body = await h.text();
  h.expect(!/Завтра выезд без мастера/.test(body), "the tech sees no «Не назначено» of the office");
  h.expect(!/Мастер опаздывает ·/.test(body), "the tech sees no «Мастер опаздывает» item");

  // the tech leaves: still late, now «on the way»
  await h.go("/visit/e2e-late");
  await h.click("Я в пути");
  let v = (await h.db()).visits.find((x) => x.id === "e2e-late");
  h.expect(v.step === "en_route" && !!v.enRouteAt, `on the way with the time (${v.step}, ${v.enRouteAt})`);
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await h.go("/today");
  await h.expectText(new RegExp(`${me.name} опаздывает на ${client.name}, в пути с \\d{1,2}:\\d{2}[\\s\\u202f]?[AP]M`), "on the way does not clear it: «в пути с …»");
  await h.expectText(/Опаздывает · в пути/, "the sign: on the way");
  await h.shot("office-on-the-way");

  // on site: gone
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/visit/e2e-late");
  await h.click("На месте");
  v = (await h.db()).visits.find((x) => x.id === "e2e-late");
  h.expect(v.step === "on_site", `on site (${v.step})`);
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await h.go("/today");
  body = await h.text();
  h.expect(!new RegExp(`${me.name} опаздывает на ${client.name}`).test(body), "on site: the notice is gone");
  await h.go("/triage");
  body = await h.text();
  h.expect(!item.test(body), "on site: the item is gone too");
};
