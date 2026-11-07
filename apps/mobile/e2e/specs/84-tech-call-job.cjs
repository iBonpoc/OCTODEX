/**
 * Wave 6-4 (docs/specs/20 §6-4, S24): the technician presses «Позвонить» on a client where he has two jobs — «Кому»
 * offers only this client's jobs of his (and his leads there), no search over his whole list; the call goes on the
 * picked job with the person, never on the client (RLS activities_insert).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  // a second job of Alex at Sarah (c1), and a job of his at another client that must not be offered here
  const other = await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    const mine = (x) => x.jobId && (x.techId === "m-alex" || (x.assigneeIds || []).includes("m-alex"));
    const custOf = (j) => j.customerId || (s.db.properties.find((pp) => pp.id === j.propertyId) || {}).customerId;
    const v = s.db.visits.find((x) => mine(x) && custOf(s.db.jobs.find((j) => j.id === x.jobId)) === "c1");
    const j = s.db.jobs.find((x) => x.id === v.jobId);
    const soon = new Date(Date.now() + 2 * 86400000).toISOString();
    s.db.jobs.push({ ...j, id: "j-second", title: "Second job", number: "JOB-0998", status: "scheduled" });
    s.db.visits.push({ ...v, id: "v-second", jobId: "j-second", start: soon, closed: false });
    const oc = s.db.customers.find((c) => c.id !== "c1");
    const op = s.db.properties.find((pp) => pp.customerId === oc.id);
    s.db.jobs.push({ ...j, id: "j-elsewhere", title: "Elsewhere job", number: "JOB-0997", status: "scheduled", customerId: oc.id, propertyId: op ? op.id : j.propertyId });
    s.db.visits.push({ ...v, id: "v-elsewhere", jobId: "j-elsewhere", start: soon, closed: false });
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("octo.role.v1", JSON.stringify("tech"));
    return j.title;
  });
  await h.go("/client/c1");
  await p.getByRole("button", { name: "Позвонить", exact: true }).first().click(); await p.waitForTimeout(500);
  const sheet = h.sheet();
  await h.expectText(/Записать звонок/, "after «Позвонить» — the call sheet");
  const places = p.getByTestId("call-places").locator("visible=true");
  h.expect((await places.getByText("Second job", { exact: true }).count()) === 1, "his second job at this client is offered");
  h.expect((await places.getByText(other, { exact: true }).count()) >= 1, "and his first one");
  h.expect((await places.getByText("Elsewhere job", { exact: true }).count()) === 0, "his job at another client is not");
  h.expect((await p.getByPlaceholder("Работа или лид").locator("visible=true").count()) === 0, "no search over his whole list");
  h.expect((await places.getByText("Клиент", { exact: true }).count()) === 0, "never the client itself");
  await h.shot("pick");
  await places.getByText("Second job", { exact: true }).click(); await p.waitForTimeout(300);
  await sheet.getByText("Не ответил", { exact: true }).last().click();
  await sheet.getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  const db = await h.db();
  const a = db.activities.find((x) => x.kind === "call" && x.subjectId === "j-second");
  h.expect(a && a.subjectType === "job" && a.meta.outcome === "no_answer", "the call is on the picked job");
  h.expect(a && !!a.contactId, "with the person he called");
  h.expect(!db.activities.some((x) => x.kind === "call" && x.subjectType === "customer" && x.actorId === db.me && x.at === a.at), "not on the client");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
