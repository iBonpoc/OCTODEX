/**
 * e2e 267 (cloud) — the client signs on site a total the server no longer has (#1147), against a real Supabase.
 * The bug it guards: the phone sent only the estimate's id; the server signed its sent version — when the office had
 * changed and sent it again meanwhile, the client's signature was kept under a sum the client never saw. Now the phone
 * says the total it showed; the server refuses another (22023, estimate_total_mismatch) and nothing is signed. On the
 * phone: a card «the estimate was changed — the client signs again» that opens the estimate; signed again with the
 * estimate as it is now, the signature is kept.
 * Set up as e2e 206 (DB_URL of the local stack): a tech of company A with the right to sign contracts, his quick
 * estimate ($185, тестовые), sent by the owner. The phone's queue holds the signature taken on the older copy ($170).
 * The data is this run's own (rule 19, CHECKS §9 п.6).
 */
const { execFileSync } = require("node:child_process");
const { signIn, waitRows, seedOutbox } = require("../signIn.cjs");

const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

// the tech's send is refused (403 / 42501) and the stale total (400 / 22023) on purpose; the browser logs those refusals
exports.allowConsole = [/status of 403/, /status of 400/, /Failed to load resource/];

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const A = a1.companyId;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
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
  const run = Date.now().toString(36);
  if (!process.env.DB_URL) throw new Error("267: set DB_URL (supabase status -o env)");
  const psql = (sql) => execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });

  const email = `tech267-${run}@example.test`;
  const tech = await call("POST", "/auth/v1/admin/users", { email, password: a1.password, email_confirm: true, user_metadata: { full_name: "Nightly Tech 267" } });
  const E = uuid(); const V = uuid(); const O = uuid(); const C = uuid(); const P = uuid();
  psql(`
    insert into public.memberships (company_id, user_id, role, status, can_sign_contracts) values ('${A}', '${tech.id}', 'tech', 'active', true);
    insert into public.customers (id, company_id, display_name) values ('${C}', '${A}', 'Nightly 267 ${run}');
    insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('${P}', '${A}', '${C}', '267 Cloud St', 'Pasadena');
    insert into public.estimates (id, company_id, customer_id, property_id, title, created_by) values ('${E}', '${A}', '${C}', '${P}', 'Nightly 267', '${tech.id}');
    insert into public.estimate_versions (id, company_id, estimate_id, version_no, deposit_rule) values ('${V}', '${A}', '${E}', 1, '{"kind":"none"}');
    update public.estimates set current_version_id = '${V}' where id = '${E}';
    insert into public.estimate_options (id, company_id, version_id, name) values ('${O}', '${A}', '${V}', 'Only');
    insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents)
      values ('${A}', '${O}', 'labor', 'Nightly 267 line (тестовые)', 1, 18500);`);
  const owner = await call("POST", "/auth/v1/token?grant_type=password", { email: a1.email, password: a1.password }, seed.anonKey);
  await call("POST", "/rest/v1/rpc/send_estimate", { p_estimate_id: E, p_token: null }, owner.access_token);

  // the tech's phone: the client signed the older copy ($170) on site, offline; the signature waits in the queue
  await signIn(h, { ...a1, email, userId: tech.id });
  const ownerOf = { userId: tech.id, companyId: A };
  const at = new Date(Date.now() - 30_000).toISOString();
  const sign = (totalCents) => ({ k: "estimate.sign", id: E, svg: "M0 0 L10 10", signer: "Ann Client 267", sent: true, totalCents });
  await seedOutbox(h, [{ id: "q-267", op: sign(17000), at, tries: 0, owner: ownerOf }]);
  await h.go("/settings/profile");
  await p.evaluate(() => window.dispatchEvent(new Event("online")));

  // refused: the card says why, in our words (the card itself, by its testID — CHECKS §9 №3)
  const card = p.getByTestId("rejected-q-267").last();
  await card.waitFor({ state: "visible", timeout: 30000 });
  const text = await card.innerText();
  h.expect(/клиент подписал другую сумму/.test(text), `the card: the estimate changed, the client signs again (${text})`);
  h.expect(!/estimate_total_mismatch|another total/.test(text), "our own words, not the server's text");
  // and nothing was signed on the server
  const [still] = await waitRows(admin, `estimates?id=eq.${E}&select=status`, (r) => r[0]?.status === "sent", "the estimate still sent");
  h.expect(still.status === "sent", "the server kept no signature for the other total");
  const none = await waitRows(admin, `estimate_approvals?estimate_id=eq.${E}&select=id`, (r) => r.length === 0, "no approval");
  h.expect(none.length === 0, "no approval row");
  await h.shot("refused");

  // «Открыть»: the estimate it was about
  await card.getByRole("button", { name: "Открыть" }).click();
  await p.waitForURL(new RegExp(`/estimate/${E}`), { timeout: 15000 });
  h.expect(p.url().includes(`/estimate/${E}`), `«Открыть» opens the estimate (${p.url()})`);

  // signed again on the estimate as it is now ($185): kept
  await seedOutbox(h, [{ id: "q-267b", op: sign(18500), at: new Date().toISOString(), tries: 0, owner: ownerOf }]);
  await h.go("/settings/profile");
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  const [est] = await waitRows(admin, `estimates?id=eq.${E}&select=status`, (r) => r[0]?.status === "awaiting_countersign", "the signed estimate", 30000);
  h.expect(est.status === "awaiting_countersign", "signed again with the total the server has: kept");
  const [appr] = await waitRows(admin, `estimate_approvals?estimate_id=eq.${E}&select=selection`, (r) => r.length === 1, "the approval");
  h.expect(Number(appr.selection?.total) === 18500, `the signature keeps the total the client saw now (${JSON.stringify(appr.selection)})`);

  psql(`update public.memberships set status = 'disabled' where user_id = '${tech.id}' and company_id = '${A}'`);
};
