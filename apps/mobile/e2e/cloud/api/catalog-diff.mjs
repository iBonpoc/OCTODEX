#!/usr/bin/env node
/**
 * The auth stub = Supabase (docs/specs/21 §4 «cat»): node catalog-diff.mjs <stub.json> <live.json>
 * stub.json — supabase/tests/run.sh with CATALOG_OUT (bare Postgres + auth_stub.sql); live.json — the same
 * supabase/tests/catalog.sql against `supabase start`. Every function and table of public must have the same
 * parameters, defaults and rights in both: serverCatalog.test.ts trusts the stub's dump on every PR.
 * Exit 1 and a list of differences when they differ.
 */
import fs from "node:fs";

const [stubFile, liveFile] = process.argv.slice(2);
if (!stubFile || !liveFile) {
  console.error("usage: node catalog-diff.mjs <stub.json> <live.json>");
  process.exit(2);
}
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const stub = load(stubFile);
const live = load(liveFile);
const diffs = [];
for (const kind of ["functions", "tables"]) {
  const key = (x) => `${x.name}(${x.args ?? ""})`;
  const a = new Map(stub[kind].map((x) => [key(x), x]));
  const b = new Map(live[kind].map((x) => [key(x), x]));
  if (a.size < 30 || b.size < 30) diffs.push(`${kind}: too few (stub ${a.size}, live ${b.size}) — an empty dump compares equal`);
  for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = JSON.stringify(a.get(k) ?? null);
    const y = JSON.stringify(b.get(k) ?? null);
    if (x !== y) diffs.push(`${kind} ${k}\n    stub: ${x}\n    live: ${y}`);
  }
}
if (diffs.length) {
  console.error(`catalog-diff: the stub differs from Supabase in ${diffs.length} place(s):\n  ${diffs.join("\n  ")}`);
  process.exit(1);
}
console.log(`catalog-diff: the stub = Supabase (${stub.functions.length} functions, ${stub.tables.length} tables)`);
