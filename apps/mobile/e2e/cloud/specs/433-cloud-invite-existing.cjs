/**
 * e2e 433 (cloud) — a person already in company A accepts an invitation to company B (spec 42 S28(в), §14, #1673).
 * The bug it guards (#1673): after the invitation the app stayed in A and there was no way into B. Now B opens at once,
 * the toast «Вас добавили в «B»» has «Отменить» back to A; the server keeps B as the last company (accept_invitation).
 * The owner of B invites through the API (the person's own password sign-in for b1); the data is this run's own.
 */
const { execFileSync } = require("node:child_process");
const { signIn, waitRows } = require("../signIn.cjs");

const TAG = "433";

exports.run = async (h, { seed }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const b1 = seed.users.b1;
  const A = a1.companyId;
  const B = b1.companyId;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!process.env.DB_URL) throw new Error("433: set DB_URL (supabase status -o env)");
  const call = async (method, path, body, token = KEY) => {
    const r = await fetch(`${seed.url}${path}`, {
      method,
      headers: { apikey: token === KEY ? KEY : seed.anonKey, authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "return=representation" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const sql = (q) => execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", q], { stdio: ["ignore", "ignore", "inherit"] });
  const value = (q) => execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-At", "-c", q], { encoding: "utf8" }).trim();
  // waits for what is checked (CHECKS §9 №3): the page — Playwright's own waiting; the server — waitRows (signIn.cjs)
  const lineHas = (name, what, timeout = 20000) =>
    p
      .waitForFunction(([n]) => [...document.querySelectorAll('[data-testid="company-switch"]')].some((e) => e.offsetParent && e.innerText.includes(n)), [name], { timeout })
      .catch(() => {
        throw new Error(`${TAG}: never ${what}`);
      });
  const textHas = (text, what, timeout = 20000) =>
    p
      .getByText(text)
      .first()
      .waitFor({ timeout })
      .catch(() => {
        throw new Error(`${TAG}: never ${what}`);
      });
  const admin = (q) => call("GET", `/rest/v1/${q}`);
  const lineText = () => p.getByTestId("company-switch").locator("visible=true").first().innerText().catch(() => "");
  const run = Date.now().toString(36);

  const email = `join433-${run}@example.test`;
  const pat = await call("POST", "/auth/v1/admin/users", { email, password: a1.password, email_confirm: true, user_metadata: { full_name: "Nightly Join 433" } });
  sql(`insert into public.memberships (company_id, user_id, role, status) values ('${A}', '${pat.id}', 'office', 'active');`);

  // the owner of B invites the person (her own session, as the app would)
  const owner = await call("POST", "/auth/v1/token?grant_type=password", { email: b1.email, password: b1.password }, seed.anonKey);
  const inv = await call("POST", "/rest/v1/rpc/invite_member", { p_company_id: B, p_email: email, p_role: "tech", p_name: "Nightly Join 433" }, owner.access_token);
  const token = inv.token;
  h.expect(typeof token === "string" && token.length > 20, "an invitation link");

  await signIn(h, { ...a1, email, userId: pat.id });
  // one company: the switcher is not there, but «Профиль и аккаунт» leads to a second company (founder's check 18.11)
  await h.go("/settings/profile");
  const another = p.getByTestId("account-create-company").locator("visible=true").first();
  await another.waitFor({ timeout: 15000 });
  await another.click();
  await p.waitForURL(/\/auth\/company\?new=1/, { timeout: 10000 });
  await p.getByTestId("company-fields").locator("visible=true").first().waitFor({ timeout: 10000 });
  h.expect(/\/auth\/company/.test(new URL(p.url()).pathname), `the company form stays open with a company (${p.url()})`);
  await h.shot("create-another");
  await h.go("/");
  await h.go(`/auth/invite?token=${token}`);
  await textHas(`Вас добавили в «${b1.company}»`, "the toast «Вас добавили в «B»»", 15000);
  await h.shot("joined-b");
  h.expect((await lineText()).includes(b1.company), `B is open with the toast (${await lineText()})`);
  // accept_invitation wrote B on the server already
  h.expect(value(`select coalesce(last_active_company_id::text, '') from public.users where id = '${pat.id}'`) === B, "B as the last company on the server");

  // «Отменить» in the toast (while it is on): back to A — on the phone and on the server
  await p.getByTestId("toast-undo").locator("visible=true").first().click();
  await lineHas(a1.company, "back in A after «Отменить»");
  await waitRows(admin, `users?select=last_active_company_id&id=eq.${pat.id}`, (r) => r[0]?.last_active_company_id === A, "A as the last company again");
  await h.shot("back-in-a");

  // DS §11 п.3 on the invitation page: the consent step (the person has not accepted the current texts) — «Принять» is
  // always on; pressed without the tick it says what to do (warn) and sends nothing; with the tick — joined
  const email2 = `tick433-${run}@example.test`;
  const pat2 = await call("POST", "/auth/v1/admin/users", { email: email2, password: a1.password, email_confirm: true, user_metadata: { full_name: "Nightly Tick 433" } });
  sql(`insert into public.memberships (company_id, user_id, role, status) values ('${A}', '${pat2.id}', 'office', 'active');`);
  const inv2 = await call("POST", "/rest/v1/rpc/invite_member", { p_company_id: B, p_email: email2, p_role: "tech", p_name: "Nightly Tick 433" }, owner.access_token);
  await p.goto(new URL("/favicon.ico", p.url()).href);
  await p.evaluate(() => localStorage.clear());
  await signIn(h, { ...a1, email: email2, userId: pat2.id });
  // the consent is gone (as after new texts): a fixture, the way the account erasure removes it
  sql(`set app.erasing_user = 'on'; delete from public.legal_acceptance where user_id = '${pat2.id}';`);
  await h.go(`/auth/invite?token=${inv2.token}`);
  const accept = p.getByTestId("invite-accept-legal").locator("visible=true").first();
  await accept.waitFor({ timeout: 20000 });
  h.expect(await accept.isEnabled(), "«Принять» is on without the tick");
  await accept.click();
  await p.getByTestId("invite-need-tick").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("invite-need-tick").first().innerText()).includes("Сначала примите"), "the hint says what to do");
  h.expect(value(`select count(*) from public.memberships where user_id = '${pat2.id}' and company_id = '${B}'`) === "0", "nothing sent without the tick");
  await h.shot("invite-need-tick");
  await p.getByTestId("invite-agree").locator("visible=true").first().click();
  await accept.click();
  await textHas(`Вас добавили в «${b1.company}»`, "joined after the tick", 20000);
};
