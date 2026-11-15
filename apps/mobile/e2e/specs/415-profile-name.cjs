/**
 * e2e 415 — «Имя» in the profile (#1606): my name is a field on «Профиль и аккаунт», saved at once (offline through the queue),
 * with «Отменить»; the colleagues' lists show it. Every view, by testID.
 * - the field shows my current name; «Сохранить» appears only when the name was changed to something else (and is not empty);
 * - after «Сохранить» the new name is in `members` for me, and the field shows it;
 * - «Отменить» on the toast brings the old name back.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  await h.go("/settings/profile");
  const field = vis("profile-name").first();
  await field.waitFor({ timeout: 8000 });
  const db0 = await h.db();
  const me0 = db0.members.find((m) => m.id === db0.me);
  h.expect(!!me0, "I am a member");
  const input = field.locator("input, textarea").first();
  h.expect((await input.inputValue()) === me0.name, `the field shows my name (${me0.name})`);
  h.expect((await vis("profile-name-save").count()) === 0, "unchanged: no «Сохранить»");

  await input.fill("   ");
  h.expect((await vis("profile-name-save").count()) === 0, "an empty name: no «Сохранить»");
  await input.fill("Dana Whitfield");
  await vis("profile-name-save").first().waitFor({ timeout: 5000 });
  await h.shot("profile-name");
  await vis("profile-name-save").first().click();
  for (let i = 0; i < 40; i++) {
    const d = await h.db();
    if (d.members.find((m) => m.id === d.me)?.name === "Dana Whitfield") break;
    await p.waitForTimeout(150);
  }
  const d1 = await h.db();
  const me1 = d1.members.find((m) => m.id === d1.me);
  h.expect(me1.name === "Dana Whitfield", `my name is saved (${me1.name})`);
  h.expect(me1.initials === "DW", `the initials follow (${me1.initials})`);
  h.expect((await vis("profile-name-save").count()) === 0, "saved: no «Сохранить»");
  h.expect((await input.inputValue()) === "Dana Whitfield", "the field shows the new name");

  // «Отменить» on the toast
  await vis("toast-undo").first().click();
  for (let i = 0; i < 40; i++) {
    const d = await h.db();
    if (d.members.find((m) => m.id === d.me)?.name === me0.name) break;
    await p.waitForTimeout(150);
  }
  const d2 = await h.db();
  h.expect(d2.members.find((m) => m.id === d2.me)?.name === me0.name, "«Отменить» brings the old name back");
};
