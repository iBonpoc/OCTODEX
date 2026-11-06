/**
 * Wave 7б-2 (docs/specs/03 §12, Б1; story map S15, S23): the tech's consent and «You are at the address».
 * The company allows location (off by default — AB 1331, the spec turns the flag on). The first «Я в пути» asks with the
 * notice; «Согласен» → the step goes, the point goes, «Геопозиция передаётся». Far away — no hint; at the address —
 * «Вы у адреса — отметить «На месте»?»; «На месте» clears «Опаздывает» for the office (S15, the rule is not changed).
 * Answered once — the next «Я в пути» does not ask again. The flag off — no question at all.
 * Own late visit on a free client; the browser's location is Playwright's (no real GPS).
 */
const HOME = { latitude: 34.1478, longitude: -118.1445 };
const FAR = { latitude: 34.1778, longitude: -118.1445 }; // ~3.3 km north

exports.run = async (h) => {
  const p = h.page;
  const ctx = p.context();
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation({ ...FAR, accuracy: 20 });
  await h.go("/today");
  const db = await h.db();
  const me = db.members.find((m) => m.id === db.me);
  const custOf = (pid) => db.properties.find((x) => x.id === pid)?.customerId;
  const busyClients = new Set(db.visits.map((v) => custOf(v.propertyId ?? db.jobs.find((j) => j.id === v.jobId)?.propertyId)));
  const prop = db.properties.find((x) => !busyClients.has(x.customerId) && db.customers.some((c) => c.id === x.customerId));
  h.expect(prop, "demo has a free property");
  const client = db.customers.find((c) => c.id === prop.customerId);
  const plant = (opts) => p.evaluate(([pid, geo, visits, loc]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.properties = raw.db.properties.map((x) => (x.id === pid ? { ...x, geo } : x));
    raw.db.visits = [...visits, ...raw.db.visits.filter((v) => !v.id.startsWith("e2e-"))];
    raw.db.location = loc;
    raw.db.visitPoints = [];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.removeItem("octo.locationAsked.v1");
    localStorage.setItem("octo.role.v1", JSON.stringify("tech"));
  }, [prop.id, { lat: HOME.latitude, lng: HOME.longitude }, opts.visits, opts.loc]);
  const visit = (id) => ({ id, propertyId: prop.id, kind: "inspection", techId: me.id, assigneeIds: [me.id], start: new Date(Date.now() - 16 * 60_000).toISOString(), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 });

  // the company flag off: «Я в пути» goes straight, no question, nothing shared
  await plant({ visits: [visit("e2e-geo-off")], loc: { allowed: false, on: false } });
  await h.go("/visit/e2e-geo-off");
  await h.click("Я в пути");
  let body = await h.text();
  h.expect(!/Делиться геопозицией во время выезда/.test(body) && !/Геопозиция передаётся/.test(body), "flag off: no question, no sharing");
  h.expect((await h.db()).visits.find((v) => v.id === "e2e-geo-off").step === "en_route", "flag off: the step goes as before");

  // the flag on: the first «Я в пути» asks with the notice
  await plant({ visits: [visit("e2e-geo")], loc: { allowed: true, on: false } });
  await h.go("/visit/e2e-geo");
  await h.click("Я в пути");
  await h.expectText(/Делиться геопозицией во время выезда\?/, "the question comes before the first «on the way»");
  await h.expectText(/Точки хранятся 30 дней/, "the notice says how long the points are kept");
  h.expect((await h.db()).visits.find((v) => v.id === "e2e-geo").step === "scheduled", "nothing moves until the tech answers");
  await h.shot("consent");
  await h.click("Согласен");
  await p.waitForTimeout(1200);
  let d = await h.db();
  h.expect(d.location.on === true && !!d.location.ackAt, `consent saved with the notice time: ${JSON.stringify(d.location)}`);
  h.expect(d.visits.find((v) => v.id === "e2e-geo").step === "en_route", "then the step goes");
  await h.expectText(/Геопозиция передаётся/, "the tech sees that the location goes out");
  d = await h.db();
  const pt = (d.visitPoints || []).find((x) => x.visitId === "e2e-geo" && x.userId === me.id);
  h.expect(pt && Math.abs(pt.lat - FAR.latitude) < 0.001, `a point is kept for the visit: ${JSON.stringify(pt)}`);
  h.expect(!/Вы у адреса/.test(await h.text()), "3 km away: no hint");

  // at the address: the hint above «На месте»
  await ctx.setGeolocation({ ...HOME, accuracy: 15 });
  await h.go("/visit/e2e-geo");
  await p.waitForTimeout(800);
  await h.expectText(/Вы у адреса — отметить «На месте»\?/, "at the address: the hint");
  await h.shot("near");
  await h.click("На месте");
  h.expect((await h.db()).visits.find((v) => v.id === "e2e-geo").step === "on_site", "one tap: on site");

  // S15: «on site» clears «late» for the office
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await h.go("/today");
  h.expect(!new RegExp(`${me.name} опаздывает на ${client.name}`).test(await h.text()), "on site: the office has no «late» for it");

  // answered once: the next «Я в пути» does not ask again
  await p.evaluate((v) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [v, ...raw.db.visits.filter((x) => x.id !== v.id)];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.role.v1", JSON.stringify("tech"));
  }, visit("e2e-geo2"));
  await h.go("/visit/e2e-geo2");
  await h.click("Я в пути");
  body = await h.text();
  h.expect(!/Делиться геопозицией во время выезда/.test(body), "asked once: no second question");
  h.expect((await h.db()).visits.find((v) => v.id === "e2e-geo2").step === "en_route", "the step goes at once");
};
