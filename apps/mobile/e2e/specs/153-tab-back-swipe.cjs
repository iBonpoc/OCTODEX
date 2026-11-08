/**
 * The back swipe on a tab screen (founder 08.11: «с вкладки Лиды я не могу смахнуть назад»; nav/backSwipe.ts).
 * A tab screen with a header «back» — Leads opened from «Ещё» («‹ Ещё»), another role's home («‹ Главная») — swipes
 * back from the left edge by the same handler as the button. A short drag springs back. A bottom-bar tab (Plan) and the
 * sales home (Leads) have nothing to go back to: no swipe. 820/1280: the side menu, no swipe anywhere.
 * A drag on the filter lane is the lane's. A lead card's «‹ Лиды» brings Leads back with «‹ Ещё» and the swipe (nav/go.ts).
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

/** «Ещё» → «Лиды» (the office's tile, from=more) */
async function leadsFromMore(h) {
  await h.go("/more");
  await h.page.locator('[data-testid="more-leads"]:visible').click();
  h.expect(await atPath(h, "/leads"), `tile → /leads (${h.page.url()})`);
  await h.page.getByRole("heading", { level: 1 }).locator("visible=true").first().waitFor();
}

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  await h.go("/today");
  await role(h, "director");

  await leadsFromMore(h);
  if (wide) {
    // the side menu, no «‹ Ещё»: no swipe, the drag leaves the screen as it is
    h.expect((await swipeOn(h).count()) === 0, "820/1280: no back swipe on Leads");
    await drag(h, h.layout.width / 2);
    h.expect(!(await atPath(h, "/more")) && path(h) === "/leads", `820/1280: the drag stays on Leads (${p.url()})`);
  } else {
    h.expect((await swipeOn(h).count()) === 1, "Leads from «Ещё»: the back swipe is on");
    // a short, slow drag springs back
    await drag(h, 40);
    h.expect(!(await atPath(h, "/more")) && path(h) === "/leads", `a short drag stays on Leads (${p.url()})`);
    await h.shot("leads-from-more");
    // a drag that starts on the filter lane (inside the screen, not its left margin) is the lane's, not «back»
    const lane = await p.getByTestId("filter-lane").locator("visible=true").first().boundingBox();
    await drag(h, h.layout.width * 0.6, lane.x + 12, Math.round(lane.y + lane.height / 2));
    h.expect(!(await atPath(h, "/more")) && path(h) === "/leads", `a drag on the filter lane stays on Leads (${p.url()})`);
    // a long one from the edge goes where «‹ Ещё» goes
    await drag(h, h.layout.width * 0.7);
    h.expect(await atPath(h, "/more"), `the swipe → /more, as «‹ Ещё» (${p.url()})`);
    await p.locator('[data-testid="more-leads"]:visible').first().waitFor();

    // a lead card and its «‹ Лиды»: Leads keeps «‹ Ещё» and the swipe (before: dismissTo dropped from=more — no way back)
    await leadsFromMore(h);
    await p.locator('[data-testid="list-card"]:visible').first().click();
    h.expect(await p.waitForFunction(() => location.pathname.startsWith("/lead/"), null, { timeout: 4000 }).then(() => true, () => false), `a lead card (${p.url()})`);
    await p.getByRole("button", { name: /Лиды/ }).locator("visible=true").first().click();
    h.expect(await atPath(h, "/leads"), `«‹ Лиды» → /leads (${p.url()})`);
    await p.getByTestId("back-more").locator("visible=true").waitFor({ timeout: 4000 }).catch(() => {});
    h.expect(new URL(p.url()).searchParams.get("from") === "more", `Leads keeps from=more (${p.url()})`);
    h.expect((await p.getByTestId("back-more").locator("visible=true").count()) === 1, "Leads after the card: «‹ Ещё» is there");
    await drag(h, h.layout.width * 0.7);
    h.expect(await atPath(h, "/more"), `after the card the swipe → /more (${p.url()})`);

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
