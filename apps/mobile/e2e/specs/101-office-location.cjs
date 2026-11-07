/**
 * Wave 7б-2 (docs/specs/03 §12, Б1; story map S23): what the office sees of the tech's location on an open visit.
 * «{tech} · в пути · 2.1 mi от адреса · 3 мин назад»; no geo on the property — only the minutes; the visit done — no line;
 * the tech takes consent back in «Настройки приложения → Местоположение» → the points are gone and the office reads
 * «{tech} не делится геопозицией»; the company flag off — no section and no line. A tech sees no office line.
 */
const HOME = { lat: 34.1478, lng: -118.1445 };

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  const me = db.members.find((m) => m.id === db.me);
  const prop = db.properties.find((x) => db.customers.some((c) => c.id === x.customerId));
  const visit = { id: "e2e-off-geo", propertyId: prop.id, kind: "inspection", techId: me.id, assigneeIds: [me.id], start: new Date(Date.now() - 10 * 60_000).toISOString(), durationMin: 60, step: "en_route", enRouteAt: new Date(Date.now() - 8 * 60_000).toISOString(), scope: [], checklist: [], photos: [], amountDueCents: 0 };
  const point = { visitId: visit.id, userId: me.id, lat: HOME.lat + 0.03, lng: HOME.lng, accuracyM: 20, at: new Date(Date.now() - 3 * 60_000 - 10_000).toISOString() };
  const askedKey = `octo.locationAsked.v1:${db.company?.id ?? "demo"}:${db.me}`;
  const plant = (o) => p.evaluate(([pid, geo, v, pt, loc, role, key]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.properties = raw.db.properties.map((x) => (x.id === pid ? { ...x, geo: geo || undefined } : x));
    raw.db.visits = [v, ...raw.db.visits.filter((x) => !x.id.startsWith("e2e-"))];
    raw.db.location = loc;
    raw.db.visitPoints = pt ? [pt] : [];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem(key, "true");
    localStorage.setItem("octo.role.v1", JSON.stringify(role));
  }, [prop.id, o.geo, o.visit || visit, o.point === undefined ? point : o.point, o.loc || { allowed: true, on: true, ackAt: new Date().toISOString() }, o.role || "director", askedKey]);
  const officeLine = new RegExp(`${me.name} · (в пути|на месте) · \\d+\\.\\d mi от адреса · \\d+ мин назад`);

  // the office on an open visit
  await plant({ geo: HOME });
  await h.go(`/visit/${visit.id}`);
  await h.expectText(new RegExp(`${me.name} · в пути · 2\\.1 mi от адреса · 3 мин назад`), "the office: the step, distance to the address and the age of the point");
  await h.shot("office-line");

  // no geo on the property: only the minutes
  await plant({ geo: null });
  await h.go(`/visit/${visit.id}`);
  await h.expectText(new RegExp(`${me.name} · в пути · 3 мин назад`), "no address on the map: the step and the minutes");
  h.expect(!/mi от адреса/.test(await h.text()), "no miles without geo");

  // the visit is done: no line
  await plant({ geo: HOME, visit: { ...visit, step: "paid" } });
  await h.go(`/visit/${visit.id}`);
  h.expect(!officeLine.test(await h.text()), "a done visit: no location line");

  // a tech does not see the office line
  await plant({ geo: HOME, role: "tech", visit: { ...visit, assigneeIds: ["someone-else"], techId: "someone-else" } });
  await h.go(`/visit/${visit.id}`);
  h.expect(!/mi от адреса/.test(await h.text()), "a tech sees no office line");

  // the tech takes it back: points gone, the office reads «не делится»
  await plant({ geo: HOME, role: "tech" });
  await h.go("/settings");
  await h.expectText(/Местоположение/, "«Настройки приложения» has the section when the company allows it");
  await h.expectText(/Хранится 30 дней/, "it says how long and what turning off does");
  await p.getByRole("radio", { name: "Не делиться", exact: true }).last().click();
  await h.expectText(/Геопозиция выключена, точки удалены/, "a toast with Undo (rule 5)");
  await p.waitForTimeout(5500);
  const d = await h.db();
  h.expect(d.location.on === false && !(d.visitPoints || []).some((x) => x.userId === me.id), `consent off, my points gone: ${JSON.stringify(d.location)} ${JSON.stringify(d.visitPoints)}`);
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await h.go(`/visit/${visit.id}`);
  await h.expectText(new RegExp(`${me.name} не делится геопозицией`), "the office: not sharing");
  h.expect(!officeLine.test(await h.text()), "no distance after it is taken back");

  // the company flag off: no section, no line
  await plant({ geo: HOME, loc: { allowed: false, on: false } });
  await h.go(`/visit/${visit.id}`);
  const body = await h.text();
  h.expect(!officeLine.test(body) && !/не делится геопозицией/.test(body), "flag off: nothing about location on the visit");
  await h.go("/settings");
  h.expect(!/Местоположение/.test(await h.text()), "flag off: no section in «Настройки приложения»");
};
