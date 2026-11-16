#!/usr/bin/env node
/**
 * api-3 «new accounts only through the server» (docs/specs/52 §8 Р10, #1756) against a real local Supabase
 * (`[auth] enable_signup = false` in supabase/config.toml). node request-code.mjs <seed.json> — env
 * SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY).
 * - the public ways to make an account (sign-up, a code with create_user) are refused;
 * - request-code makes the account: the email only — no password, no metadata; the answer for a known address is the same;
 * - then a code with create_user: false is accepted by Auth; the code itself (taken from the admin API — the email with it
 *   is checked by the browser spec 102 through Mailpit) signs in and confirms the address;
 * - a bad body → 400, GET → 405.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const seedFile = process.argv[2];
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
if (!seedFile || !SERVICE) {
  console.error("usage: SUPABASE_SERVICE_ROLE_KEY=… node request-code.mjs <seed.json>");
  process.exit(2);
}
const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(seed.url, SERVICE, opts);
const anon = createClient(seed.url, seed.anonKey, opts);
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};
const FN = `${seed.url}/functions/v1/request-code`;
async function call(body, method = "POST") {
  const res = await fetch(FN, {
    method,
    headers: { "content-type": "application/json", apikey: seed.anonKey },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  return { status: res.status, text: await res.text() };
}
async function userByEmail(email) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const u = data.users.find((x) => x.email === email);
    if (u || data.users.length < 200) return u ?? null;
  }
  return null;
}
const fresh = `api3.${Date.now()}@example.com`;
const other = `api3b.${Date.now()}@example.com`;

// the public ways are closed
const su = await anon.auth.signUp({ email: other, password: "Api3-password-1" });
ok(!!su.error, `public sign-up is refused (${su.error?.message ?? "no refusal"})`);
const otpNew = await anon.auth.signInWithOtp({ email: other, options: { shouldCreateUser: true } });
ok(!!otpNew.error, `a code with create_user for a new address is refused (${otpNew.error?.message ?? "no refusal"})`);
ok((await userByEmail(other)) === null, "no account was made by the public ways");

// the function
const bad = await call({ email: "not-an-address" });
ok(bad.status === 400, `a bad address → 400 (${bad.status})`);
const extra = await call({ email: fresh, password: "x" });
ok(extra.status === 400, `anything but {email} → 400 (${extra.status})`);
ok((await call(null, "GET")).status === 405, "GET → 405");
const first = await call({ email: fresh });
ok(first.status === 200, `request-code makes the account → 200 (${first.status} ${first.text})`);
const again = await call({ email: fresh });
ok(again.status === first.status && again.text === first.text, "a known address gets the very same answer");
const u = await userByEmail(fresh);
ok(!!u, "the account exists");
ok(u && !u.email_confirmed_at, "not confirmed until the code is typed");
ok(u && Object.keys(u.user_metadata ?? {}).filter((k) => k !== "email_verified").length === 0, `no metadata (${JSON.stringify(u?.user_metadata)})`);
const pw = await anon.auth.signInWithPassword({ email: fresh, password: "Api3-password-1" });
ok(!!pw.error, "no password signs in to it");

// the code for an existing account only, then in
const otp = await anon.auth.signInWithOtp({ email: fresh, options: { shouldCreateUser: false } });
ok(!otp.error, `the code goes to the existing account (${otp.error?.message ?? "ok"})`);
const link = await admin.auth.admin.generateLink({ type: "magiclink", email: fresh });
const code = link.data?.properties?.email_otp ?? null;
ok(!!code && /^\d{8}$/.test(code), `an 8-digit code (otp_length = 8) (${link.error?.message ?? (code ? "ok" : "none")})`);
if (code) {
  const v = await anon.auth.verifyOtp({ email: fresh, token: code, type: "email" });
  ok(!v.error && !!v.data.session, `the code signs in (${v.error?.message ?? "ok"})`);
  const after = await userByEmail(fresh);
  ok(!!after?.email_confirmed_at, "the code confirmed the address");
}

if (failed) {
  console.error(`api-3: ${failed} check(s) failed`);
  process.exit(1);
}
console.log("api-3: all checks passed");
