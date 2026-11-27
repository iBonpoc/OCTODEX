/**
 * The role changed in «Профиль и аккаунт» (was «Мои настройки») (TestFlight 288, founder 07.11): after it every tab but «＋» stopped answering —
 * also after switching back, until the app was restarted. The role change pushed a second copy of the tabs over
 * /settings ([(tabs), settings, (tabs)]) and a tab pressed there did dismissTo — a no-op on the tabs themselves.
 * Now: tech and back to director, from «Ещё» → the profile and from a typed /settings/profile — every tab opens its screen.
 * The same dead tabs without a role change: a card opened by a link (a push, an address) → a tab → [card, (tabs)]; the
 * first tab worked, every next one did nothing. Since #289 the role change goes down with goTo, so the link case is
 * the one that fails without tabLeave; the screen's «‹ up» (goTo) had the same no-op there.
 * 820/1280: no bottom bar; the role change and the side menu still lead on.
 */
const { clickAvatar } = require("../menu.cjs");

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  const path = () => new URL(p.url()).pathname;
  // the role is a field with a menu in the profile (#2829): open it, pick the role
  const KEY = { Мастер: "tech", Директор: "director", Диспетчер: "dispatcher", Продажи: "sales" };
  const role = async (name) => {
    await p.getByTestId("profile-role-button").locator("visible=true").first().click();
    await p.getByTestId(`profile-role-${KEY[name]}`).locator("visible=true").last().click();
    await p.waitForTimeout(800);
  };
  // every tab, in an order that leaves each screen for another; «Главная» is the role's home. v2: the tabs are
  // Главная · План · Клиенты · Деньги · Лиды (the tech has no «Деньги»); «Ещё» is the avatar of a root's header
  const openMore = async () => {
    h.expect(await clickAvatar(p), `the header's avatar on ${path()}`);
    await p.locator('[data-testid="more-screen"]:visible').waitFor({ timeout: 5000 });
  };
  const walk = async (home, label, money = true) => {
    const steps = [["План", "/plan"], ["Лиды", "/leads"], ["Клиенты", "/clients"], ...(money ? [["Деньги", "/invoice"]] : []), ["Главная", home], ["Ещё", "/more"], ["План", "/plan"]];
    for (const [name, want] of steps) {
      if (name === "Ещё") await openMore();
      else await p.getByRole("tab", { name, exact: true }).click();
      h.expect(await p.waitForFunction((w) => location.pathname === w, want, { timeout: 4000 }).then(() => true, () => false), `${label}: «${name}» → ${want} (${path()})`);
      h.expect((await p.locator('[aria-modal="true"]').count()) === 0, `${label}: «${name}» asks nothing`);
    }
  };
  // «Профиль и аккаунт» (spec 26, #289): the profile card in «Ещё» on a phone, the profile in the side menu at 820/1280
  const openSettings = async () => {
    if (!wide) {
      if (path() !== "/more") {
        await p.getByRole("tab", { name: "Главная", exact: true }).click();
        // the home has come (the screen it left keeps its own avatar on the same spot while it goes)
        await p.locator('[role="tab"][aria-label="Главная"][aria-selected="true"]').waitFor({ timeout: 4000 });
        await p.waitForFunction(() => /^\/(today|visits|triage)$/.test(location.pathname), null, { timeout: 4000 });
        await openMore();
      }
    }
    await p.getByTestId(wide ? "side-profile" : "more-profile").locator("visible=true").first().click();
    await p.waitForTimeout(700);
    h.expect(path() === "/settings/profile", `«Профиль и аккаунт» (${path()})`);
  };

  await h.go("/today");
  await openSettings();
  await role("Мастер");
  h.expect(path() === "/visits", `the technician's home after the role change (${path()})`);
  if (wide) {
    h.expect((await p.getByTestId("tab-bar").locator("visible=true").count()) === 0, "no bottom bar at " + h.layout.width);
    // the side menu still leads on after the role change
    await p.getByText("Клиенты", { exact: true }).locator("visible=true").first().click();
    await p.waitForTimeout(600);
    h.expect(path() === "/clients", `side menu → /clients (${path()})`);
  } else {
    await h.shot("tech");
    await walk("/visits", "tech", false);
  }
  // back to the director: the tabs still answer (before: dead until a restart)
  await openSettings();
  await role("Директор");
  h.expect(path() === "/today", `the director's home after the role change back (${path()})`);
  if (!wide) await walk("/today", "director");
  if (!wide) {
    // the same stack and the screen's own «‹ Ещё» (goTo): a section from «Ещё» → back to «Ещё» (#286; before: dead).
    // v2: «Лиды» is a tab — «Сообщения» is the tab screen that opens from «Ещё» (from=more)
    const db = await h.db();
    await h.go(`/client/${db.customers[0].id}`);
    await p.getByRole("tab", { name: "Главная", exact: true }).click();
    await p.waitForFunction(() => location.pathname === "/today", null, { timeout: 4000 });
    await openMore();
    await p.locator('[data-testid="more-messages"]:visible').click();
    await p.waitForTimeout(700);
    h.expect(path() === "/messages", `a card by a link → «Ещё» → «Сообщения» (${path()})`);
    await p.getByTestId("back-more").locator("visible=true").first().click();
    await p.waitForTimeout(700);
    h.expect(path() === "/more", `«‹ Ещё» on Messages after a card by a link → /more (${path()})`);
  }
  // a typed /settings/profile (no tabs under it), then the role change
  await h.go("/settings/profile");
  await role("Мастер");
  h.expect(path() === "/visits", `typed /settings/profile → the technician's home (${path()})`);
  if (!wide) await walk("/visits", "tech from a typed /settings/profile", false);
  // a card by a link (a push notification, a typed address): the first tab, then every other one still answers
  if (!wide) {
    const db = await h.db();
    await h.go(`/client/${db.customers[0].id}`);
    await walk("/visits", "a card by a link", false);
  }
};
