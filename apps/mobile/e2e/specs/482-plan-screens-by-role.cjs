/**
 * e2e 482 (#2016) — «Запланировать работу» (/job/schedule) and the property card ask the role (src/nav/roles.ts, story map
 * S9 «Выезд»). Six views (h.layout).
 * С1 ДАНО the technician (or sales), КОГДА they open /job/schedule?jobId=… by a link, ТОГДА «Нет доступа»: back to the home
 *    screen with the toast, no «Запланировать» form; the dispatcher sees the form.
 * С2 ДАНО the technician, КОГДА he opens /property/<id> of a client none of his visits is for, ТОГДА «Нет доступа к этому
 *    объекту»; the dispatcher sees the property.
 */
// the role is put in from a page without the app (h.seed, CHECKS §9 №12)
const setRole = (h, role) => h.seed("octo.role.v1", role);
const at = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  await h.go("/more");
  // a job of the demo and a property of a client the technician has no visit for (the demo's own data)
  const { jobId, propertyId } = await p.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("octo.db.v5")).db;
    const mine = new Set(
      db.visits
        .filter((v) => v.techId === db.me || (v.assigneeIds || []).includes(db.me))
        .map((v) => (db.properties.find((x) => x.id === (db.jobs.find((j) => j.id === v.jobId) || {}).propertyId) || {}).customerId)
        .filter(Boolean),
    );
    const prop = db.properties.find((x) => !mine.has(x.customerId));
    const job = db.jobs.find((j) => j.status === "draft" || j.status === "unscheduled") || db.jobs[0];
    return { jobId: job && job.id, propertyId: prop && prop.id };
  });
  h.expect(!!jobId && !!propertyId, `the demo has a job (${jobId}) and a property the tech does not see (${propertyId})`);

  // С1: the technician — closed
  for (const role of ["tech", "sales"]) {
    await setRole(h, role);
    await h.go(`/job/schedule?jobId=${jobId}`);
    await h.expectText(/Нет доступа к этому экрану/, `С1 ${role} ${h.layout}: «Нет доступа»`);
    h.expect(!at(h).startsWith("/job/schedule"), `С1 ${role}: back to the home screen (${at(h)})`);
    h.expect((await p.getByTestId("sch-save").count()) === 0, `С1 ${role}: no «Запланировать» form`);
  }
  // С1: the dispatcher — the form
  await setRole(h, "dispatcher");
  await h.go(`/job/schedule?jobId=${jobId}`);
  await p.getByTestId("sch-save").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(at(h).startsWith("/job/schedule"), "С1 dispatcher: the screen opens");
  await h.shot("dispatcher-schedule");

  // С2: the technician — a property of a client he does not see
  await setRole(h, "tech");
  await h.go(`/property/${propertyId}`);
  await p.getByTestId("property-no-access").locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.expectText(/Нет доступа к этому объекту/, `С2 tech ${h.layout}: «Нет доступа к этому объекту»`);
  await h.shot("tech-property");
  // С2: the dispatcher sees it
  await setRole(h, "dispatcher");
  await h.go(`/property/${propertyId}`);
  await p.getByTestId("prop-tiles").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("property-no-access").count()) === 0, "С2 dispatcher: the property opens");
};
