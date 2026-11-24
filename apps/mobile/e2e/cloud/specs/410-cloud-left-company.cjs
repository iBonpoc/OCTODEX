/**
 * e2e 410 (cloud) — the person's role changes, then they are removed from the company (#1633 A2).
 * The bug it guards: the phone kept the company's copy (`octo.cloud.v1.<company>.<me>`) after the person was removed
 * from it, and the copy read with the role before after the role changed. Now the cache records its role (another role →
 * the next read keeps nothing of the one before) and a confirmed answer of the memberships wipes the caches of every
 * company the person is no longer in — read from the device, so a removal while the app was closed counts too.
 * A tech of company A signs in; the owner makes them «office» (straight in the database); the app starts again: the
 * cache is the office's. Then they are switched off; the app starts again: the company's copy is not on the device.
 * The data is this run's own (CHECKS §9 п.6).
 */
const { execFileSync } = require("node:child_process");
const { signIn } = require("../signIn.cjs");

exports.run = async (h, { seed }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const A = a1.companyId;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!process.env.DB_URL) throw new Error("410: set DB_URL (supabase status -o env)");
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
  const run = Date.now().toString(36);

  // a tech of company A (straight in the database, as e2e 260)
  const email = `tech410-${run}@example.test`;
  const tech = await call("POST", "/auth/v1/admin/users", { email, password: a1.password, email_confirm: true, user_metadata: { full_name: "Nightly Tech 410" } });
  sql(`insert into public.memberships (company_id, user_id, role, status) values ('${A}', '${tech.id}', 'tech', 'active');`);
  const techKey = `octo.cloud.v1.${A}.${tech.id}`;
  const roleOf = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? "{}") || {}).role ?? null, techKey);
  const until = (fn, arg, timeout = 20000) => p.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

  await signIn(h, { ...a1, email, userId: tech.id });
  const asTech = await until(([k]) => JSON.parse(localStorage.getItem(k) ?? "{}")?.role === "tech", [techKey]);
  h.expect(asTech, `the tech's cache ${techKey} records the role it was read with (${await roleOf()})`);

  // another role while the app was closed: the next start reads the company as the office, nothing of the tech's kept
  sql(`update public.memberships set role = 'office' where company_id = '${A}' and user_id = '${tech.id}';`);
  await p.reload();
  const asOffice = await until(([k]) => JSON.parse(localStorage.getItem(k) ?? "{}")?.role === "office", [techKey]);
  h.expect(asOffice, `after the role changed the cache is the office's (${await roleOf()})`);

  // removed while the app was closed: the first confirmed answer of the memberships wipes the company's copy
  sql(`update public.memberships set status = 'disabled' where company_id = '${A}' and user_id = '${tech.id}';`);
  await p.reload();
  const gone = await until(([k]) => localStorage.getItem(k) === null, [techKey]);
  const left = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("octo.cloud.v1.") && k !== "octo.cloud.v1.rejected"));
  h.expect(gone, `the company's copy is not on the device after the removal (${left.join(", ")})`);
  h.expect(!left.some((k) => k.startsWith(`octo.cloud.v1.${A}.`) && k.endsWith(tech.id)), `no copy of company A of this person (${left.join(", ")})`);
  await h.shot("removed");
};
