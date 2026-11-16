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

  /** the job's «Деньги» tab (the tab is there for who sees the money) */
  const money = async () => {
    await tid("job-screen").waitFor({ timeout: 8000 });
    if (await vis("job-tab-money").count()) await tid("job-tab-money").click();
  };

  // 1) j2 has no estimate
  await h.go("/job/j2");
  await tid("job-screen").waitFor({ timeout: 8000 });
  // «Связано»: icon + name, no «Клиент» / «Объект»; and no «Создать смету» there any more
  for (const k of ["customer", "property"]) {
    const text = (await tid(`related-${k}`).innerText()).trim();
    h.expect(!/^(Клиент|Объект)\b/.test(text), `«Связано»: ${k} without the word (${text})`);
    h.expect(/^(Связано|Related)/.test((await tid(`related-${k}`).getAttribute("aria-label")) || ""), `«Связано»: ${k} keeps its word for the screen reader`);
  }
  await tid("job-rel-new-estimate").waitFor({ timeout: 8000 });
  // «Деньги»: «Сметы нет», and still one «Создать смету» on the screen
  await money();
  await tid("job-money-no-estimate").waitFor({ timeout: 8000 });
  h.expect((await vis("job-rel-new-estimate").count()) === 1, "one «Создать смету» on the screen (not a second one in «Деньги»)");
  await h.shot("job-j2");
  await tid("job-rel-new-estimate").click();
  await p.waitForURL(/\/estimate\/new\?customerId=c2&propertyId=p2/, { timeout: 8000 });
  // j1 has one
  await h.go("/job/j1");
  await money();
  h.expect((await vis("job-rel-new-estimate").count()) === 0, "a job with an estimate: no «Создать смету»");
  h.expect((await vis("job-money-no-estimate").count()) === 0, "a job with an estimate: no «Сметы нет»");

  // 2) the lists
  for (const [path, id] of [
    ["/client/c1?s=jobs", "client-section-new-job"],
    ["/client/c1?s=estimates", "client-section-new-estimate"],
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
  h.expect((await vis("job-rel-new-estimate").count()) === 0, "the technician: no «Создать смету»");
  // …nor in a client's or an address's list (the header slot stays empty on every width)
  for (const [path, id] of [["/client/c2?s=jobs", "client-section-new-job"], ["/property/p2?s=estimates", "property-section-new-estimate"]]) {
    await h.go(path);
    await h.expectText(/Работы|Сметы/, `${path}: the list is open`);
    h.expect((await vis(id).count()) === 0, `${path}: the technician has no «＋» in a list`);
  }

  // 4) «не обслуживаем» (Linda, c3: job j3 with no estimate, address p3): neither the chip nor the list buttons (any role of the office)
  await h.seed("octo.role.v1", "director");
  await h.go("/job/j3");
  await tid("job-rel-new-estimate").waitFor({ timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw.db.customers.find((c) => c.id === "c3").status = "do_not_service";
  await h.seed("octo.db.v5", raw);
  await h.go("/job/j3");
  await tid("job-screen").waitFor({ timeout: 8000 });
  h.expect((await vis("job-rel-new-estimate").count()) === 0, "«не обслуживаем»: no «Создать смету»");
  for (const [path, id] of [["/client/c3?s=jobs", "client-section-new-job"], ["/property/p3?s=jobs", "property-section-new-job"]]) {
    await h.go(path);
    await h.expectText(/Работы/, `${path}: the list is open`);
    h.expect((await vis(id).count()) === 0, `${path}: «не обслуживаем» has no «＋» in a list`);
  }
};
