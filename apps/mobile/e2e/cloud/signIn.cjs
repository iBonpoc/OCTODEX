/**
 * Sign a seeded person in through the app's own sign-in screen (password), wait until the company is loaded from the
 * server (cloud mode: «Всё отправлено в базу» in «Мои настройки»). For the cloud specs (docs/specs/21 §4); 102 checks
 * the sign-in itself in more detail.
 */
async function signIn(h, user) {
  const p = h.page;
  await h.go("/auth/sign-in");
  await h.click("Войти с паролем");
  await p.getByPlaceholder("Email").last().fill(user.email);
  await p.getByTestId("legal-agree").last().click();
  await p.getByPlaceholder("Пароль").last().fill(user.password);
  await h.click("Войти");
  for (let i = 0; i < 40 && /\/auth\//.test(new URL(p.url()).pathname); i++) await p.waitForTimeout(250);
  // the account (company, email, sync) is in «Профиль и аккаунт» (spec 26)
  await h.go("/settings/profile");
  await h.expectText(new RegExp(user.company), `signed in to ${user.company}`);
}

/** poll a service-role REST query until `ok(rows)` (the app sends its queue in the background) */
async function waitRows(admin, query, ok, what, timeout = 20000) {
  const t0 = Date.now();
  let rows = [];
  while (Date.now() - t0 < timeout) {
    rows = await admin(query);
    if (ok(rows)) return rows;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`the server never had ${what} (${query}): ${JSON.stringify(rows).slice(0, 400)}`);
}

module.exports = { signIn, waitRows };
