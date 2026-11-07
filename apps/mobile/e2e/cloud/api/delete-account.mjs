#!/usr/bin/env node
/**
 * api-2 «delete the account» (S22) against a real local Supabase: the edge function delete-account (verify_jwt) →
 * public.delete_account → Supabase Auth soft delete (docs/specs/21 §4; 19 §6.7; the automatic part of the manual
 * pass 19 §6.8). node delete-account.mjs <seed.json>  — env SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY).
 * Uses d1, the only owner of company D:
 * - no person's token (the anon apikey only) → 401; a bad body → 400; the wrong word → 400; the last owner without «close the company» → 400 with
 *   the company in `detail`; a fake token → 401;
 * - DELETE + close D → 200 {deleted, auth: "done"};
 * - after: the password no longer signs in; the auth user is soft-deleted, its user_metadata cleared; company D is
 *   closed (closed_at) and its row stays; d1's membership is `deleted`; public.users is anonymised.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const seedFile = process.argv[2];
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
if (!seedFile || !SERVICE) {
  console.error("usage: SUPABASE_SERVICE_ROLE_KEY=… node delete-account.mjs <seed.json>");
  process.exit(2);
}
const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(seed.url, SERVICE, opts);
const d1 = seed.users.d1;
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};
const FN = `${seed.url}/functions/v1/delete-account`;
async function call(body, jwt) {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: seed.anonKey, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

// a fresh sign-in (delete_account wants one ≤ 10 min old, from this token)
const me = createClient(seed.url, seed.anonKey, opts);
const s = await me.auth.signInWithPassword({ email: d1.email, password: d1.password });
if (s.error) throw new Error(`sign in d1: ${s.error.message}`);
const jwt = s.data.session.access_token;

// the function's first call may download its npm imports: wait for it to boot (up to a minute)
let first = null;
let last5xx = null;
for (let i = 0; i < 30 && !first; i++) {
  first = await call({ confirm: "DELETE" }).catch((e) => ({ status: 0, json: { error: e.message } }));
  if (first.status === 0 || first.status >= 500) {
    last5xx = first;
    first = null;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
if (!first) {
  console.error(`✗ the edge function delete-account did not boot: ${JSON.stringify(last5xx)} (docker logs supabase_edge_runtime_*)`);
  process.exit(1);
}
// no person's token: the gateway takes the anon apikey as the JWT, the function finds no user in it → 401
ok(first.status === 401, `no person's token (only the anon apikey) → 401 (${first.status})`);
ok((await call({ confirm: "DELETE" }, "not.a.jwt")).status === 401, "a fake token → 401");
ok((await call("{", jwt)).status === 400, "a bad body → 400");
ok((await call({ confirm: "DELETE", extra: 1 }, jwt)).status === 400, "an unknown key → 400");
const word = await call({ confirm: "REMOVE" }, jwt);
ok(word.status === 400 && /word/.test(word.json?.error ?? ""), `the wrong word → 400 «${word.json?.error}»`);
const last = await call({ confirm: "DELETE" }, jwt);
ok(last.status === 400 && last.json?.detail === d1.companyId, `the last owner, company not closed → 400 with the company («${last.json?.error}»)`);
ok(!!(await me.from("memberships").select("status").eq("user_id", d1.userId).single()).data, "nothing deleted by the refusals: d1 still reads its membership");

const done = await call({ confirm: "DELETE", closeCompanies: [d1.companyId] }, jwt);
ok(done.status === 200 && done.json?.deleted === true && done.json?.auth === "done", `DELETE + close D → 200 deleted, auth done (${done.status} ${JSON.stringify(done.json)})`);

/* ---------- after ---------- */
const again = await createClient(seed.url, seed.anonKey, opts).auth.signInWithPassword({ email: d1.email, password: d1.password });
ok(!!again.error, `the password no longer signs in (${again.error?.message})`);
const au = await admin.auth.admin.getUserById(d1.userId);
const meta = au.data?.user?.user_metadata ?? {};
ok(!au.data?.user || !!au.data.user.deleted_at || au.error, `the auth user is soft-deleted (${au.data?.user?.deleted_at ?? au.error?.message ?? "gone"})`);
ok(!meta.full_name, "user_metadata: the name is cleared");
const co = await admin.from("companies").select("id, closed_at").eq("id", d1.companyId).maybeSingle();
ok(!!co.data && !!co.data.closed_at, `company D stays and is closed (closed_at ${co.data?.closed_at})`);
const ms = await admin.from("memberships").select("status").eq("user_id", d1.userId).eq("company_id", d1.companyId).maybeSingle();
ok(ms.data?.status === "deleted", `d1's membership is deleted (${ms.data?.status})`);
const pu = await admin.from("users").select("full_name, email").eq("id", d1.userId).maybeSingle();
ok(!pu.data || (pu.data.email !== d1.email && pu.data.full_name !== "Nightly D1"), `public.users is anonymised (${JSON.stringify(pu.data)})`);
// the others are untouched
const a1 = await createClient(seed.url, seed.anonKey, opts).auth.signInWithPassword({ email: seed.users.a1.email, password: seed.users.a1.password });
ok(!a1.error, "another account (a1) still signs in");

console.log(failed ? `\napi-2 delete account: ${failed} FAILED` : "\napi-2 delete account: PASSED");
process.exit(failed ? 1 : 0);
