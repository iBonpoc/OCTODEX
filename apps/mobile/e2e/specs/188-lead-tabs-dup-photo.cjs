/**
 * e2e 188 — «Лиды и клиенты» №13, долги 1, 2 и фото лида. Every view. v2 (#2350): the lead is the Object template, its section
 * is in the address (`/lead/<id>?tab=files`), and «Лиды» has no 1280 panel (a row and a link open the lead's screen).
 * - the sections strip scrolls sideways where it does not fit: the open section «Файлы» (the last pill) is scrolled into view on
 *   its own — not left past the edge of the line (ViewTabs: «the selected pill comes to the middle»);
 * - «Возможный дубль» on a lead opens that lead's screen;
 * - the lead's «Файлы»: a visit photo whose `blob:` is of a page that is gone is the picture sign, never loaded.
 * Waits on what it checks; finds things by testID / role.
 */
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await role(h, "director");
  // the store writes its state to localStorage 250 ms after it starts: wait for it (under load h.db() was null, #1028)
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.leads ?? []).length > 0, null, { timeout: 8000 });
  let db = await h.db();
  const withEst = db.leads.filter((l) => db.estimates.some((e) => e.leadId === l.id));
  h.expect(withEst.length >= 1, "a lead with an estimate");
  const a = withEst[0];
  // plant: a second open lead with the same phone (a possible duplicate of a) and a dead visit photo on a's visit
  await p.evaluate((aid) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    const src = s.db.leads.find((l) => l.id === aid);
    s.db.leads.push({ ...src, id: "l-e2e-188", number: "L-9188", name: "Dup E2E 188", status: "new", receivedAt: new Date(Date.now() - 3_600_000).toISOString() });
    const v = s.db.visits.find((x) => x.leadId === aid) ?? s.db.visits[0];
    v.leadId = aid;
    v.photos = [...(v.photos ?? []), { id: "ph-e2e-188", kind: "before", uri: "blob:http://localhost/dead-188", at: new Date().toISOString() }];
    localStorage.setItem(k, JSON.stringify(s));
  }, a.id);
  await p.addInitScript(() => {
    const seen = (window.__imgSrc = []);
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(HTMLImageElement.prototype, "src", { ...d, set(v) { seen.push(String(v)); d.set.call(this, v); } });
  });
  const dead = () => p.evaluate(() => (window.__imgSrc || []).filter((u) => u.includes("dead-188")).length);

  // «Возможный дубль» on the planted lead opens lead a
  await h.go("/lead/l-e2e-188");
  const dup = p.getByTestId(`lead-dup-lead-${a.id}`).locator("visible=true").first();
  await dup.waitFor({ timeout: 8000 });
  await dup.click();
  await p.waitForURL((u) => u.pathname === `/lead/${a.id}`, { timeout: 8000 });
  // …and lead a points back at the planted one
  await p.getByTestId("lead-dup-lead-l-e2e-188").locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.shot("dup");

  // «Файлы» open by the address: the pill in view, the photo tile shown
  await h.go(`/lead/${a.id}?tab=files`);
  const tab = p.getByTestId("lead-screen-sections-files").locator("visible=true").first();
  await tab.waitFor({ timeout: 8000 });
  const tile = p.getByTestId("lead-photo-ph-e2e-188").locator("visible=true").first();
  await tile.waitFor({ timeout: 4000 });
  let inside = false;
  for (let i = 0; i < 30 && !inside; i++) {
    const b = await tab.boundingBox();
    inside = !!b && b.x >= 0 && b.x + b.width <= h.layout.width + 1;
    if (!inside) await p.waitForTimeout(100);
  }
  h.expect(inside, `${h.layout.width}: the open «Файлы» is scrolled into view (${JSON.stringify(await tab.boundingBox())})`);
  // the dead photo: the sign, never loaded
  h.expect((await tile.locator("img").count()) === 0, "the dead photo is the picture sign");
  h.expect((await dead()) === 0, "the dead blob: of the lead's photo is never loaded");
  await h.shot("tabs-files");
};
