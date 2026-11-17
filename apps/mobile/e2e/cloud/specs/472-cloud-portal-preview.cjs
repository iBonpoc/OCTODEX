/**
 * e2e 472 (cloud, #2020) — «Как видит клиент» of a cloud company only shows, against a real Supabase (story map S8 «Подпись
 * клиента», S9 «Оплата»). The demo side (the page works as the client's) — e2e/specs/472-portal-preview-demo.cjs.
 * С1 ДАНО the owner of company A signed in, a sent estimate, КОГДА they open it «as client», ТОГДА the note «Так увидит клиент»
 *    is there, the name field and the signature do not answer, «Approve and sign» is off — and the SERVER still has the
 *    estimate «sent» with no signature.
 * С5 ДАНО an estimate the client signed (by the link, anonymous) and the company countersigned — its deposit invoice, КОГДА the
 *    owner opens it «as client», ТОГДА «Pay by card» is there but off, and the server has no payment for the invoice.
 * Set up through the auth API and the local database (DB_URL), as 206. The data is this run's own (CHECKS §9 п.6).
 */
const { execFileSync } = require("node:child_process");
const { signIn, waitRows } = require("../signIn.cjs");
const { estAct } = require("../../estimateMenu.cjs");

const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const A = a1.companyId;
  const call = async (method, path, body, token) => {
    const r = await fetch(`${seed.url}${path}`, {
      method,
      headers: { apikey: seed.anonKey, authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "return=representation" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const run = Date.now().toString(36);
  if (!process.env.DB_URL) throw new Error("472: set DB_URL (supabase status -o env)");

  // two estimates of company A: E1 only sent; E2 with a 10% deposit (signed by the client and the company below)
  const C = uuid(); const P = uuid();
  const est = [{ e: uuid(), v: uuid(), o: uuid(), dep: '{"kind":"none"}', title: `Nightly 472 sign ${run}` },
               { e: uuid(), v: uuid(), o: uuid(), dep: '{"kind":"pct","bps":1000}', title: `Nightly 472 pay ${run}` }];
  const sql = [
    `insert into public.customers (id, company_id, display_name) values ('${C}', '${A}', 'Nightly 472 ${run}');`,
    `insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('${P}', '${A}', '${C}', '472 Cloud St', 'Pasadena');`,
    ...est.flatMap((x) => [
      `insert into public.estimates (id, company_id, customer_id, property_id, title) values ('${x.e}', '${A}', '${C}', '${P}', '${x.title}');`,
      `insert into public.estimate_versions (id, company_id, estimate_id, version_no, deposit_rule) values ('${x.v}', '${A}', '${x.e}', 1, '${x.dep}');`,
      `update public.estimates set current_version_id = '${x.v}' where id = '${x.e}';`,
      `insert into public.estimate_options (id, company_id, version_id, name) values ('${x.o}', '${A}', '${x.v}', 'Only');`,
      `insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents) values ('${A}', '${x.o}', 'labor', 'Nightly 472 line', 1, 20000);`,
    ]),
  ].join("\n");
  execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });
  const owner = await call("POST", "/auth/v1/token?grant_type=password", { email: a1.email, password: a1.password }, seed.anonKey);
  const tokens = [];
  for (const x of est) tokens.push(await call("POST", "/rest/v1/rpc/send_estimate", { p_estimate_id: x.e, p_token: null }, owner.access_token));
  // E2: the client signs by the link (anonymous), the company countersigns — the deposit invoice is issued
  await call("POST", "/rest/v1/rpc/portal_accept", { p_token: tokens[1], p_option_id: est[1].o, p_addon_ids: [], p_signer: "Ann Client 472", p_svg: "M0 0 L10 10", p_consent: true, p_channel: "portal" }, seed.anonKey);
  await call("POST", "/rest/v1/rpc/countersign_estimate", { p_estimate_id: est[1].e, p_svg: "M0 0 L9 9", p_member_signature_id: null, p_job_id: null, p_invoice_id: null }, owner.access_token);
  const [job] = await waitRows(admin, `jobs?estimate_id=eq.${est[1].e}&select=id`, (r) => r.length === 1, "the job of the signed estimate");
  const [inv] = await waitRows(admin, `invoices?job_id=eq.${job.id}&select=id,total,paid`, (r) => r.length === 1, "the deposit invoice");

  await signIn(h, a1);

  // С1: the sent estimate «as client» — the page shows, nothing in the signing block answers
  await h.go(`/estimate/${est[0].e}`);
  await p.getByTestId("est-more").locator("visible=true").first().waitFor({ timeout: 30000 });
  await estAct(p, "client");
  await p.waitForURL(/\/p\//, { timeout: 8000 });
  await p.getByTestId("portal-preview-note").locator("visible=true").first().waitFor({ timeout: 8000 });
  const approve = p.getByRole("button", { name: /Одобрить и подписать|Approve and sign|Aprobar y firmar/ }).last();
  h.expect(await approve.isDisabled(), "С1: «Approve and sign» is off in the preview");
  h.expect(!(await p.getByPlaceholder(/Ваше имя|Your name|Su nombre/).last().isEditable()), "С1: the name field does not take text");
  await h.shot("preview-sign");
  const [e1] = await admin(`estimates?id=eq.${est[0].e}&select=status`);
  const appr = await admin(`estimate_approvals?estimate_id=eq.${est[0].e}&select=id`);
  h.expect(e1.status === "sent" && appr.length === 0, `С1: the server still has it sent, no signature (${e1.status}, ${appr.length})`);

  // С5: the signed estimate «as client» — the deposit's card button is there and off; no payment on the server
  await h.go(`/estimate/${est[1].e}`);
  await p.getByTestId("est-more").locator("visible=true").first().waitFor({ timeout: 30000 });
  await estAct(p, "client");
  await p.waitForURL(/\/p\//, { timeout: 8000 });
  const pay = p.getByTestId(`portal-pay-preview-${inv.id}`).locator("visible=true").first();
  await pay.waitFor({ timeout: 15000 });
  h.expect(await pay.getByRole("button").isDisabled(), "С5: «Pay by card» is off in the preview");
  await h.shot("preview-pay");
  const pays = await admin(`payments?invoice_id=eq.${inv.id}&select=id`);
  h.expect(pays.length === 0, `С5: no payment on the server (${pays.length})`);
};
