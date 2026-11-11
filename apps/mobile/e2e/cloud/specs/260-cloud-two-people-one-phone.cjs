/**
 * e2e 260 (cloud) — two people one after the other on one phone, the same company (#864, X-04; 19 §6.12).
 * The bug it guards: the cloud cache was `octo.cloud.v1.<company>` — the next person signed in to the same company read
 * the previous person's copy. Now it is `octo.cloud.v1.<company>.<user>`; once the next person's own cache is read, the
 * previous person's copy leaves the device (the server has it).
 * The owner a1 signs in and loads the company (a client only this run has), signs out; a tech of the same company signs
 * in on the same browser: a1's cache is not on the device, the tech's own is. The data is this run's own (CHECKS §9 п.6).
 */
const { execFileSync } = require("node:child_process");
const { signIn } = require("../signIn.cjs");

const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

exports.run = async (h, { seed }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const A = a1.companyId;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
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
  const run = Date.now().toString(36);
  const client = `Nightly 260 ${run}`;

  // a tech of company A and a client of this run (straight in the database, as e2e 206)
  const email = `tech260-${run}@example.test`;
  const tech = await call("POST", "/auth/v1/admin/users", { email, password: a1.password, email_confirm: true, user_metadata: { full_name: "Nightly Tech 260" } });
  if (!process.env.DB_URL) throw new Error("260: set DB_URL (supabase status -o env)");
  const sql = `
    insert into public.memberships (company_id, user_id, role, status) values ('${A}', '${tech.id}', 'tech', 'active');
    insert into public.customers (id, company_id, display_name) values ('${uuid()}', '${A}', '${client}');`;
  execFileSync("psql", [process.env.DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });

  const caches = () => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("octo.cloud.v1.") && k !== "octo.cloud.v1.rejected"));
  const ownerKey = `octo.cloud.v1.${A}.${a1.userId}`;
  const techKey = `octo.cloud.v1.${A}.${tech.id}`;

  // the owner: the company loaded from the server into the owner's own cache
  await signIn(h, a1);
  const holds = await p
    .waitForFunction(([k, c]) => (localStorage.getItem(k) ?? "").includes(c), [ownerKey, client], { timeout: 15000 })
    .then(() => true, () => false);
  h.expect(holds, `the owner's cache ${ownerKey} holds this run's client`);

  // signs out on the same phone
  await h.go("/settings/profile");
  await h.click("Выйти");
  // signed out: the session leaves the browser (supabase-js keeps it as «sb-…-auth-token»)
  await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.endsWith("-auth-token")), null, { timeout: 15000 });

  // the tech signs in on the same browser: the owner's copy leaves once the tech's own is read
  await signIn(h, { ...a1, email, userId: tech.id });
  const settled = await p
    .waitForFunction(([own, mine]) => localStorage.getItem(mine) !== null && localStorage.getItem(own) === null, [ownerKey, techKey], { timeout: 15000 })
    .then(() => true, () => false);
  const left = await caches();
  h.expect(settled, `the tech's cache is there and the owner's is gone (${left.join(", ")})`);
  h.expect(left.includes(techKey), `the tech's own cache ${techKey} (${left.join(", ")})`);
  h.expect(!left.includes(ownerKey), `the owner's cache is not on the device after the tech signed in (${left.join(", ")})`);
  h.expect(left.every((k) => k.endsWith(`.${tech.id}`)), `only the tech's caches (${left.join(", ")})`);
  await h.shot("tech-signed-in");
};
