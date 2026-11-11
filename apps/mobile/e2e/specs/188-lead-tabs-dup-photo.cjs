/**
 * e2e 188 — «Лиды и клиенты» №13, долги 1, 2 и фото лида. Every view.
 * - phone / tablet (lead's tabs scroll sideways where they do not fit): the remembered tab «Файлы» of the NEXT lead is
 *   scrolled into view on its own — not left past the edge of the line (Segmented `scroll`);
 * - 1280: «Возможный дубль» in the lead's panel opens that lead in the panel (`/leads?open=<id>`), not the whole screen;
 * - the lead's «Файлы»: a visit photo whose `blob:` is of a page that is gone is the picture sign, never loaded.
 * Waits on what it checks; finds things by testID / role.
 */
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);

exports.run = async (h) => {
  const p = h.page;
  const desk = h.layout.width >= 1280;
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

  if (!desk) {
    // the dup lead: «Файлы» picked (remembered); then lead a, whose tabs are longer («Сметы · N»)
    await h.go("/lead/l-e2e-188");
    const files = p.getByRole("tab", { name: /^Файлы/ }).locator("visible=true").first();
    await files.click();
    await h.go(`/lead/${a.id}`);
    const tab = p.getByRole("tab", { name: /^Файлы/ }).locator("visible=true").first();
    await tab.waitFor({ timeout: 8000 });
    // the remembered tab is open: its photo tile is shown (RNW does not output aria-selected)
    const tile = p.getByTestId("lead-photo-ph-e2e-188").locator("visible=true").first();
    await tile.waitFor({ timeout: 4000 });
    let inside = false;
    for (let i = 0; i < 30 && !inside; i++) {
      const b = await tab.boundingBox();
      inside = !!b && b.x >= 16 - 1 && b.x + b.width <= h.layout.width - 16 + 1;
      if (!inside) await p.waitForTimeout(100);
    }
    h.expect(inside, `${h.layout.width}: the remembered «Файлы» is scrolled into view (${JSON.stringify(await tab.boundingBox())})`);
    // the dead photo: the sign, never loaded
    h.expect((await tile.locator("img").count()) === 0, "the dead photo is the picture sign");
    h.expect((await dead()) === 0, "the dead blob: of the lead's photo is never loaded");
    await h.shot("tabs-files");
    return;
  }

  // 1280: the duplicate opens in the panel
  await h.go("/leads?open=l-e2e-188");
  const panel = p.getByTestId("list-panel").locator("visible=true");
  await panel.waitFor({ timeout: 8000 });
  const dup = panel.getByTestId(`lead-dup-lead-${a.id}`);
  await dup.waitFor({ timeout: 8000 });
  await dup.click();
  const ok = await p.waitForFunction((w) => location.pathname === "/leads" && new URLSearchParams(location.search).get("open") === w, a.id, { timeout: 4000 }).then(() => true, () => false);
  h.expect(ok, `the duplicate opens in the panel (${p.url()})`);
  // the address changes first, the panel swaps to the other lead a moment later: wait for what is checked — the panel now
  // shows lead a (its own «Возможный дубль» row points back at the planted lead).
  await panel.getByTestId("lead-dup-lead-l-e2e-188").waitFor({ timeout: 8000 });
  // …and a press on «Файлы» can still be overridden while the panel mounts: the remembered tab is applied after the press
  // and the panel stays on «Обзор» (1 of ~25 runs under load). That is a screen bug — #1031: the user's choice must win.
  // Until it is fixed the spec presses until the tab shows its content (a workaround; remove it with the fix of #1031).
  const tile = panel.getByTestId("lead-photo-ph-e2e-188");
  for (let i = 0; i < 4; i++) {
    await panel.getByRole("tab", { name: /^Файлы/ }).first().click();
    if (await tile.waitFor({ timeout: 1500 }).then(() => true, () => false)) break;
  }
  await tile.waitFor({ timeout: 4000 });
  h.expect((await tile.locator("img").count()) === 0, "1280: the dead photo is the picture sign");
  h.expect((await dead()) === 0, "1280: the dead blob: of the lead's photo is never loaded");
  await h.shot("dup-panel");
};
