/**
 * e2e 439 — the main button of a form is never pale (DS §11 п.3, #1728), the director, every view, by testID and words:
 * - «Чем вы занимаетесь?» (/auth/trade): «Продолжить» with nothing chosen is there to press, says «Выберите направление или
 *   впишите своё» and stays on the step;
 * - a new catalog item: «Сохранить» without a name is there to press, the warning «Укажите название и цену» at the button, saves nothing;
 * - «Команда» → «Пригласить»: «Отправить приглашение» with a broken email says «Укажите имя и email», invites no one;
 *   a person's sheet: «Сохранить» with nothing changed is there to press and just closes the sheet.
 * «There to press» = not disabled and not dimmed (opacity 1) — a pale main button read ≈2:1 in the light theme.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (loc) => loc.locator("visible=true").first();
  const live = async (btn, what) => {
    h.expect(!(await btn.isDisabled()), `${what}: not disabled`);
    const op = await btn.evaluate((e) => { let o = 1; for (let a = e; a; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity || "1"); return o; });
    h.expect(op > 0.99, `${what}: not dimmed (opacity ${op})`);
  };

  // the trade step
  await h.go("/auth/trade");
  await vis(p.getByTestId("trade-step")).waitFor({ timeout: 8000 });
  const next = vis(p.getByRole("button", { name: "Продолжить", exact: true }));
  await live(next, "«Продолжить»");
  await next.click();
  await vis(p.getByText("Выберите направление или впишите своё", { exact: true })).waitFor({ timeout: 4000 });
  h.expect(/\/auth\/trade/.test(p.url()), "stays on the step");
  await h.shot("trade");

  // a new catalog item
  await h.go("/catalog/new-item-439");
  await vis(p.getByTestId("catalog-save")).waitFor({ timeout: 8000 });
  const n0 = (await h.db()).catalog.length;
  const save = vis(p.getByTestId("catalog-save").getByRole("button"));
  await live(save, "«Сохранить» of the catalog");
  await save.click();
  // the warning stands at the button (an icon and the words), not a toast far below it
  await vis(p.getByTestId("catalog-need")).waitFor({ timeout: 4000 });
  h.expect(/Укажите название и цену/.test(await vis(p.getByTestId("catalog-need")).innerText()), "the warning says what is missing");
  h.expect((await p.getByTestId("catalog-need-icon").locator("visible=true").count()) === 1, "with its icon (a tone is an icon and a word)");
  h.expect((await h.db()).catalog.length === n0, "nothing saved");
  await h.shot("catalog");

  // the team: an invite with a broken email; a person's sheet with nothing changed
  await h.go("/team");
  await vis(p.getByRole("button", { name: "Пригласить", exact: true })).click();
  const form = p.locator('[aria-modal="true"]').filter({ hasText: "Отправить приглашение" }).last();
  await vis(form.getByPlaceholder("Имя")).fill("Nina Invite");
  await vis(form.getByPlaceholder("Email")).fill("nina@");
  const send = vis(form.getByRole("button", { name: "Отправить приглашение" }));
  await live(send, "«Отправить приглашение»");
  const m0 = (await h.db()).members.length;
  await send.click();
  await vis(form.getByText("Укажите имя и email", { exact: true })).waitFor({ timeout: 4000 });
  h.expect((await h.db()).members.length === m0, "no one invited");
  await h.shot("invite");
  await pressEscUntilClosed(p, form);

  // a person's sheet with nothing changed: «Сохранить» is there to press and just closes it
  const me = (await h.db()).me;
  await vis(p.locator('[data-testid="list-card"]').filter({ hasText: (await h.db()).members.find((m) => m.id === me).name })).click();
  const sheet = vis(p.getByTestId("member-sheet"));
  await sheet.waitFor({ timeout: 5000 });
  const keep = vis(sheet.getByRole("button", { name: "Сохранить", exact: true }));
  await live(keep, "«Сохранить» of a person");
  await keep.click();
  await p.getByTestId("member-sheet").locator("visible=true").first().waitFor({ state: "hidden", timeout: 5000 });
};
