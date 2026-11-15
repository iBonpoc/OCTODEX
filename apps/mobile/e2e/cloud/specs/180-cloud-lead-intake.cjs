/**
 * e2e 180 — «Приём заявок» against a real Supabase (docs/specs/34 §3в, PR 3; S1). The owner of company A:
 * - makes the request form → the link /f/f<32 hex> is on the screen and a row is in intake_endpoints (form, enabled);
 * - switches it off → enabled = false; changes the link → the old token no longer works (another public_token);
 * - makes a Zapier key → it is shown once (gxk_ + 64 hex) and only its hash is kept (public_token null, the hint = its end);
 * - the top line never says «Принимает заявки» while the function does not answer (no secret / no function locally).
 * The edge function itself is not served by the local stack: its answer is put in by the browser (page.route).
 */
const { signIn, waitRows } = require("../signIn.cjs");

// the replaced function answers below are the test's own; nothing else may log an error
exports.allowConsole = [/Failed to load resource/];

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  // the function «has no IP secret»: the screen must say the form takes nothing
  await p.route("**/functions/v1/lead-intake*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ipSecret: false, captchaSecret: false }) }));
  await signIn(h, a1);
  await h.go("/company/intake");
  await p.getByTestId("intake-readiness").locator("visible=true").first().waitFor({ timeout: 15000 });
  await h.expectText(/Не принимает/, "no IP secret: the top line says the form takes nothing");
  await h.expectText(/Напишите в поддержку/, "and says what to do");

  // the form
  await p.getByRole("button", { name: "Создать форму", exact: true }).locator("visible=true").first().click();
  await p.getByTestId("intake-form-card").locator("visible=true").first().waitFor({ timeout: 15000 });
  const m = await h.expectText(/\/f\/(f[0-9a-f]{32})/, "the form's link");
  const token = m[1];
  const [ep] = await waitRows(admin, `intake_endpoints?company_id=eq.${a1.companyId}&kind=eq.form&select=id,enabled,public_token`, (r) => r.length === 1, "the form row");
  h.expect(ep.public_token === token && ep.enabled === true, "the link on the screen is the form's, switched on");
  h.expect(!/Принимает заявки/.test(await h.text()), "never «taking requests» without the secret");

  await p.getByRole("switch", { name: "Принимать заявки" }).first().click();
  await waitRows(admin, `intake_endpoints?id=eq.${ep.id}&select=enabled`, (r) => r[0]?.enabled === false, "switched off");

  await p.getByRole("button", { name: "Сменить ссылку", exact: true }).locator("visible=true").first().click();
  await p.getByTestId("intake-rotate-sheet").getByRole("button", { name: "Сменить ссылку" }).locator("visible=true").last().click();
  await waitRows(admin, `intake_endpoints?id=eq.${ep.id}&select=public_token,rotated_at`, (r) => r[0]?.public_token !== token && !!r[0]?.rotated_at, "a new link");

  // the Zapier key: shown once, kept as a hash
  await p.getByRole("button", { name: "Создать ключ", exact: true }).locator("visible=true").first().click();
  await p.getByTestId("intake-key-sheet").locator("visible=true").first().waitFor({ timeout: 15000 });
  const k = await h.expectText(/(gxk_[0-9a-f]{64})/, "the key once");
  const [hook] = await waitRows(admin, `intake_endpoints?company_id=eq.${a1.companyId}&kind=eq.webhook&select=public_token,token_hint,token_hash`, (r) => r.length === 1, "the key row");
  h.expect(hook.public_token === null && k[1].endsWith(hook.token_hint) && !JSON.stringify(hook).includes(k[1]), "only the key's hash and its end are kept");
  await h.shot("intake");
};
