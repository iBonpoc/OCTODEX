/**
 * The role changed in «Мои настройки» (TestFlight 288, founder 07.11): after it every tab but «＋» stopped answering —
 * also after switching back, until the app was restarted. The role change pushed a second copy of the tabs over
 * /settings ([(tabs), settings, (tabs)]) and a tab pressed there did dismissTo — a no-op on the tabs themselves.
 * Now: tech and back to director, from «Ещё» → «Мои настройки» and from a typed /settings — every tab opens its screen.
 * 820/1280: no bottom bar; the role change and the side menu still lead on.
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  const path = () => new URL(p.url()).pathname;
  const role = async (name) => {
    await p.getByText(name, { exact: true }).locator("visible=true").first().click();
    await p.waitForTimeout(800);
  };
  // every tab, in an order that leaves each screen for another; «Главная» is the role's home
  const walk = async (home, label) => {
    for (const [name, want] of [["План", "/plan"], ["Сообщения", "/messages"], ["Клиенты", "/clients"], ["Главная", home], ["Ещё", "/more"], ["План", "/plan"]]) {
      await p.getByRole("tab", { name, exact: true }).click();
      await p.waitForTimeout(600);
      h.expect(path() === want, `${label}: «${name}» → ${want} (${path()})`);
      h.expect((await p.locator('[aria-modal="true"]').count()) === 0, `${label}: «${name}» asks nothing`);
    }
  };
  const openSettings = async () => {
    if (wide) await p.getByText("Мои настройки", { exact: true }).locator("visible=true").first().click();
    else {
      await p.getByRole("tab", { name: "Ещё", exact: true }).click();
      await p.waitForTimeout(600);
      await p.getByText("Мои настройки", { exact: true }).locator("visible=true").first().click();
    }
    await p.waitForTimeout(700);
    h.expect(path() === "/settings", `«Мои настройки» (${path()})`);
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
    await walk("/visits", "tech");
  }
  // back to the director: the tabs still answer (before: dead until a restart)
  await openSettings();
  await role("Директор");
  h.expect(path() === "/today", `the director's home after the role change back (${path()})`);
  if (!wide) await walk("/today", "director");
  // a typed /settings (no tabs under it), then the role change
  await h.go("/settings");
  await role("Мастер");
  h.expect(path() === "/visits", `typed /settings → the technician's home (${path()})`);
  if (!wide) await walk("/visits", "tech from a typed /settings");
};
