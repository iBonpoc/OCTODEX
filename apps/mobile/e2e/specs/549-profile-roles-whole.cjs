/**
 * «Профиль и аккаунт» → «Роль» (#2829): every role reads whole — «Диспет…», «Директ…», «Прода…» were cut on 390 (four equal
 * segments in the card); every view. The role is a field with a menu now (DS А2, as «Тема»): the field shows the role, the menu
 * lists all four whole; a pick still moves to that role's home.
 */
exports.run = async (h) => {
  const p = h.page;
  const whole = async (el, name) => {
    const cut = await el.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    h.expect(cut.sw <= cut.cw + 1, `«${name}» is not cut (${cut.sw} ≤ ${cut.cw})`);
  };
  await h.go("/settings/profile");
  const field = p.getByTestId("profile-role-button").locator("visible=true").first();
  await field.waitFor({ timeout: 5000 });
  await whole(field.getByText("Директор", { exact: true }), "Директор");
  await field.click();
  for (const [name, key] of [["Мастер", "tech"], ["Диспетчер", "dispatcher"], ["Директор", "director"], ["Продажи", "sales"]]) {
    const item = p.getByTestId(`profile-role-${key}`).locator("visible=true").last();
    await item.waitFor({ timeout: 3000 });
    await whole(item.getByText(name, { exact: true }), name);
  }
  await h.shot("menu");
  await p.getByTestId("profile-role-tech").locator("visible=true").last().click();
  await p.waitForURL(/\/visits$/, { timeout: 5000 });
};
