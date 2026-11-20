/**
 * e2e 102 — sign-in against a real Supabase (docs/specs/21 §4; story map S0: the company is the server's).
 * The two ways in of auth/sign-in.tsx, each with the consent tick (7а-1):
 * - a1 with the password → the app leaves the sign-in, loads company A from the server: its name in «Мои настройки»,
 *   no demo note, no «Сбросить тестовые данные»;
 * - b1 with the code from the email (GoTrue sends it; Mailpit catches it) → company B, and nothing of company A.
 * A wrong password stays on the sign-in screen with the server's refusal.
 * #1756: a NEW email (no account yet) — GoTrue sends «confirmation», not Magic Link; it must carry the code too: the code
 * signs up, confirms the address and goes on to «Создать компанию». No link anywhere in the email.
 */
async function signInScreen(h) {
  await h.go("/auth/sign-in");
  await h.expectText(/Вход в GoRix/, "the sign-in screen");
}
async function agreeAndEmail(h, email) {
  const p = h.page;
  await p.getByTestId("auth-email").locator("input").last().fill(email);
  await p.getByTestId("legal-agree").last().click();
}
async function expectCompany(h, name, notName) {
  const p = h.page;
  // the sign-in leaves for the company: the app goes on to «/» once the memberships are in
  for (let i = 0; i < 40 && /\/auth\//.test(new URL(p.url()).pathname); i++) await p.waitForTimeout(250);
  h.expect(!/\/auth\//.test(new URL(p.url()).pathname), `signed in, left the auth screens (${p.url()})`);
  // the account (company, email, sync) is in «Профиль и аккаунт» (spec 26)
  await h.go("/settings/profile");
  await h.expectText(new RegExp(name), `company ${name} from the server`);
  const t = await h.text();
  await h.go("/settings");
  h.expect(!/Сбросить тестовые данные/.test(await h.text()), "cloud mode: no demo reset in «Настройки приложения»");
  h.expect((await p.getByTestId("demo-badge").count()) === 0, "cloud mode: no «Демо» strip");
  if (notName) h.expect(!t.includes(notName), `nothing of ${notName}`);
}

// the code's length = otp_length in supabase/config.toml = CODE_LENGTH (src/features/signIn.ts; 6 since the founder's 18.11)
const LEN = Number(/\notp_length = (\d+)/.exec(require("node:fs").readFileSync(require("node:path").join(__dirname, "../../../../../supabase/config.toml"), "utf8"))[1]);
exports.run = async (h, { seed, mailpit }) => {
  const p = h.page;
  const { a1, b1 } = seed.users;

  // a wrong password: the server refuses, the screen stays
  await signInScreen(h);
  await h.click("Войти с паролем");
  await agreeAndEmail(h, a1.email);
  await p.getByTestId("auth-password").locator("input").last().fill("wrong-password-1");
  await h.click("Войти");
  await h.expectText(/Invalid login credentials|неверн/i, "the server's refusal");
  h.expect(/\/auth\/sign-in/.test(p.url()), "a wrong password stays on the sign-in");

  // a1 with the password
  await p.getByTestId("auth-password").locator("input").last().fill(a1.password);
  await h.click("Войти");
  await expectCompany(h, a1.company, b1.company);
  await h.shot("a1-settings");

  // b1 with the code from the email, in a fresh browser (no session of a1)
  const ctx = await p.context().browser().newContext({ viewport: { width: 390, height: 844 }, locale: "en-US", reducedMotion: "reduce" });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("octo.lang.v1")) localStorage.setItem("octo.lang.v1", JSON.stringify("ru"));
  });
  const p2 = await ctx.newPage();
  const errors = [];
  p2.on("pageerror", (e) => errors.push(e.message));
  const h2 = { ...h, page: p2, go: async (u) => { await p2.goto(new URL(p.url()).origin + u); await p2.waitForTimeout(1000); }, text: async () => (await p2.locator("body").innerText()).split("\n").join(" | ") };
  h2.expectText = async (re, msg) => {
    let t = await h2.text();
    for (let i = 0; i < 25 && !re.test(t); i++) { await p2.waitForTimeout(200); t = await h2.text(); }
    if (!re.test(t)) throw new Error(`expected ${re} (${msg || ""})\n${t.slice(0, 400)}`);
  };
  h2.click = async (name) => { await p2.getByRole("button", { name, exact: true }).last().click(); await p2.waitForTimeout(350); };
  await signInScreen(h2);
  await agreeAndEmail(h2, b1.email);
  const asked = Date.now() - 1000;
  await h2.click("Получить код");
  await h2.expectText(/Код отправлен/, "the code is sent");
  const mail = await mailpit(b1.email, { after: asked });
  const code = new RegExp(`\\b(\\d{${LEN}})\\b`).exec(mail)?.[1];
  h.expect(!!code, `a ${LEN}-digit code in the email:\n${mail.slice(0, 300)}`);
  // the last digit signs in by itself (spec 52 §6)
  await p2.getByTestId("auth-code").locator("input").last().fill(code);
  await expectCompany(h2, b1.company, a1.company);
  h.expect(!errors.length, `no page errors for b1: ${errors.join("; ")}`);

  // #1756: a new email — the first code is the sign-up (in the same fresh browser, b1 signed out)
  await p2.evaluate(() => localStorage.clear());
  await ctx.clearCookies();
  const fresh = `new.${Date.now()}@example.com`;
  await signInScreen(h2);
  await agreeAndEmail(h2, fresh);
  const askedNew = Date.now() - 1000;
  await h2.click("Получить код");
  await h2.expectText(/Код отправлен/, "the code to a new email is sent");
  const mailNew = await mailpit(fresh, { after: askedNew });
  const codeNew = new RegExp(`\\b(\\d{${LEN}})\\b`).exec(mailNew)?.[1];
  h.expect(!!codeNew, `a new email gets a ${LEN}-digit code too:\n${mailNew.slice(0, 300)}`);
  h.expect(!/https?:\/\//.test(mailNew), `no link in the sign-up email:\n${mailNew.slice(0, 300)}`);
  await p2.getByTestId("auth-code").locator("input").last().fill(codeNew);
  await p2.waitForURL(/\/auth\/company/, { timeout: 10000 });
  h.expect(/\/auth\/company/.test(new URL(p2.url()).pathname), `a new account goes on to «Создать компанию» (${p2.url()})`);
  await ctx.close();
};
// the wrong password is a 400 from GoTrue the browser logs as a failed request
exports.allowConsole = [/status of 400/];
