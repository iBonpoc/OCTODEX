/**
 * «Профиль и аккаунт» → «Роль» (#2829): every role reads whole — «Диспет…», «Директ…», «Прода…» were cut on 390 (four equal
 * segments in the card); every view. The roles are rows of a choice now; a tap still moves to the role's home.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/settings/profile");
  for (const name of ["Мастер", "Диспетчер", "Директор", "Продажи"]) {
    const el = p.getByText(name, { exact: true }).locator("visible=true").first();
    await el.waitFor({ timeout: 5000 });
    const cut = await el.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    h.expect(cut.sw <= cut.cw + 1, `«${name}» is not cut (${cut.sw} ≤ ${cut.cw})`);
  }
  h.expect((await p.getByRole("radio", { name: "Директор", exact: true }).locator("visible=true").count()) === 1, "the roles are a choice of one (radio)");
  await p.getByRole("radio", { name: "Мастер", exact: true }).locator("visible=true").first().click();
  await p.waitForURL(/\/visits$/, { timeout: 5000 });
  await h.shot("tech-home");
};
