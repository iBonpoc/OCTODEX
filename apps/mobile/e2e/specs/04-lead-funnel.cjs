/** Lead → estimate from lead → sent → signed → client; lost with reason; manual conversion; notes. */
/** S8b (docs/specs/07 §2.2 А, founder 05.11): an employee signs the contract for the company on the estimate screen. */
async function countersign(h, estimateId) {
  await h.go(`/estimate/${estimateId}`);
  const pad = h.page.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded(); await h.page.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await h.page.mouse.move(bb.x + 30, bb.y + 90); await h.page.mouse.down();
  for (let i = 0; i < 20; i++) await h.page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await h.page.mouse.up();
  await h.page.getByRole("button", { name: "Подписать договор" }).last().click(); await h.page.waitForTimeout(700);
}

exports.run = async (h) => {
  await h.go("/inbox");
  await h.page.getByText("Kevin Brooks", { exact: true }).first().click(); await h.page.waitForTimeout(700);
  await h.clickText("Сметы");
  await h.click("Смета");
  await h.page.getByRole("button", { name: "Добавить позицию" }).first().click(); await h.page.waitForTimeout(300);
  await h.sheet().getByPlaceholder(/Начните писать/).fill("Replace water heater");
  await h.sheet().getByText(/Своя позиция:/).click(); await h.page.waitForTimeout(250);
  await h.sheet().locator('input[inputmode="decimal"]').nth(1).fill("1850");
  await h.sheet().getByRole("button", { name: "Готово" }).click(); await h.page.waitForTimeout(250);
  await h.page.getByRole("button", { name: "Сохранить и отправить" }).click(); await h.page.waitForTimeout(700);
  await h.page.getByRole("button", { name: "Копировать ссылку" }).click(); await h.page.waitForTimeout(400);
  let db = await h.db();
  const kevin = db.leads.find((l) => l.name === "Kevin Brooks");
  h.expect(kevin.status === "estimate_sent", "lead → estimate sent");
  h.expect(db.customers.find((c) => c.id === kevin.customerId).status === "prospect", "prospect customer");
  const est = db.estimates.find((e) => e.leadId === kevin.id);
  await h.go(`/p/${est.token}`);
  await h.sign("Kevin Brooks");
  db = await h.db();
  h.expect(db.leads.find((l) => l.id === kevin.id).status === "estimate_sent", "client signed: not won until the company signs");
  await countersign(h, est.id);
  db = await h.db();
  h.expect(db.leads.find((l) => l.id === kevin.id).status === "won", "signed → client");
  h.expect(db.customers.find((c) => c.id === kevin.customerId).status === "active", "prospect → active");
  const tom = db.leads.find((l) => l.name === "Tom Becker");
  await h.go(`/lead/${tom.id}`);
  await h.page.getByRole("button", { name: /^Статус:/ }).first().click(); await h.page.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Закрыть лид" }).click(); await h.page.waitForTimeout(300);
  await h.sheet().getByRole("radio", { name: "Дорого" }).click();
  await h.sheet().getByRole("button", { name: "Закрыть как потерянный" }).click(); await h.page.waitForTimeout(400);
  const nina = db.leads.find((l) => l.name === "Nina Patel");
  await h.go(`/lead/${nina.id}`);
  await h.page.getByRole("button", { name: /^Статус:/ }).first().click(); await h.page.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Сделать клиентом" }).click(); await h.page.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Сделать клиентом" }).click(); await h.page.waitForTimeout(400);
  db = await h.db();
  h.expect(db.leads.find((l) => l.id === tom.id).lostReason === "price_too_high" && db.leads.find((l) => l.id === tom.id).status === "lost", "lost with reason");
  h.expect(db.leads.find((l) => l.id === nina.id).wonVia === "manual", "manual conversion");
  await h.go("/client/c1");
  await h.page.getByPlaceholder(/Собака во дворе/).fill("Call before arrival");
  await h.click("Добавить заметку");
  db = await h.db();
  h.expect(db.notes.some((n) => n.body === "Call before arrival"), "note saved");
};
