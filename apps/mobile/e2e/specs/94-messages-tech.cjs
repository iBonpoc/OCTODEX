/**
 * Wave 6-3 (docs/specs/20 «6-3», RLS activities_insert, #227 review): the technician writes to the people of his visits'
 * clients and the event goes on his job — never on the client; someone else's client or lead is not in «Кому», their
 * conversations are not in the tab, and their conversation address shows nothing (no name, no «Написать»).
 * With two of his jobs at one client he picks the job.
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const plus = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');
  await h.go("/today");
  // someone else's client with a person and a message; a lead that is not his
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers.push({ id: "c-zed", number: "CLT-0999", name: "Zed Other", phone: "(555) 555-0999", sourceId: "src-google", balanceCents: 0,
      people: [{ id: "zzzzzzzz-1111-4111-8111-000000000094", name: "Zed Other", role: "main", phones: [{ number: "(555) 555-0999", label: "mobile", primary: true }], emails: [] }] });
    s.db.activities.unshift({ id: "a-zed", subjectType: "customer", subjectId: "c-zed", kind: "sms", at: new Date().toISOString(), actorId: "m-ivan", direction: "out", body: "Zed private text" });
    s.db.leads = s.db.leads.map((l) => (l.id === "l2" ? { ...l, assigneeId: "m-ivan", createdBy: "m-ivan" } : l));
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("octo.role.v1", JSON.stringify("tech"));
  });
  await h.go("/messages");
  h.expect((await p.getByText("Zed private text").locator("visible=true").count()) === 0, "someone else's conversation is not in the tab");
  await plus().click(); await p.waitForTimeout(500);
  let sheet = h.sheet();
  const rows = sheet.getByTestId("msg-people");
  h.expect((await rows.getByText("Sarah Mitchell", { exact: true }).count()) > 0, "his visit's client is offered");
  h.expect((await rows.getByText(/Zed Other/).count()) === 0, "someone else's client is not in «Кому»");
  h.expect((await rows.getByText(/Angela Rossi/).count()) === 0, "a lead that is not his is not in «Кому»");
  await sheet.getByPlaceholder("Имя или телефон").fill("Sarah"); await p.waitForTimeout(300);
  await sheet.getByText("Sarah Mitchell", { exact: true }).first().click(); await p.waitForTimeout(300);
  await sheet.getByText("Свой текст", { exact: true }).last().click();
  await sheet.getByPlaceholder("Напишите сообщение").fill("Running 10 min late");
  await sheet.getByRole("button", { name: "Отправить", exact: true }).click(); await p.waitForTimeout(600);
  let db = await h.db();
  const ev = db.activities.find((a) => a.kind === "sms" && a.body === "Running 10 min late");
  h.expect(ev && ev.subjectType === "job", `the tech's message goes on his job, not the client (${ev && ev.subjectType})`);
  await h.shot("tech");

  // someone else's conversation by its address: nothing to read or write
  await h.go("/messages/c-c-zed");
  h.expect((await p.getByText("Zed Other").locator("visible=true").count()) === 0, "someone else's conversation shows no name");
  h.expect((await p.getByRole("button", { name: "Написать", exact: true }).count()) === 0, "and no «Написать»");

  // two of his jobs at Sarah: he picks the job
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    const v = s.db.visits.find((x) => x.jobId && (x.techId === "m-alex" || (x.assigneeIds || []).includes("m-alex")));
    const j = s.db.jobs.find((x) => x.id === v.jobId);
    s.db.jobs.push({ ...j, id: "j-second", title: "Second job", number: "JOB-0999", status: "scheduled" });
    s.db.visits.push({ ...v, id: "v-second", jobId: "j-second", start: new Date(Date.now() + 2 * 86400000).toISOString(), closed: false });
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/messages");
  await plus().click(); await p.waitForTimeout(500);
  sheet = h.sheet();
  await sheet.getByPlaceholder("Имя или телефон").fill("Sarah"); await p.waitForTimeout(300);
  await sheet.getByText("Sarah Mitchell", { exact: true }).first().click(); await p.waitForTimeout(300);
  await h.expectText(/По какой работе/, "two of his jobs: he picks one");
  await sheet.getByText("Second job", { exact: true }).last().click();
  await sheet.getByText("Свой текст", { exact: true }).last().click();
  await sheet.getByPlaceholder("Напишите сообщение").fill("About the second job");
  await sheet.getByRole("button", { name: "Отправить", exact: true }).click(); await p.waitForTimeout(600);
  db = await h.db();
  const ev2 = db.activities.find((a) => a.kind === "sms" && a.body === "About the second job");
  h.expect(ev2 && ev2.subjectType === "job" && ev2.subjectId === "j-second", "the message goes on the picked job");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
