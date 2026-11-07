#!/usr/bin/env node
/**
 * api-1 «two companies do not see each other» against a real local Supabase (docs/specs/21 §4):
 * node isolation.mjs <seed.json> <catalog.live.json>
 * Through PostgREST with each person's own token — not `set role` as in supabase/tests (those check the same rules
 * inside the database; this checks the API on the phone's path: GoTrue JWT → PostgREST → RLS).
 * - A1 writes a client, a property, a lead and a job (create_job) in company A — the positive side: the rules let the
 *   owner work;
 * - B1 (company B): every table and view of public it may read (from the live catalog) holds no row of company A;
 *   update and delete by A's ids touch 0 rows; an insert with A's company_id fails; create_job on A's client fails;
 *   a file under A's folder in Storage is refused, and B1 cannot read A's file;
 * - anon (no sign-in) reads nothing of A.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [seedFile, catalogFile] = process.argv.slice(2);
if (!seedFile || !catalogFile) {
  console.error("usage: node isolation.mjs <seed.json> <catalog.live.json>");
  process.exit(2);
}
const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};
async function signIn(u) {
  const c = createClient(seed.url, seed.anonKey, opts);
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`sign in ${u.email}: ${error.message}`);
  return c;
}
const { a1, b1 } = seed.users;
const A = a1.companyId;
const a = await signIn(a1);
const b = await signIn(b1);
const anon = createClient(seed.url, seed.anonKey, opts);

/* ---------- A works in its own company ---------- */
const customerId = crypto.randomUUID();
const propertyId = crypto.randomUUID();
const leadSource = (await a.from("lead_sources").select("id").eq("company_id", A).limit(1)).data?.[0]?.id;
ok(!!leadSource, "A1 reads its company's lead sources (seeded by the company trigger)");
ok(!(await a.from("customers").insert({ id: customerId, company_id: A, display_name: "Nightly client (A)" })).error, "A1 adds a client");
ok(
  !(await a.from("properties").insert({ id: propertyId, company_id: A, customer_id: customerId, address_line1: "1 Test St", address_city: "Los Angeles" })).error,
  "A1 adds a property",
);
const leadId = crypto.randomUUID();
ok(!(await a.from("leads").insert({ id: leadId, company_id: A, source_id: leadSource, contact_name: "Nightly lead (A)" })).error, "A1 adds a lead");
const jobId = crypto.randomUUID();
const job = await a.rpc("create_job", { p_job_id: jobId, p_customer_id: customerId, p_property_id: propertyId, p_title: "Nightly job (A)" });
ok(!job.error, `A1 creates a job (create_job)${job.error ? `: ${job.error.message}` : ""}`);
const fileName = `${A}/${crypto.randomUUID()}.jpg`.toLowerCase();
const up = await a.storage.from("files").upload(fileName, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), { contentType: "image/jpeg" });
const aFile = !up.error;
console.log(`  (A1 file upload: ${up.error ? `refused — ${up.error.message}; the cross-read check is skipped` : "ok"})`);

/* ---------- B sees none of it ---------- */
const readable = catalog.tables.filter((t) => t.authenticated[0]).map((t) => t.name);
ok(readable.length >= 30, `B1 reads ${readable.length} tables and views of the live catalog`);
const ofA = (r) => r.company_id === A || r.id === A || [customerId, propertyId, leadId, jobId].includes(r.id);
// the same read as A1 first: it must SEE its rows, or «B sees nothing» proves nothing (a positive control)
const seen = [];
for (const t of ["companies", "customers", "properties", "leads", "jobs"]) {
  const { data } = await a.from(t).select("*").limit(1000);
  if ((data ?? []).some(ofA)) seen.push(t);
}
ok(seen.length === 5, `the same read as A1 sees A's rows (${seen.join(", ")})`);
const leaks = [];
let read = 0;
for (const t of readable) {
  const { data, error } = await b.from(t).select("*").limit(1000);
  if (error) continue; // a column-level grant refuses `*`: nothing read is nothing leaked
  read++;
  const hit = (data ?? []).filter(ofA);
  if (hit.length) leaks.push(`${t}: ${hit.length}`);
}
ok(read >= 30, `B1's reads went through (${read} of ${readable.length}; the rest refuse \`*\` by column grants)`);
ok(!leaks.length, `B1 reads no row of company A in any table (${leaks.join(", ") || "none"})`);
const upd = await b.from("customers").update({ display_name: "hacked" }).eq("id", customerId).select("id");
ok(!upd.error ? (upd.data ?? []).length === 0 : true, "B1 updates A's client: 0 rows");
const del = await b.from("leads").delete().eq("id", leadId).select("id");
ok(!del.error ? (del.data ?? []).length === 0 : true, "B1 deletes A's lead: 0 rows");
ok(!!(await b.from("customers").insert({ company_id: A, display_name: "B into A" })).error, "B1 cannot insert into company A");
ok(
  !!(await b.rpc("create_job", { p_job_id: crypto.randomUUID(), p_customer_id: customerId, p_property_id: propertyId, p_title: "B on A" })).error,
  "B1 cannot create a job on A's client (create_job refuses)",
);
const bUp = await b.storage.from("files").upload(`${A}/${crypto.randomUUID()}.jpg`.toLowerCase(), new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), { contentType: "image/jpeg" });
ok(!!bUp.error, "B1 cannot put a file in A's folder");
if (aFile) ok(!!(await b.storage.from("files").download(fileName)).error, "B1 cannot read A's file");

/* ---------- and the still unchanged truth on A's side ---------- */
const still = await a.from("customers").select("display_name").eq("id", customerId).single();
ok(still.data?.display_name === "Nightly client (A)", "A's client is unchanged");
ok(((await a.from("leads").select("id").eq("id", leadId)).data ?? []).length === 1, "A's lead is still there");

/* ---------- anon reads nothing ---------- */
const anonLeaks = [];
for (const t of readable) {
  const { data } = await anon.from(t).select("*").limit(10);
  if ((data ?? []).length) anonLeaks.push(t);
}
ok(!anonLeaks.length, `anon reads nothing (${anonLeaks.join(", ") || "none"})`);

console.log(failed ? `\napi-1 isolation: ${failed} FAILED` : "\napi-1 isolation: PASSED");
process.exit(failed ? 1 : 0);
