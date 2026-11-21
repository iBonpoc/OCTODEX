/**
 * e2e 422 — the rest of the review of the objects' cards (#1664, #1395 group 2), as the director, every view, by testID:
 * - a job with no estimate names «Создать смету» in «Связано» under the header (DS §12.3 п.6; independent review of #1844); its
 *   «Деньги» tab says «Сметы нет» without a second button; a job that has an estimate does not; the technician does not see it;
 *   it opens a new estimate for the job's client and address;
 * - «Связано» names the client and the address without the words «Клиент» / «Объект» (icon + name; the word stays for the screen reader);
 * - the list of a client's or an address's jobs and estimates: on a phone «＋ …» stands over the list, from 820 in the header on the right
 *   (never over the grid on the left).
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  const tid = (id) => vis(id).first();

  /** the job's «Сметы» section (it is there for who sees the money) */
  const money = async () => {
    await tid("job-screen").waitFor({ timeout: 8000 });
    await require("../objectScreen.cjs").objSection(p, "job-screen", "estimates");
  };

  // 1) j2 has no estimate
  await h.go("/job/j2");
  await tid("job-screen").waitFor({ timeout: 8000 });
  // the head (LAYOUT-RULES §3, #2350): the client is one link with its name, the word only for the screen reader; the address is not
  // repeated in «Связано» (П7)
  // phone: the header's parent link (the hierarchy's parent of a job is its client); 820 / 1280: the last crumb of the trail
  const clientLink = h.layout.width >= 820 ? p.locator('[data-testid^="crumb-/client/"]').locator("visible=true").first() : tid("hdr-parent");
  const client = (await clientLink.innerText()).trim();
  h.expect(!/^Клиент\b/.test(client), `the head: the client without the word (${client})`);
  h.expect(((await clientLink.getAttribute("aria-label")) || "").includes(client), "the head: the client link is named for the screen reader");
  h.expect((await vis("related-customer").count()) + (await vis("related-property").count()) === 0, "«Связано» does not repeat the client and the address");
  // «Сметы»: «Сметы нет» and the one «Создать смету» on the screen
  await money();
  await tid("job-money-no-estimate").waitFor({ timeout: 8000 });
  h.expect((await vis("job-rel-new-estimate").count()) === 1, "one «Создать смету» on the screen");
  await h.shot("job-j2");
  await tid("job-rel-new-estimate").click();
  await p.waitForURL(/\/estimate\/new\?customerId=c2&propertyId=p2/, { timeout: 8000 });
  // j1 has one
  await h.go("/job/j1");
  await money();
  h.expect((await vis("job-rel-new-estimate").count()) === 0, "a job with an estimate: no «Создать смету»");
  h.expect((await vis("job-money-no-estimate").count()) === 0, "a job with an estimate: no «Сметы нет»");

  // 2) the lists. A client (v2): one «＋» in the header with a menu of «Работа» / «Смета» / «Задача» / … (`client-screen-create`);
  // an address keeps the «＋» of its list
  const clientMenu = async (path) => {
    await h.go(path);
    await tid("client-screen").waitFor({ timeout: 8000 });
    const has = (await vis("client-screen-create").count()) > 0;
    if (!has) return { has, items: [] };
    await tid("client-screen-create").getByRole("button").first().click();
    await tid("menu-items").waitFor({ timeout: 3000 });
    const items = await p.locator('[data-testid^="client-create-"]').locator("visible=true").evaluateAll((els) => els.map((e) => e.dataset.testid));
    await require("../sheet.cjs").pressEscUntilClosed(p);
    return { has, items };
  };
  for (const path of ["/client/c1?s=jobs", "/client/c1?s=estimates"]) {
    const m = await clientMenu(path);
    h.expect(m.has && m.items.includes("client-create-job") && m.items.includes("client-create-estimate"), `${path}: the header's «＋» offers a job and an estimate (${m.items.join(", ")})`);
  }
  for (const [path, id] of [
    ["/property/p1?s=jobs", "property-section-new-job"],
    ["/property/p1?s=estimates", "property-section-new-estimate"],
  ]) {
    await h.go(path);
    await tid(id).waitFor({ timeout: 8000 });
    await h.shot(id);
    h.expect((await vis(id).count()) === 1, `${path}: one «＋» button`);
    const b = await tid(id).boundingBox();
    if (wide) h.expect(b.y < 110 && b.x > h.layout.width / 2, `${path}: from 820 the button is in the header on the right (${Math.round(b.x)}, ${Math.round(b.y)})`);
    else h.expect(b.y > 110, `${path}: on a phone the button stands over the list (${Math.round(b.y)})`);
  }

  // 3) the technician: no such action
  await h.seed("octo.role.v1", "tech");
  await h.go("/job/j2");
  await tid("job-screen").waitFor({ timeout: 8000 });
  h.expect((await vis("job-tab-estimates").count()) === 0 && (await vis("job-rel-new-estimate").count()) === 0, "the technician: no «Сметы», no «Создать смету»");
  // …nor in a client's or an address's list (the header slot stays empty on every width)
  {
    const m = await clientMenu("/client/c2?s=jobs");
    h.expect(!m.has, "/client/c2?s=jobs: the technician has no «＋» on a client");
    await h.go("/property/p2?s=estimates");
    await h.expectText(/Сметы/, "/property/p2?s=estimates: the list is open");
    h.expect((await vis("property-section-new-estimate").count()) === 0, "/property/p2?s=estimates: the technician has no «＋» in a list");
  }

  // 4) «не обслуживаем» (Linda, c3: job j3 with no estimate, address p3): neither the chip nor the list buttons (any role of the office)
  await h.seed("octo.role.v1", "director");
  await h.go("/job/j3");
  await money();
  await tid("job-rel-new-estimate").waitFor({ timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw.db.customers.find((c) => c.id === "c3").status = "do_not_service";
  await h.seed("octo.db.v5", raw);
  await h.go("/job/j3");
  await money();
  h.expect((await vis("job-rel-new-estimate").count()) === 0, "«не обслуживаем»: no «Создать смету»");
  {
    const m = await clientMenu("/client/c3?s=jobs");
    h.expect(!m.items.includes("client-create-job") && !m.items.includes("client-create-estimate"), `/client/c3?s=jobs: «не обслуживаем» offers neither a job nor an estimate (${m.items.join(", ")})`);
    await h.go("/property/p3?s=jobs");
    await h.expectText(/Работы/, "/property/p3?s=jobs: the list is open");
    h.expect((await vis("property-section-new-job").count()) === 0, "/property/p3?s=jobs: «не обслуживаем» has no «＋» in a list");
  }
};
