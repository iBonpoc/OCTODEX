/**
 * e2e 196 — a tech signs the client on site, against a real Supabase (docs/specs/35-stripe.md §4д п.10; story map S8 «Подпись клиента», on site).
 * The bug it guards: the app's «estimate.approve» sent the estimate first (send_estimate — the office only), the tech was
 * refused 42501, the queue dropped the op: the client's signature never reached the server. Now the signature goes by the
 * estimate's id (accept_on_site), no token.
 * Set up through the auth API and the local database (DB_URL): a tech of company A with the right to sign contracts, an estimate he made, sent by
 * the owner. Then the tech's app sends the queued signature the way the phone does (the outbox → ops.ts → PostgREST), and
 * the SERVER is checked: the estimate awaits the company's signature, the approval is «on site», on the tech's device.
 * The data is this run's own (rule 19, CHECKS §9 п.6).
 */
const { execFileSync } = require("node:child_process");
const { signIn, waitRows } = require("../signIn.cjs");

const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

// the tech's send is refused (403 / 42501) on purpose — the op goes on to accept_on_site; the browser logs that refusal
exports.allowConsole = [/status of 403/, /Failed to load resource/];

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const A = a1.companyId;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  const call = async (method, path, body, token = KEY, prefer = "return=representation") => {
    const r = await fetch(`${seed.url}${path}`, {
      method,
      headers: { apikey: token === KEY ? KEY : seed.anonKey, authorization: `Bearer ${token}`, "content-type": "application/json", prefer },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const run = Date.now().toString(36);

  // the tech: an account, an active membership with the right to sign contracts (the owner gives it in the app)
  const email = `tech196-${run}@example.test`;
  const password = a1.password;
  const tech = await call("POST", "/auth/v1/admin/users", { email, password, email_confirm: true, user_metadata: { full_name: "Nightly Tech 196" } });
  // the membership and the estimate straight in the database (as cloud.yml's «cat» step: DB_URL of the local stack) — a
  // membership's guards call app.* functions the service role may not run; the app's own path is what is tested below
  const E = uuid(); const V = uuid(); const O = uuid(); const C = uuid(); const P = uuid();
  const sql = `
    insert into public.memberships (company_id, user_id, role, status, can_sign_contracts) values ('${A}', '${tech.id}', 'tech', 'active', true);
    insert into public.customers (id, company_id, display_name) values ('${C}', '${A}', 'Nightly 196 ${run}');
    insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('${P}', '${A}', '${C}', '196 Cloud St', 'Pasadena');
    insert into public.estimates (id, company_id, customer_id, property_id, title, created_by) values ('${E}', '${A}', '${C}', '${P}', 'Nightly 196', '${tech.id}');
    insert into public.estimate_versions (id, company_id, estimate_id, version_no, deposit_rule) values ('${V}', '${A}', '${E}', 1, '{"kind":"none"}');
    update public.estimates set current_version_id = '${V}' where id = '${E}';
    insert into public.estimate_options (id, company_id, version_id, name) values ('${O}', '${A}', '${V}', 'Only');
    insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents)
      values ('${A}', '${O}', 'labor', 'Nightly 196 line (тестовые)', 1, 18500);`;
  if (!process.env.DB_URL) throw new Error("196: set DB_URL (supabase status -o env)");
  execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });
  // the owner sends it (the office does; a tech may not)
  const owner = await call("POST", "/auth/v1/token?grant_type=password", { email: a1.email, password: a1.password }, seed.anonKey);
  await call("POST", "/rest/v1/rpc/send_estimate", { p_estimate_id: E, p_token: null }, owner.access_token);

  // the tech's phone: signed in, the client's signature waits in the queue (made offline on site)
  await signIn(h, { ...a1, email, userId: tech.id });
  const ownerOf = { userId: tech.id, companyId: A };
  const at = new Date(Date.now() - 30_000).toISOString();
  const op = {
    k: "estimate.approve", id: E, token: `tokFromTheTechPhone${run}0123456789`, optionId: O, addonIds: [], signer: "Ann Client 196",
    svg: "M0 0 L10 10", channel: "on_site", jobId: uuid(), invoiceId: uuid(),
  };
  await p.evaluate(([items]) => localStorage.setItem("octo.outbox.v1", JSON.stringify(items)), [[{ id: "q-196", op, at, tries: 0, owner: ownerOf }]]);
  await h.go("/settings/profile");
  await p.evaluate(() => window.dispatchEvent(new Event("online")));

  // the server has the client's signature: awaiting the company, on site, on the tech's device
  const [est] = await waitRows(admin, `estimates?id=eq.${E}&select=status`, (r) => r[0]?.status === "awaiting_countersign", "the signed estimate", 30000);
  h.expect(est.status === "awaiting_countersign", "S8: the client's on-site signature reached the server");
  const [appr] = await waitRows(admin, `estimate_approvals?estimate_id=eq.${E}&select=channel,signer_user_id,signer_name`, (r) => r.length === 1, "the approval");
  h.expect(appr.channel === "on_site" && appr.signer_user_id === tech.id && appr.signer_name === "Ann Client 196", `on site, on the tech's device (${JSON.stringify(appr)})`);
  // the queue is empty and nothing was refused
  const queued = () => p.evaluate(() => JSON.parse(localStorage.getItem("octo.outbox.v1") || "[]").length);
  for (let i = 0; i < 40 && (await queued()) > 0; i++) await p.waitForTimeout(250);
  h.expect((await queued()) === 0, "the queue is empty");
  h.expect((await p.getByTestId("rejected-q-196").count()) === 0, "no «Сервер отказал» card");
  // this run's tech leaves company A (other cloud specs count its people)
  execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c",
    `update public.memberships set status = 'disabled' where user_id = '${tech.id}' and company_id = '${A}'`], { stdio: ["ignore", "ignore", "inherit"] });
};
