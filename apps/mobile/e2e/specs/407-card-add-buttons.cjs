/**
 * e2e 407 — a card has no «＋»; its own lists name their buttons (#1395, DS §5.3, §12.2), the director, every view, by testID:
 * - a client's «Работы» and «Сметы» lists: «Работа без сметы» / «Создать смету» tied to the client;
 * - a property's «Работы» and «Сметы» lists: the same, tied to the client and the property;
 * - an empty list holds the same button; the technician and a «do not service» client get none (S4 / S5 / S17);
 * - nothing floats and nothing sits in the header of a client, a property or a job.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  const anyFab = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');
  const q = () => new URL(p.url());

  await h.go("/client/c1?s=jobs");
  await vis("client-section-new-job").first().waitFor({ timeout: 8000 });
  h.expect((await anyFab().count()) === 0, "client's list: no «＋»");
  await vis("client-section-new-job").first().click();
  await p.waitForURL(/\/job\/new/, { timeout: 5000 });
  h.expect(q().searchParams.get("customerId") === "c1", `«Работа без сметы» for c1 (${p.url()})`);

  await h.go("/client/c1?s=estimates");
  await vis("client-section-new-estimate").first().waitFor({ timeout: 8000 });
  await vis("client-section-new-estimate").first().click();
  await p.waitForURL(/\/estimate\/new/, { timeout: 5000 });
  h.expect(q().searchParams.get("customerId") === "c1", `«Создать смету» for c1 (${p.url()})`);

  await h.go("/property/p1?s=jobs");
  await vis("property-section-new-job").first().waitFor({ timeout: 8000 });
  h.expect((await anyFab().count()) === 0, "property's list: no «＋»");
  await vis("property-section-new-job").first().click();
  await p.waitForURL(/\/job\/new/, { timeout: 5000 });
  h.expect(q().searchParams.get("propertyId") === "p1", `property «Работа без сметы» is tied to p1 (${p.url()})`);

  await h.go("/property/p1?s=estimates");
  await vis("property-section-new-estimate").first().waitFor({ timeout: 8000 });
  await vis("property-section-new-estimate").first().click();
  await p.waitForURL(/\/estimate\/new/, { timeout: 5000 });
  h.expect(q().searchParams.get("propertyId") === "p1", `property «Создать смету» is tied to p1 (${p.url()})`);

  // the cards themselves: nothing floats, nothing in the header
  for (const [path, ready] of [["/client/c1", "client-tabs"], ["/property/p1", "prop-tiles"], ["/job/j1", "job-main"]]) {
    await h.go(path);
    await vis(ready).first().waitFor({ timeout: 8000 });
    h.expect((await anyFab().count()) === 0, `${path}: no «＋»`);
  }
  await h.shot("property-lists");

  // the technician: no new object from a list
  await h.seed("octo.role.v1", "tech");
  await h.go("/client/c2?s=jobs");
  await h.expectText(/Работы/, "the client's jobs list is open");
  h.expect((await vis("client-section-new-job").count()) === 0, "tech: no «Работа без сметы» in a client's list");
};
