/**
 * The back swipe on a tab screen (founder 08.11: «с вкладки Лиды я не могу смахнуть назад»; nav/backSwipe.ts).
 * A tab screen with a header «back» — Messages opened from «Ещё» («‹ Ещё»; v2: «Лиды» is a bottom tab now), another role's
 * home («‹ Главная») — swipes back from the left edge by the same handler as the button. A short drag springs back. A
 * bottom-bar tab (Plan, Leads) and the sales home (Leads) have nothing to go back to: no swipe. 820/1280: the side menu, no
 * swipe anywhere. A drag that starts inside the screen (not its left margin) is not «back».
 * The swipe is dragged with the mouse (the gesture handler reads pointer events on the web).
 */
const path = (h) => new URL(h.page.url()).pathname;
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);
const atPath = (h, want) => h.page.waitForFunction((w) => location.pathname === w, want, { timeout: 4000 }).then(() => true, () => false);
const swipeOn = (h) => h.page.getByTestId("back-swipe").locator("visible=true");

/** drag from `x0` (the left edge) to `x0 + dx` at height `y`, in steps (a finger, not a jump) */
async function drag(h, dx, x0 = 4, y = Math.round(h.page.viewportSize().height / 2)) {
  const p = h.page;
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(x0 + (dx * i) / 12, y);
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
}

/** «Ещё» → «Сообщения» (a tab screen in «Ещё», from=more) */
async function messagesFromMore(h) {
  await h.go("/more");
  await h.page.locator('[data-testid="more-messages"]:visible').click();
  h.expect(await atPath(h, "/messages"), `row → /messages (${h.page.url()})`);
  await h.page.getByRole("heading", { level: 1 }).locator("visible=true").first().waitFor();
}

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  await h.go("/today");
  await role(h, "director");

  await messagesFromMore(h);
  if (wide) {
    // the side menu, no «‹ Ещё»: no swipe, the drag leaves the screen as it is
    h.expect((await swipeOn(h).count()) === 0, "820/1280: no back swipe on Messages");
    await drag(h, h.layout.width / 2);
    h.expect(!(await atPath(h, "/more")) && path(h) === "/messages", `820/1280: the drag stays on Messages (${p.url()})`);
  } else {
    h.expect((await swipeOn(h).count()) === 1, "Messages from «Ещё»: the back swipe is on");
    // a short, slow drag springs back
    await drag(h, 40);
    h.expect(!(await atPath(h, "/more")) && path(h) === "/messages", `a short drag stays on Messages (${p.url()})`);
    await h.shot("messages-from-more");
    // a drag that starts inside the screen (the empty card, not the left margin) is not «back»
    const card = await p.getByRole("heading", { level: 1 }).locator("visible=true").first().boundingBox();
    await drag(h, h.layout.width * 0.6, Math.round(h.layout.width / 2), Math.round(card.y + card.height + 120));
    h.expect(!(await atPath(h, "/more")) && path(h) === "/messages", `a drag inside the screen stays on Messages (${p.url()})`);
    // a long one from the edge goes where «‹ Ещё» goes
    await drag(h, h.layout.width * 0.7);
    h.expect(await atPath(h, "/more"), `the swipe → /more, as «‹ Ещё» (${p.url()})`);
    await p.locator('[data-testid="more-messages"]:visible').first().waitFor();

    // «Лиды» is a bottom tab (v2): nothing to go back to
    await h.go("/leads");
    await p.getByRole("heading", { level: 1 }).locator("visible=true").first().waitFor();
    h.expect((await swipeOn(h).count()) === 0, "Leads (a bottom-bar tab): no back swipe");

    // another role's home under this role's home: «‹ Главная» — the swipe goes there
    await h.go("/triage");
    await p.getByRole("button", { name: /Главная/ }).locator("visible=true").first().waitFor();
    h.expect((await swipeOn(h).count()) === 1, "Triage for the director: the back swipe is on");
    await drag(h, h.layout.width * 0.7);
    h.expect(await atPath(h, "/today"), `the swipe → /today, as «‹ Главная» (${p.url()})`);
  }

  // a bottom-bar tab: nowhere to go back to
  await h.go("/plan");
  await p.getByRole("heading", { level: 1 }).locator("visible=true").first().waitFor();
  h.expect((await swipeOn(h).count()) === 0, "Plan (a bottom-bar tab): no back swipe");
  await drag(h, h.layout.width * 0.7);
  h.expect(!(await atPath(h, "/today")) && path(h) === "/plan", `the drag stays on Plan (${p.url()})`);

  // sales: Leads is the home
  await role(h, "sales");
  await h.go("/leads");
  await p.getByRole("heading", { level: 1 }).locator("visible=true").first().waitFor();
  h.expect((await swipeOn(h).count()) === 0, "sales: Leads is the home, no back swipe");
  await role(h, "director");
};
