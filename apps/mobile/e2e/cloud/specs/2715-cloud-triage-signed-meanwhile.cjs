/**
 * e2e 2715 (cloud) — the window «Клиент подписал смету …» from «Требует внимания» (/triage), tail Ж2 of the review of #2674;
 * the same window from «Профиль и аккаунт» is 2657. A card that holds the edits (`estimateEdit`, as the store writes it) is put into
 * the phone's list of refusals; by testID (rule 19):
 * - it is the top card of «Требует внимания», its main step «Сделать копию…» (rejected-choose-*) opens the window (rej-choice);
 * - «Сделать копию с правками» opens the editor of a NEW DRAFT (/estimate/new?id=…), the copy reaches the server as a draft of the same
 *   client and title, and the card leaves «Требует внимания».
 * A second card (r-stay) is the top one once the first has gone — the check waits for it, not for seconds.
 * The data is this run's own (rule 19, CHECKS §9 п.6): a client and a place of company A made through psql (DB_URL, as 2657).
 */
const { execFileSync } = require("node:child_process");
const { signIn, waitRows } = require("../signIn.cjs");

const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
const REJECTED_KEY = "octo.cloud.v1.rejected";

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const a1 = seed.users.a1;
  const A = a1.companyId;
  const run = Date.now().toString(36);
  if (!process.env.DB_URL) throw new Error("2715: set DB_URL (supabase status -o env)");
  const psql = (sql) => execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });
  const C = uuid(); const P = uuid();
  psql(`
    insert into public.customers (id, company_id, display_name) values ('${C}', '${A}', 'Nightly 2715 ${run}');
    insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('${P}', '${A}', '${C}', '2715 Cloud St', 'Pasadena');`);

  await signIn(h, a1);
  const title = `Nightly 2715 ${run}`;
  const card = {
    id: "r-tri", owner: { userId: a1.userId, companyId: A }, kind: "estimate.save", what: "estimate", href: `/estimate/${uuid()}`,
    labelKey: "est.rej.signedMeanwhile", reason: "estimate_signed_meanwhile", error: "estimate_signed_meanwhile",
    at: new Date(Date.now() - 60_000).toISOString(),
    estimateEdit: {
      title, customerId: C, propertyId: P,
      doc: {
        options: [{ id: uuid(), name: "Good", lines: [{ id: uuid(), name: "Nightly 2715 line", group: "labor", quantity: "1", unit: "hr", unitPriceCents: 9900 }] }],
        settings: { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: true, labor: true, material: true } }, deposit: { kind: "none" }, caHic: false },
      },
    },
  };
  // written from a same-origin page where the app does not run (the favicon) — the running app would overwrite it (CHECKS §9 п.3)
  await p.goto(new URL("/favicon.ico", p.url()).href);
  await p.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [REJECTED_KEY, [card, { ...card, id: "r-stay", href: `/estimate/${uuid()}` }]]);
  await h.go("/triage");
  // a refused change is the top card of «Требует внимания» (as 118)
  await tid("triage-top-rej-r-tri").waitFor({ timeout: 30000 });
  await h.shot("triage");

  // the main step opens the window
  await tid("rejected-choose-r-tri").click();
  await tid("rej-choice").waitFor({ timeout: 5000 });
  for (const id of ["rej-choice-copy", "rej-choice-reset", "rej-choice-later"]) h.expect((await p.getByTestId(id).locator("visible=true").count()) === 1, `the window has «${id}»`);
  await h.shot("choice");

  // «Сделать копию с правками»: the editor of a new draft; the copy is on the server as a draft of the same client and title
  await tid("rej-choice-copy").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 15000 });
  const copyId = new URL(p.url()).searchParams.get("id");
  const [made] = await waitRows(admin, `estimates?id=eq.${copyId}&select=id,status,customer_id,title`, (r) => r.length === 1, "the copy", 30000);
  h.expect(made.status === "draft" && made.customer_id === C && made.title === title, `the copy: a draft of the same client and title (${JSON.stringify(made)})`);

  // the card has left «Требует внимания»: the other card (r-stay, same score, after it) is the top one now
  await h.go("/triage");
  await tid("triage-top-rej-r-stay").waitFor({ timeout: 15000 });
  h.expect((await p.getByTestId("triage-top-rej-r-tri").count()) === 0 && (await p.getByTestId("rejected-choose-r-tri").count()) === 0, "the card left «Требует внимания»");
};
