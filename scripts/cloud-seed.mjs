#!/usr/bin/env node
/**
 * Seed users for the nightly cloud scenarios (docs/specs/21 §4): node scripts/cloud-seed.mjs <out.json>
 * Against a LOCAL Supabase (`supabase start`); refuses any other URL. Env: SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY — the names `supabase status -o env` prints as API_URL, ANON_KEY, SERVICE_ROLE_KEY are
 * accepted too.
 * - the admin API creates the people with a confirmed email (no mail needed): a1 (company A), b1 (company B),
 *   d1 (company D — the account the deletion scenario removes);
 * - each person accepts the current Terms and Privacy and creates their company WITH THEIR OWN TOKEN, the way the app
 *   does (cloud/auth.tsx: accept_legal, then insert into companies — the trigger makes them the owner), so RLS and the
 *   consent rule are on the path, not around it.
 * Writes { url, anonKey, users: { a1: { email, password, userId, companyId }, … } } to <out.json>.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = (...names) => names.map((n) => process.env[n]).find(Boolean);
const URL_ = env("SUPABASE_URL", "API_URL");
const ANON = env("SUPABASE_ANON_KEY", "ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY");
const OUT = process.argv[2];
if (!URL_ || !ANON || !SERVICE || !OUT) {
  console.error("usage: SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/cloud-seed.mjs <out.json>");
  process.exit(2);
}
// never against the hosted project: these scenarios create and delete accounts
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(URL_)) {
  console.error(`cloud-seed: only a local Supabase (http://127.0.0.1:…), not ${URL_}`);
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const PASSWORD = "octo-nightly-Test-1"; // a throwaway local stack: a fixed password is fine
const PEOPLE = [
  { key: "a1", name: "Nightly A1", company: "Nightly Company A" },
  { key: "b1", name: "Nightly B1", company: "Nightly Company B" },
  { key: "d1", name: "Nightly D1", company: "Nightly Company D" },
];

async function must(label, p) {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

const users = {};
for (const person of PEOPLE) {
  const email = `${person.key}@nightly.octo.test`;
  const created = await must(
    `create ${email}`,
    admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: person.name } }),
  );
  const me = createClient(URL_, ANON, opts);
  await must(`sign in ${email}`, me.auth.signInWithPassword({ email, password: PASSWORD }));
  const status = await must(`legal_status ${email}`, me.rpc("legal_status"));
  // { terms: { current, accepted }, privacy: { … }, ok }
  const versions = { terms: status?.terms?.current, privacy: status?.privacy?.current };
  if (!versions.terms || !versions.privacy) throw new Error(`legal_status: no current versions in ${JSON.stringify(status)}`);
  await must(`accept_legal ${email}`, me.rpc("accept_legal", { p_versions: versions, p_platform: "web", p_app_version: "nightly" }));
  await must(`create ${person.company}`, me.from("companies").insert({ name: person.company }));
  const [m] = await must(`membership ${email}`, me.from("memberships").select("company_id, role").eq("user_id", created.user.id).eq("status", "active"));
  if (m?.role !== "owner") throw new Error(`${email}: expected owner of ${person.company}, got ${JSON.stringify(m)}`);
  users[person.key] = { email, password: PASSWORD, userId: created.user.id, companyId: m.company_id, company: person.company };
  console.log(`seeded ${email} → ${person.company} (${m.company_id})`);
}

fs.writeFileSync(OUT, JSON.stringify({ url: URL_, anonKey: ANON, users }, null, 2));
console.log(`cloud-seed: ${Object.keys(users).length} people → ${OUT}`);
