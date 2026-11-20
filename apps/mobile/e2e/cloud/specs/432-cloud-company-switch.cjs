/**
 * e2e 432 (cloud) — the company switcher (spec 42 S34, §14, #1673).
 * Founder 16.11: «переключатель нужно сразу делать вместе с приглашениями и второй компанией, чтобы не получилось, что
 * приложение осталось в первой, а попасть во вторую нельзя».
 * A person is office in company A and tech in company B (straight in the database, as e2e 410). A new phone opens the
 * first joined (A); «Главная» shows A's name ▾; the sheet «Компании» lists both; two taps → Главная of B, «Вы в «B»»;
 * the server keeps B as the last company; a reload keeps B; without the network back to A (its copy here, not the demo);
 * a new phone (nothing on the device) opens the server's last company.
 * The data is this run's own (CHECKS §9 п.6).
 */
const { execFileSync } = require("node:child_process");
const { signIn, waitRows } = require("../signIn.cjs");

// the offline step: the browser's own «no network» lines (as e2e 104)
exports.allowConsole = [/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/];

const TAG = "432";

exports.run = async (h, { seed }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const b1 = seed.users.b1;
  const A = a1.companyId;
  const B = b1.companyId;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!process.env.DB_URL) throw new Error("432: set DB_URL (supabase status -o env)");
  const call = async (method, path, body) => {
    const r = await fetch(`${seed.url}${path}`, {
      method,
      headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", prefer: "return=representation" },
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
  const run = Date.now().toString(36);

  const email = `two432-${run}@example.test`;
  const pat = await call("POST", "/auth/v1/admin/users", { email, password: a1.password, email_confirm: true, user_metadata: { full_name: "Nightly Two 432" } });
  // joined A first (the first by date opens on a new phone), then B
  sql(`insert into public.memberships (company_id, user_id, role, status, created_at) values ('${A}', '${pat.id}', 'office', 'active', now() - interval '2 days');
       insert into public.memberships (company_id, user_id, role, status, created_at) values ('${B}', '${pat.id}', 'tech', 'active', now() - interval '1 day');`);
  const lastOnServer = () => value(`select coalesce(last_active_company_id::text, '') from public.users where id = '${pat.id}'`);

  await signIn(h, { ...a1, email, userId: pat.id });
  await h.go("/");
  const line = p.getByTestId("company-switch").locator("visible=true").first();
  await line.waitFor({ timeout: 15000 });
  h.expect((await line.innerText()).includes(a1.company), `a new phone opens the first joined company (A): «${await line.innerText()}»`);
  await h.shot("home-two-companies");

  // two taps: the name ▾, then B
  await line.click();
  const sheet = p.getByTestId("company-sheet").locator("visible=true").first();
  await sheet.waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId(`company-row-${A}`).count()) > 0 && (await p.getByTestId(`company-row-${B}`).count()) > 0, "both companies in the sheet");
  await h.shot("company-sheet");
  await p.getByTestId(`company-row-${B}`).locator("visible=true").first().click();
  // the toast first (it leaves after a few seconds), then Главная of B (the tech's Главная is «Мои выезды»)
  await textHas(`Вы в «${b1.company}»`, "the toast «Вы в «B»»", 10000);
  await lineHas(b1.company, "Главная of B");
  h.expect(!/\/settings|\/auth/.test(new URL(p.url()).pathname), `Главная after the switch (${new URL(p.url()).pathname})`);
  await h.shot("switched-to-b");
  await waitRows(admin, `users?select=last_active_company_id&id=eq.${pat.id}`, (r) => r[0]?.last_active_company_id === B, "B as the last company");

  // a reload keeps B (the phone remembers it)
  await p.reload();
  await lineHas(b1.company, "B after a reload");

  // no network: back to A (loaded on this phone before) — A opens from its own copy, never the demo (rule 6)
  await p.context().setOffline(true);
  await p.getByTestId("company-switch").locator("visible=true").first().click();
  await p.getByTestId(`company-row-${A}`).locator("visible=true").first().click();
  await lineHas(a1.company, "A without the network");
  h.expect(!(await h.text()).includes("Демо"), "not the demo without the network");
  await h.shot("offline-back-to-a");
  await p.context().setOffline(false);

  // a new phone: nothing on the device — the company comes from the server (B: the switch back to A was offline and
  // its mark left with the device's storage)
  // cleared from a page where the app does not run (the favicon, as h.seed): the running app would still talk with the
  // session just removed
  await p.goto(new URL("/favicon.ico", p.url()).href);
  await p.evaluate(() => localStorage.clear());
  const last = lastOnServer();
  const want = last === A ? a1.company : b1.company;
  await signIn(h, { ...b1, company: want, email, userId: pat.id });
  await h.go("/");
  await lineHas(want, `the server's last company (${want}) on a new phone`);
};
