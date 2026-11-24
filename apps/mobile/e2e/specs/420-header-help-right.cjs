/**
 * e2e 420 — the «?» of a screen's header (DS §12.2, #1648), the director, every view, by testID and the «?»'s name.
 * DS v2 п.26 (#2350): «?» stands right after its own words — next to the title, NOT among the header's actions («＋» · «⋯»)
 * as it did before (the old «?» · «＋» · «⋯» on the right is gone; helpButton.test.ts keeps the old places shrinking):
 * - «Звонки», «Сообщения», «Работы» have their «?», on the title's line, close after it, left of «＋»;
 * - a phone, a list opened from «Ещё»: «‹ Ещё» is a row above the title, the title stands where it stands on a tab
 *   (was: a round button left of the title that pushed it right).
 */
exports.run = async (h) => {
  const p = h.page;
  const phone = h.layout.width < 820;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const help = (name) => p.getByRole("button", { name: `Справка: ${name}`, exact: true }).locator("visible=true").first();

  // a tab list: where its title stands
  await h.go("/clients");
  await vis("screen-title").waitFor({ timeout: 8000 });
  const tabTitle = await vis("screen-title").boundingBox();

  for (const [path, name] of [["/calls", "Звонки"], ["/messages", "Сообщения"], ["/jobs", "Работы"]]) {
    await h.go(path);
    await help(name).waitFor({ timeout: 8000 });
    const q = await help(name).boundingBox();
    const title = await vis("screen-title").boundingBox();
    const cy = q.y + q.height / 2;
    h.expect(q.x >= title.x + title.width - 1, `${name}: «?» is right of the title, not on it`);
    h.expect(q.x - (title.x + title.width) < 16, `${name}: «?» stands right after the title (gap ${Math.round(q.x - title.x - title.width)})`);
    h.expect(cy > title.y && cy < title.y + title.height, `${name}: «?» is on the title's line`);
    // optional: a list may have no «＋» (Работы) — then there is no action group to compare with
    if (await vis("fab-header").count()) {
      const plus = await vis("fab-header").boundingBox();
      h.expect(q.x + q.width < plus.x, `${name}: «?» is not among the header's actions (left of «＋»)`);
    }
    if (phone && path !== "/messages") {
      const back = await vis("back-more").boundingBox();
      h.expect(back.y + back.height <= title.y + 1, `${name}: «‹ Ещё» is a row above the title`);
      h.expect(Math.abs(title.x - tabTitle.x) < 2, `${name}: the title stands where a tab's does (${Math.round(title.x)} vs ${Math.round(tabTitle.x)})`);
    }
    await h.shot(`${path.slice(1)}-header`);
  }
};
