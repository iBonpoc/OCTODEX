/**
 * Wave 6-2 (docs/specs/20 §5, §8): «Позвонить» on a client asks «Чем кончился?» and writes the call on the client with
 * its person; it shows in «Звонки». The technician cannot write on a client (RLS): his «Записать звонок» offers only
 * his jobs and leads.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/client/c1");
  await p.getByRole("button", { name: "Позвонить", exact: true }).first().click(); await p.waitForTimeout(500);
  const sheet = h.sheet();
  await h.expectText(/Записать звонок/, "after «Позвонить» — the call sheet");
  await h.expectText(/Кому.*Sarah Mitchell/, "the call goes to the client");
  h.expect(await sheet.getByRole("button", { name: "Сохранить звонок" }).isDisabled(), "no save without an outcome");
  await sheet.getByText("Поговорили", { exact: true }).last().click();
  await sheet.getByPlaceholder("О чём договорились (необязательно)").fill("Booked for Monday");
  await h.shot("sheet");
  await sheet.getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  const db = await h.db();
  const a = db.activities.find((x) => x.kind === "call" && x.subjectType === "customer" && x.subjectId === "c1");
  h.expect(a && a.meta.outcome === "answered" && a.body === "Booked for Monday" && !!a.contactId, "the call is on the client, with the person and the note");
  await h.go("/calls");
  await h.expectText(/Sarah Mitchell.*Поговорили/, "it is in «Звонки»");
  await h.expectText(/Booked for Monday/, "with its note");

  // a client without people (an old one): the app makes up a «main» person — it is never sent as the call's person
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === "c2" ? { ...c, people: undefined } : c));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/client/c2");
  await p.getByRole("button", { name: "Позвонить", exact: true }).first().click(); await p.waitForTimeout(500);
  await h.sheet().getByText("Не ответил", { exact: true }).last().click();
  await h.sheet().getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  const db2 = await h.db();
  const a2 = db2.activities.find((x) => x.kind === "call" && x.subjectId === "c2");
  h.expect(a2 && !a2.contactId, `the made-up person is not the call's person (${a2 && a2.contactId})`);

  // the technician: his jobs and leads only, never a client
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/calls");
  const wide = h.layout.width > 390;
  await p.locator(wide ? '[data-testid="fab-header"]:visible' : '[data-testid="fab"]:visible').click(); await p.waitForTimeout(400);
  await h.sheet().getByText("Записать звонок", { exact: true }).last().click(); await p.waitForTimeout(500);
  const places = p.getByTestId("call-places").locator("visible=true");
  h.expect((await p.getByPlaceholder("Работа или лид").locator("visible=true").count()) === 1, "the tech searches a job or a lead");
  h.expect((await places.getByText("Клиент", { exact: true }).count()) === 0, "no client among the tech's places");
  h.expect((await places.getByText("Работа", { exact: true }).count()) > 0, "his jobs are there");
  await h.shot("tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
