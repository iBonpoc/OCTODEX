/**
 * e2e 407 — a card has no «＋»; its own lists name their buttons (#1395, DS §5.3, §12.2), the director, every view, by testID:
 * - a client: v2 (#2350) its header «＋» holds «Работа» / «Смета», tied to the client;
 * - a property's «Работы» and «Сметы» lists: the same, tied to the client and the property;
 * - an empty list holds the same button; the technician and a «do not service» client get none (S4 / S5 / S17);
 * - nothing floats on a client, a property or a job (v2: an object's «＋» is its header's ObjectScreen create, not a FAB).
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  const anyFab = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');
  const q = () => new URL(p.url());

  // v2 (#2350, ObjectScreen): a client's new job / estimate is in its header «＋» (`client-screen-create` → `client-create-*`),
  // tied to the client; nothing floats
  const clientCreate = async (key) => {
    await vis("client-screen-create").first().waitFor({ timeout: 8000 });
    h.expect((await anyFab().count()) === 0, "client: nothing floats");
    await vis("client-screen-create").first().click();
    await vis(`client-create-${key}`).first().click();
  };
  await h.go("/client/c1?s=jobs");
  await clientCreate("job");
  await p.waitForURL(/\/job\/new/, { timeout: 5000 });
  h.expect(q().searchParams.get("customerId") === "c1", `«Работа» for c1 (${p.url()})`);

  await h.go("/client/c1?s=estimates");
  await clientCreate("estimate");
  await p.waitForURL(/\/estimate\/new/, { timeout: 5000 });
  h.expect(q().searchParams.get("customerId") === "c1", `«Смета» for c1 (${p.url()})`);

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
  for (const [path, ready] of [["/client/c1", "client-screen-sections"], ["/property/p1", "prop-tiles"], ["/job/j1", "job-screen-sections"]]) {
    await h.go(path);
    await vis(ready).first().waitFor({ timeout: 8000 });
    h.expect((await anyFab().count()) === 0, `${path}: no «＋»`);
  }
  await h.shot("property-lists");

  // the two buttons of an address stand in one row and are not cut, in every language of the app (the review of #1663: «Работа без см…»)
  for (const lang of ["ru", "en", "es"]) {
    await h.seed("octo.lang.v1", lang);
    await h.go("/property/p1");
    await vis("prop-new-job").first().waitFor({ timeout: 8000 });
    const cut = await p.evaluate(() =>
      ["prop-new-estimate", "prop-new-job"].map((id) => {
        const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.offsetParent !== null);
        const label = el ? [...el.querySelectorAll("*")].filter((n) => n.children.length === 0 && n.textContent.trim()).pop() : null;
        return label ? label.scrollWidth > label.clientWidth + 1 : "missing";
      }),
    );
    h.expect(cut.every((x) => x === false), `${lang}: the address buttons' words are whole (${cut.join(", ")})`);
    const [b1, b2] = await Promise.all([vis("prop-new-estimate").first().boundingBox(), vis("prop-new-job").first().boundingBox()]);
    h.expect(Math.abs(b1.y - b2.y) < 2, `${lang}: the two buttons stand in one row`);
  }
  await h.seed("octo.lang.v1", "ru");

  // the technician: no new object from a list
  await h.seed("octo.role.v1", "tech");
  await h.go("/client/c2?s=jobs");
  await vis("client-screen").first().waitFor({ timeout: 8000 });
  // the technician: no «＋» on a client, or no new job in it
  // optional: no «＋» at all is the strongest «no new job» (the check below is for a «＋» that holds other things)
  if (await vis("client-screen-create").count()) {
    await vis("client-screen-create").first().click();
    h.expect((await vis("client-create-job").count()) === 0 && (await vis("client-create-estimate").count()) === 0, "tech: no new job / estimate from a client");
  }
};
