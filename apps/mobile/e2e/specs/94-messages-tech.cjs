/**
 * Wave 6-3 (docs/specs/20 «6-3», RLS activities_insert): the technician writes to the people of his visits' clients,
 * and the event goes on his job — never on the client itself.
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/messages");
  await p.locator(wide ? '[data-testid="fab-header"]:visible' : '[data-testid="fab"]:visible').click(); await p.waitForTimeout(500);
  const sheet = h.sheet();
  const rows = sheet.getByTestId("msg-people");
  h.expect((await rows.getByText("Sarah Mitchell", { exact: true }).count()) > 0, "his visit's client is offered");
  await sheet.getByPlaceholder("Имя или телефон").fill("Sarah"); await p.waitForTimeout(300);
  await sheet.getByText("Sarah Mitchell", { exact: true }).first().click(); await p.waitForTimeout(300);
  await sheet.getByText("Свой текст", { exact: true }).last().click();
  await sheet.getByPlaceholder("Напишите сообщение").fill("Running 10 min late");
  await sheet.getByRole("button", { name: "Отправить", exact: true }).click(); await p.waitForTimeout(600);
  const db = await h.db();
  const ev = db.activities.find((a) => a.kind === "sms" && a.body === "Running 10 min late");
  h.expect(ev && ev.subjectType === "job", `the tech's message goes on his job, not the client (${ev && ev.subjectType})`);
  await h.shot("tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
