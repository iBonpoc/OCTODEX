/**
 * Wave 6-4 (docs/specs/20 §6-4; S17, S5, S4, Customer §5): the property screen has the client's «＋» — Новая работа and
 * Смета already tied to this client and this property; the card's own «Смета» button is gone (it repeated «＋»).
 * A «do not service» client: no «＋» and no «Записать на оценку» on the property (its card and a row's list). The technician: no «＋».
 */
exports.run = async (h) => {
  const p = h.page;
  // no «＋» on a property card on any width (#1395): «Смета» and «Работа без сметы» are the card's own buttons
  const anyFab = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  await h.go("/property/p1");
  const db0 = await h.db();
  const prop = db0.properties.find((x) => x.id === "p1");
  h.expect((await anyFab().count()) === 0, "the property card has no «＋»");
  h.expect((await vis("prop-new-estimate").count()) === 1 && (await vis("prop-new-job").count()) === 1, "its own «Создать смету» and «Работа без сметы» are on the card");
  h.expect((await p.getByRole("button", { name: "Записать на оценку", exact: true }).count()) === 1, "«Записать на оценку» stays on the card (its next step, #1474)");
  await h.shot("buttons");
  await vis("prop-new-job").click(); await p.waitForTimeout(600);
  h.expect(p.url().includes(`/job/new`) && p.url().includes(`customerId=${prop.customerId}`) && p.url().includes("propertyId=p1"), `«Новая работа» is tied to the client and the property (${p.url()})`);
  await h.go("/property/p1");
  await vis("prop-new-estimate").click(); await p.waitForTimeout(600);
  h.expect(p.url().includes("/estimate/new") && p.url().includes("propertyId=p1"), `«Смета» is tied to the property (${p.url()})`);

  // «do not service»: nothing new for this property
  await p.evaluate((cid) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === cid ? { ...c, status: "do_not_service", statusReason: "Did not pay" } : c));
    localStorage.setItem(k, JSON.stringify(s));
  }, prop.customerId);
  await h.go("/property/p1");
  await h.expectText(new RegExp(prop.address.split(",")[0]), "the property opens");
  h.expect((await vis("prop-new-estimate").count()) + (await vis("prop-new-job").count()) === 0, "no new estimate or job for a «do not service» client");
  h.expect((await p.getByRole("button", { name: "Записать на оценку", exact: true }).count()) === 0, "no «Записать на оценку» either");
  await h.shot("no-service");
  await h.go("/property/p1?s=jobs");
  h.expect((await vis("property-section-new-job").count()) + (await anyFab().count()) === 0, "nothing new on the property's lists either");

  // the technician: no «＋» on a property
  await p.evaluate((cid) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === cid ? { ...c, status: "active", statusReason: undefined } : c));
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("octo.role.v1", JSON.stringify("tech"));
  }, prop.customerId);
  await h.go("/property/p1");
  h.expect((await vis("prop-new-estimate").count()) + (await vis("prop-new-job").count()) + (await anyFab().count()) === 0, "the technician: nothing new on a property");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
