/**
 * e2e 442 — sign-in = sign-up by the email code (#1756). Demo build; Supabase Auth's answers are put in by the browser
 * (page.route on /auth/v1/otp and /auth/v1/verify, no network). By testID (CHECKS §9 п.2).
 * - one path: email + tick → «Получить код» → the code step (no «Создать аккаунт», no password sign-up);
 * - «Отправить ещё раз» is off with a countdown right after the code; «Изменить почту» → back to the first step;
 * - a wrong/old code → «Код неверный или устарел…», the screen stays; the server's own wait → «через N с»;
 * - the built-in Supabase mail refusing an address → plain words, never the raw English message.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").last();
  let otp = { status: 200, body: {} };
  let otpCalls = 0;
  await p.route("**/auth/v1/otp*", async (route) => {
    otpCalls++;
    await route.fulfill({ status: otp.status, contentType: "application/json", body: JSON.stringify(otp.body) });
  });
  await p.route("**/auth/v1/verify*", (route) =>
    route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }) }),
  );

  await h.go("/auth/sign-in");
  await tid("legal-agree").waitFor({ timeout: 6000 });
  h.expect(!/Создать аккаунт|Нет аккаунта/.test(await h.text()), "no separate sign-up"); // i18n-old: ok
  await tid("auth-email").locator("input").last().fill("new.person@example.com");
  await tid("legal-agree").click();
  await tid("auth-send-code").click();

  // the code step
  await tid("auth-code").waitFor({ timeout: 6000 });
  h.expect(otpCalls === 1, `one code asked (${otpCalls})`);
  await h.expectText(/Код отправлен на new\.person@example\.com/, "where the code went");
  const resend = tid("auth-resend");
  h.expect(await resend.isDisabled(), "«Отправить ещё раз» waits right after a code");
  h.expect(/через \d+ с/.test(await resend.innerText()), `a countdown on it (${await resend.innerText()})`);
  await h.shot("code-step");

  // a wrong or old code: plain words, still here
  await tid("auth-code").locator("input").last().fill("123456");
  await tid("auth-verify").click();
  await tid("auth-note").waitFor({ timeout: 6000 });
  h.expect(/Код неверный или устарел/.test(await tid("auth-note").innerText()), "a wrong code in the app's words");
  h.expect(/\/auth\/sign-in/.test(p.url()), "stays on the sign-in");
  await h.shot("wrong-code");

  // «Изменить почту» → the first step again, the old code is gone
  await tid("auth-change-email").click();
  await tid("auth-send-code").waitFor({ timeout: 4000 });
  h.expect((await p.getByTestId("auth-code").locator("visible=true").count()) === 0, "no code field after «Изменить почту»");

  // the server's own wait
  otp = { status: 429, body: { code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 37 seconds." } };
  await tid("auth-send-code").click();
  await tid("auth-note").waitFor({ timeout: 6000 });
  h.expect(/через 37 с/.test(await tid("auth-note").innerText()), `the server's wait (${await tid("auth-note").innerText()})`);

  // the built-in mail refuses an address outside the team
  otp = { status: 400, body: { code: 400, error_code: "email_address_not_authorized", msg: 'Email address "new.person@example.com" cannot be used as it is not authorized' } };
  await tid("auth-send-code").click();
  await p.getByTestId("auth-note").filter({ hasText: /письма пока не уходят|not authorized/ }).last().waitFor({ timeout: 6000 });
  const note = await tid("auth-note").innerText();
  h.expect(/письма пока не уходят/.test(note) && !/not authorized/i.test(note), `plain words, not the server's English (${note})`);
  await h.shot("not-allowed");

  // the password is only a way in for an existing account
  await tid("auth-use-password").click();
  await tid("auth-password").waitFor({ timeout: 4000 });
  h.expect(!/Создать аккаунт|Нет аккаунта/.test(await h.text()), "no password sign-up"); // i18n-old: ok
};
// GoTrue's refusals are 4xx the browser logs as failed requests
exports.allowConsole = [/status of 4\d\d/];
