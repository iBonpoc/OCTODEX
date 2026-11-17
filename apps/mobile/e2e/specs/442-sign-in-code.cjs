/**
 * e2e 442 — sign-in = sign-up by the email code (docs/specs/52 §6, #1756). Demo build; Supabase Auth's answers are put in
 * by the browser (page.route on /auth/v1/otp and /auth/v1/verify, no network); the page's clock passes the 60 s pause.
 * By testID (CHECKS §9 п.2).
 * - step 1: «Регистрация не нужна…»; the button is always on and says what is missing under its field (no email, no tick);
 *   «Может, gmail.com?» fixes a typo;
 * - step 2: «Код отправлен на <адрес> · Изменить» and the code field only (no email field, no tick); fewer than 8
 *   digits → «Введите 8 цифр»; the 8th digit signs in by itself; a wrong/old code — under the code field;
 * - «Отправить ещё раз» only after the pause (a countdown before), a new code clears the field and says so;
 * - «Не пришло письмо?» — a sheet with what to check; «Изменить» → step 1, the pause stays;
 * - the server's own wait → «через N с»; the built-in mail refusing an address → plain words, never its English;
 * - a wrong code stays with its digits selected (spec 52 §6, С1): the next one is typed over it and checked;
 * - without the network «Получить код» says «Нужна сеть» and sends nothing;
 * - no password sign-up anywhere.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

const LEN = 8; // CODE_LENGTH (src/features/signIn.ts) = otp_length (supabase/config.toml) — test/authEmails.test.ts

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").last();
  const none = async (id) => (await p.getByTestId(id).locator("visible=true").count()) === 0;
  let otp = { status: 200, body: {} };
  let otpCalls = 0;
  let verifyCalls = 0;
  await p.route("**/auth/v1/otp*", async (route) => {
    otpCalls++;
    await route.fulfill({ status: otp.status, contentType: "application/json", body: JSON.stringify(otp.body) });
  });
  await p.route("**/auth/v1/verify*", (route) => {
    verifyCalls++;
    return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }) });
  });

  // the runner's clock (installed for every spec): the 60 s pause is passed by moving it, not by waiting
  await h.go("/auth/sign-in");
  await tid("auth-no-signup").waitFor({ timeout: 6000 });
  h.expect(/Регистрация не нужна/.test(await tid("auth-no-signup").innerText()), "«Регистрация не нужна» on step 1");
  h.expect(!/Создать аккаунт|Нет аккаунта/.test(await h.text()), "no separate sign-up"); // i18n-old: ok

  // the button is on and says what is missing, under its field
  await tid("auth-send-code").click();
  await tid("auth-email").getByText(/Укажите почту/).waitFor({ timeout: 4000 });
  await tid("auth-email").locator("input").last().fill("new.person@gmial.com");
  await tid("auth-typo").waitFor({ timeout: 4000 });
  await tid("auth-typo").click();
  h.expect((await tid("auth-email").locator("input").last().inputValue()) === "new.person@gmail.com", "«Может, gmail.com?» fixes the address");
  await tid("auth-send-code").click();
  await tid("auth-agree-error").waitFor({ timeout: 4000 });
  h.expect(otpCalls === 0, "nothing sent without the tick");
  await h.shot("missing-tick");
  await tid("legal-agree").click();
  await tid("auth-send-code").click();

  // step 2: the address and the code field only
  await tid("auth-code").waitFor({ timeout: 6000 });
  h.expect(otpCalls === 1, `one code asked (${otpCalls})`);
  h.expect(/Код отправлен на\s*new\.person@gmail\.com/.test(await tid("auth-code-sent").innerText()), "where the code went");
  h.expect((await none("auth-email")) && (await none("legal-agree")), "no email field and no tick on the code step");
  h.expect(await none("auth-resend"), "no «Отправить ещё раз» during the pause");
  h.expect(/через \d+ с/.test(await tid("auth-countdown").innerText()), "a countdown instead");
  await h.shot("code-step");

  // fewer digits → under the field; the last digit signs in by itself; a wrong code — under the code field
  const codeIn = tid("auth-code").locator("input").last();
  await codeIn.fill("123");
  await tid("auth-verify").click();
  await tid("auth-code").getByText(new RegExp(`Введите ${LEN} цифр`)).waitFor({ timeout: 4000 });
  h.expect(verifyCalls === 0, "nothing checked with 3 digits");
  await codeIn.fill("12345678".slice(0, LEN));
  await tid("auth-code").getByText(/Код неверный или устарел/).waitFor({ timeout: 6000 });
  h.expect(verifyCalls === 1, `the ${LEN}th digit checked the code by itself (${verifyCalls})`);
  h.expect(/\/auth\/sign-in/.test(p.url()), "stays on the sign-in");
  // spec 52 §6, С1: a wrong code stays, its digits selected — the next one is typed over them
  h.expect((await codeIn.inputValue()) === "12345678".slice(0, LEN), "a wrong code stays in the field");
  await p.waitForFunction(
    ([el, n]) => document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === n,
    [await codeIn.elementHandle(), LEN],
    { timeout: 4000 },
  );
  await h.shot("wrong-code");
  await Promise.all([p.waitForRequest("**/auth/v1/verify*", { timeout: 6000 }), codeIn.pressSequentially("87654321".slice(0, LEN))]);
  await tid("auth-code").getByText(/Код неверный или устарел/).waitFor({ timeout: 6000 });
  h.expect(verifyCalls === 2, `a new code typed over the selected one is checked (${verifyCalls})`);
  h.expect((await codeIn.inputValue()) === "87654321".slice(0, LEN), "the new code replaced the old one");

  // after the pause: «Отправить ещё раз» → a new code, the field cleared, the screen says so
  await p.clock.fastForward(61_000);
  await tid("auth-resend").waitFor({ timeout: 6000 });
  await tid("auth-resend").click();
  await tid("auth-resent").waitFor({ timeout: 6000 });
  h.expect(otpCalls === 2, `a second code asked (${otpCalls})`);
  h.expect((await codeIn.inputValue()) === "", "the old digits are cleared");
  h.expect(await none("auth-resend"), "and the pause starts again");

  // «Не пришло письмо?» — what to check
  await tid("auth-no-mail").click();
  await tid("auth-no-mail-sheet").waitFor({ timeout: 4000 });
  const sheet = await tid("auth-no-mail-sheet").innerText();
  h.expect(/Спам/.test(sheet) && /GoRix/.test(sheet) && /new\.person@gmail\.com/.test(sheet), `the sheet says where to look (${sheet.slice(0, 120)})`);
  h.expect(await none("auth-no-mail-support"), "no support button before two resends (and none while the address is a placeholder)");
  await h.shot("no-mail");
  await pressEscUntilClosed(p);

  // «Изменить» → step 1; the pause stays: a tap sends nothing until it is over
  await tid("auth-change-email").click();
  await tid("auth-send-code").waitFor({ timeout: 4000 });
  h.expect(await none("auth-code"), "no code field after «Изменить»");
  await tid("auth-countdown").waitFor({ timeout: 4000 });
  await tid("auth-send-code").click();
  h.expect(otpCalls === 2, "the pause holds after «Изменить»");

  // the server's own wait
  await p.clock.fastForward(61_000);
  await p.getByTestId("auth-countdown").locator("visible=true").first().waitFor({ state: "detached", timeout: 6000 });
  otp = { status: 429, body: { code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 37 seconds." } };
  await tid("auth-send-code").click();
  await tid("auth-note").getByText(/через 37 с/).waitFor({ timeout: 6000 });
  await tid("auth-countdown").waitFor({ timeout: 4000 });

  // the built-in mail refuses an address outside the team
  await p.clock.fastForward(38_000);
  await p.getByTestId("auth-countdown").locator("visible=true").first().waitFor({ state: "detached", timeout: 6000 });
  otp = { status: 400, body: { code: 400, error_code: "email_address_not_authorized", msg: 'Email address "new.person@gmail.com" cannot be used as it is not authorized' } };
  await tid("auth-send-code").click();
  // the address is what to change: under the email field; no support address yet → «попробуйте другой адрес»
  await tid("auth-email").getByText(/письма пока не уходят — попробуйте другой адрес/).waitFor({ timeout: 6000 });
  h.expect(!/not authorized/i.test(await tid("auth-email").innerText()), "plain words, not the server's English");
  await h.shot("not-allowed");

  // the password is only a small way in for an existing account
  await tid("auth-use-password").click();
  await tid("auth-password").waitFor({ timeout: 4000 });
  h.expect(!/Создать аккаунт|Нет аккаунта/.test(await h.text()), "no password sign-up"); // i18n-old: ok

  // without the network: «Нужна сеть», nothing sent. «Проверка: режим без сети» lives in memory — switch it, then go
  // to the sign-in inside the app (a page load would turn the network back on)
  await h.go("/settings");
  const offline = p.getByRole("switch", { name: /режим без сети/i }).locator("visible=true").last();
  await offline.click();
  await p.locator('[role="switch"][aria-checked="true"]').filter({ hasText: /режим без сети/i }).or(p.getByRole("switch", { name: /режим без сети/i, checked: true })).first().waitFor({ timeout: 4000 });
  await p.evaluate(() => { window.history.pushState({}, "", "/auth/sign-in"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await tid("auth-email").waitFor({ timeout: 6000 });
  await tid("auth-email").locator("input").last().fill("new.person@example.com");
  await tid("legal-agree").click();
  const before = otpCalls;
  await tid("auth-send-code").click();
  await tid("auth-note").getByText(/Нужна сеть/).waitFor({ timeout: 4000 });
  h.expect(otpCalls === before, "nothing sent without the network");
};
// GoTrue's refusals put in above are 4xx the browser logs as failed requests
exports.allowConsole = [/status of (400|403|429) /];
