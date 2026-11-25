/**
 * e2e 2657 (cloud) — «Клиент подписал версию от …»: the window «Сделать копию / Сбросить» over a refused save (#2657, tail of #2478,
 * spec 65 §3.5, С7), against a real Supabase. The refusal itself (estimate_signed_meanwhile) and the kept edits are #2659's
 * (unit tests); here is the screen: the cards that hold the edits (`estimateEdit`) are put into the phone's list of refusals
 * (as the store writes them), by testID:
 * - «Что с правками?» on the card of «Профиль и аккаунт» opens the window (rej-choice) — «Позже» closes it, the card stays;
 * - «Сбросить» takes the card away (with «Вернуть»), nothing new on the server;
 * - «Сделать копию» → «Вернуть» (the toast): the editor of the copy closes, the card is back, no copy on the server (#2674 Б1);
 * - «Сделать копию» opens the editor of a NEW DRAFT (/estimate/new?id=…), the card goes, the copy reaches the server as a draft
 *   with the same client and title; the estimate the card was about is not touched.
 * The data is this run's own (rule 19, CHECKS §9 п.6): a client and a place of company A made through psql (DB_URL, as 280).
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
  if (!process.env.DB_URL) throw new Error("2657: set DB_URL (supabase status -o env)");
  const psql = (sql) => execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });
  const C = uuid(); const P = uuid();
  psql(`
    insert into public.customers (id, company_id, display_name) values ('${C}', '${A}', 'Nightly 2657 ${run}');
    insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('${P}', '${A}', '${C}', '2657 Cloud St', 'Pasadena');`);

  await signIn(h, a1);
  const title = `Nightly 2657 ${run}`;
  const doc = () => ({
    options: [{ id: uuid(), name: "Good", lines: [{ id: uuid(), name: "Nightly 2657 line", group: "labor", quantity: "1", unit: "hr", unitPriceCents: 9900 }] }],
    settings: { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: true, labor: true, material: true } }, deposit: { kind: "none" }, caHic: false },
  });
  const owner = { userId: a1.userId, companyId: A };
  const card = (id, estimateId) => ({
    id, owner, kind: "estimate.save", what: "estimate", href: `/estimate/${estimateId}`, labelKey: "est.rej.signedMeanwhile", reason: "estimate_signed_meanwhile",
    error: "estimate_signed_meanwhile", at: new Date(Date.now() - 60_000).toISOString(),
    estimateEdit: { title, customerId: C, propertyId: P, doc: doc() },
  });
  // written from a same-origin page where the app does not run (the favicon) — the running app would overwrite it (CHECKS §9 п.3)
  await p.goto(new URL("/favicon.ico", p.url()).href);
  await p.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [REJECTED_KEY, [card("r-later", uuid()), card("r-reset", uuid()), card("r-undo", uuid()), card("r-copy", uuid())]]);
  await h.go("/settings/profile");
  await tid("rejected-r-copy").waitFor({ timeout: 30000 });
  const before = (await admin(`estimates?title=eq.${encodeURIComponent(title)}&select=id`)).length;

  // «Позже»: the window closes, the card stays
  await tid("rejected-choose-r-later").click();
  await tid("rej-choice").waitFor({ timeout: 5000 });
  h.expect(/Клиент подписал смету/.test(await tid("rej-choice").innerText()), "the window says the client signed (no day known for this card)");
  await h.shot("choice");
  await tid("rej-choice-later").click();
  await p.getByTestId("rej-choice").locator("visible=true").waitFor({ state: "hidden", timeout: 4000 });
  await tid("rejected-r-later").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("rejected-r-later").count()) > 0, "«Позже»: the card stays");

  // «Сбросить»: the card goes (the toast's «Вернуть» puts it back), nothing new on the server
  await tid("rejected-choose-r-reset").click();
  await tid("rej-choice-reset").click();
  await p.getByTestId("rejected-r-reset").waitFor({ state: "detached", timeout: 5000 });
  h.expect((await admin(`estimates?title=eq.${encodeURIComponent(title)}&select=id`)).length === before, "«Сбросить»: nothing was made on the server");

  // «Сделать копию» and at once «Вернуть» (the toast): the editor of the copy goes too, the card is back, the copy is not made (Б1)
  await tid("rejected-choose-r-undo").click();
  await tid("rej-choice-copy").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 15000 });
  const undoneId = new URL(p.url()).searchParams.get("id");
  await tid("toast-undo").click();
  await p.waitForFunction(() => !/\/estimate\/new/.test(location.pathname), null, { timeout: 8000 });
  await tid("rejected-r-undo").waitFor({ timeout: 8000 });
  await p.waitForTimeout(3000);
  h.expect((await admin(`estimates?id=eq.${undoneId}&select=id`)).length === 0, "«Вернуть»: the copy was not made on the server");

  // «Сделать копию»: the editor of a new draft, the card goes, the copy reaches the server as a draft with the same client
  await tid("rejected-choose-r-copy").click();
  await tid("rej-choice-copy").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 15000 });
  const copyId = new URL(p.url()).searchParams.get("id");
  const [made] = await waitRows(admin, `estimates?id=eq.${copyId}&select=id,status,customer_id,title`, (r) => r.length === 1, "the copy", 30000);
  h.expect(made.status === "draft" && made.customer_id === C && made.title === title, `the copy: a draft of the same client and title (${JSON.stringify(made)})`);
  await h.go("/settings/profile");
  h.expect((await p.getByTestId("rejected-r-copy").count()) === 0, "«Сделать копию»: the card went");
};
