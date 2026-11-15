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
  // by what the screen shows, not by the device copy: that one is written a moment later (a slow CI machine made it flaky)
  const fieldIs = (want, timeout = 8000) => p.waitForFunction(([id, v]) => {
    const el = [...document.querySelectorAll(`[data-testid="${id}"] input, [data-testid="${id}"] textarea`)].pop();
    return !!el && el.value === v;
  }, ["profile-name", want], { timeout });
  await vis("profile-name-save").first().waitFor({ state: "detached", timeout: 8000 });
  await fieldIs("Dana Whitfield");
  h.expect((await vis("profile-name-save").count()) === 0, "saved: no «Сохранить»");

  // «Отменить» on the toast ignores taps for the first moment (toastArmMs, e2e 121): tap until it takes the name back
  const undo = p.getByRole("button", { name: "Отменить", exact: true }).last();
  let back = false;
  for (let i = 0; i < 12 && !back; i++) {
    if ((await undo.count()) > 0) await undo.click({ timeout: 1000 }).catch(() => {});
    back = await fieldIs(me0.name, 400).then(() => true, () => false);
  }
  h.expect(back, "«Отменить» brings the old name back");
};
