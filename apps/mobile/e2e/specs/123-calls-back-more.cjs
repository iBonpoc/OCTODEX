/**
 * «Звонки» is a section of «Ещё» now (docs/specs/28): opened from the tile it is pushed over the tabs —
 * «‹ Ещё» and the browser's/phone's back return to «Ещё» (before: no button, no swipe). The floating «＋» of a section
 * outside the tabs sits above the bar and never covers the last card; the toast «Отменить» is not under the bar.
 */
const path = (h) => new URL(h.page.url()).pathname;
const box = async (l) => (await l.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  await h.go("/more");
  await p.locator('[data-testid="more-calls"]:visible').click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/calls", `tile → /calls (${p.url()})`);
  if (!wide) {
    await p.getByTestId("back-more").locator("visible=true").click();
    await p.waitForTimeout(600);
    h.expect(path(h) === "/more", `«‹ Ещё» → /more (${p.url()})`);
    await p.locator('[data-testid="more-calls"]:visible').click();
    await p.waitForTimeout(700);
  }
  // the system back (the swipe on the phone): to «Ещё», not out of the app
  await p.goBack();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/more", `back → /more (${p.url()})`);

  if (!wide) {
    // «＋» above the bar and above the last card on a section outside the tabs
    await h.go("/tasks");
    await p.evaluate(() => document.querySelectorAll("*").forEach((el) => el.scrollHeight > el.clientHeight + 4 && (el.scrollTop = el.scrollHeight)));
    await p.waitForTimeout(500);
    const fab = await box(p.getByTestId("fab").locator("visible=true"));
    const bar = await box(p.getByTestId("tab-bar").locator("visible=true"));
    h.expect(fab.y + fab.height <= bar.y + 1, `«＋» above the bar (${fab.y + fab.height} vs ${bar.y})`);
    const last = await box(p.locator('[data-testid^="task-"]:visible').last());
    h.expect(last.y + last.height <= fab.y + 1, `the last card ends above «＋» (${last.y + last.height} vs ${fab.y})`);
    await h.shot("tasks-fab");
    // the toast «Отменить» on a section outside the tabs: above the bar, not on it (it was hidden before — no bar here)
    await h.go("/tasks");
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Выполнено" }).locator("visible=true").first().click();
    const undo = p.getByRole("button", { name: "Отменить" }).locator("visible=true");
    await undo.waitFor({ timeout: 3000 });
    await p.waitForTimeout(600); // the slide-in
    await h.shot("toast");
    const tb = await box(undo);
    h.expect(tb.y + tb.height <= bar.y + 1, `«Отменить» above the bar (${tb.y + tb.height} vs ${bar.y})`);
    await undo.click();
  }
  // a conversation goes back to «Сообщения» (LOG п.16) — after a reload too (before: no way back)
  // opened by its address (a link, a reload): the demo has no conversations of its own
  await h.go("/messages/c-c1");
  await p.reload();
  await p.waitForTimeout(800);
  const up = p.getByRole("button", { name: /Сообщения/ }).locator("visible=true").first();
  h.expect((await up.count()) === 1, "the conversation has «‹ Сообщения» after a reload");
  await up.click();
  await p.waitForTimeout(600);
  h.expect(path(h) === "/messages", `«‹ Сообщения» → /messages (${p.url()})`);
  // Leads from «Ещё» (office): «‹ Ещё», and the system back returns to «Ещё» (the director's decision 07.11, spec 28 §3)
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await h.go("/more");
  await p.locator('[data-testid="more-leads"]:visible').click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/leads", `tile → /leads (${p.url()})`);
  if (!wide) {
    await p.getByTestId("back-more").locator("visible=true").click();
    await p.waitForTimeout(600);
    h.expect(path(h) === "/more", `Leads: «‹ Ещё» → /more (${p.url()})`);
    await p.locator('[data-testid="more-leads"]:visible').click();
    await p.waitForTimeout(700);
  }
  await p.goBack();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/more", `Leads: back → /more (${p.url()})`);
  // sales: Leads is the home — no «‹ Ещё» there
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("sales")));
  await h.go("/leads");
  await p.waitForTimeout(500);
  h.expect((await p.getByTestId("back-more").locator("visible=true").count()) === 0, "sales: Leads is the home, no «‹ Ещё»");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
