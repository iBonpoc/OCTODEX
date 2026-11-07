/**
 * Wave 6-4 (docs/specs/20 §6-4; S17, S5, S4, Customer §5): the property screen has the client's «＋» — Новая работа and
 * Смета already tied to this client and this property; the card's own «Смета» button is gone (it repeated «＋»).
 * A «do not service» client: no «＋» and no «Осмотр» on the property (its card and a row's list). The technician: no «＋».
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const plus = () => p.locator(wide ? '[data-testid="fab-header"]:visible' : '[data-testid="fab"]:visible');
  await h.go("/property/p1");
  const db0 = await h.db();
  const prop = db0.properties.find((x) => x.id === "p1");
  h.expect((await plus().count()) === 1, "the property has «＋»");
  h.expect((await p.getByRole("button", { name: "Новая смета", exact: true }).count()) === 0, "no own «Новая смета» button (it is in «＋»)");
  h.expect((await p.getByRole("button", { name: "Осмотр", exact: true }).count()) === 1, "«Осмотр» stays on the card");
  await plus().click(); await p.waitForTimeout(400);
  await h.shot("plus");
  await p.getByText("Новая работа", { exact: true }).last().click(); await p.waitForTimeout(600);
  h.expect(p.url().includes(`/job/new`) && p.url().includes(`customerId=${prop.customerId}`) && p.url().includes("propertyId=p1"), `«Новая работа» is tied to the client and the property (${p.url()})`);
  await h.go("/property/p1");
  await plus().click(); await p.waitForTimeout(400);
  await p.getByText("Смета", { exact: true }).last().click(); await p.waitForTimeout(600);
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
  h.expect((await plus().count()) === 0, "no «＋» for a «do not service» client");
  h.expect((await p.getByRole("button", { name: "Осмотр", exact: true }).count()) === 0, "no «Осмотр» either");
  await h.shot("no-service");
  await h.go("/property/p1?s=jobs");
  h.expect((await plus().count()) === 0, "no «＋» on the property's lists either");

  // the technician: no «＋» on a property
  await p.evaluate((cid) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === cid ? { ...c, status: "active", statusReason: undefined } : c));
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("octo.role.v1", JSON.stringify("tech"));
  }, prop.customerId);
  await h.go("/property/p1");
  h.expect((await plus().count()) === 0, "the technician: no «＋»");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
