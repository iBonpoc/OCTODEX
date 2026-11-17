/**
 * pushNetGuard — pg_net on the hosting (docs/specs/27-push.md §4.6, «Принятые риски»; director's check of prod 07.11).
 * On Supabase supabase_admin grants EXECUTE on net.* to PUBLIC and lets anon read net's tables; our revoke (as postgres)
 * cannot take that away. The protection is ours to keep:
 * 1. the API never exposes the schemas net and cron (supabase/config.toml [api].schemas);
 * 2. net.* is called by named functions only, each security definer, revoked from every API role, with the key read from Vault inside it:
 *    app.push_kick (send-push, spec 27) and app.erase_kick (erase-storage, spec 50 §6: the schedule of the erasure; its address is
 *    checked by app.erase_kick_ok, a project host only). A new caller is a new line here, with the reason.
 * Each guard has a fixture that must fail, so it never passes silently.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** the schemas the API exposes, from config.toml [api] (none listed → Supabase's default: public, graphql_public) */
export function apiSchemas(toml: string): string[] {
  const api = /^\[api\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(toml)?.[1] ?? "";
  const list = /^\s*schemas\s*=\s*\[([^\]]*)\]/m.exec(api)?.[1];
  if (list === undefined) return ["public", "graphql_public"];
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/** every place in a migration that calls net.<fn>( — with the function it sits in (or null: outside a function) */
export function netCalls(sql: string): { fn: string | null; definer: boolean }[] {
  const out: { fn: string | null; definer: boolean }[] = [];
  const fnRe = /create (?:or replace )?function ([a-z_]+\.[a-z_0-9]+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/gi;
  let rest = sql;
  for (const m of sql.matchAll(fnRe)) {
    const head = m[2]!;
    const body = m[3]!;
    if (/\bnet\.[a-z_]+\s*\(/i.test(body)) out.push({ fn: m[1]!.toLowerCase(), definer: /security definer/i.test(head) });
    rest = rest.replace(m[0], "");
  }
  // comments may name net.http_post; only code counts
  const code = rest.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  if (/\bnet\.[a-z_]+\s*\(/i.test(code)) out.push({ fn: null, definer: false });
  return out;
}

/** the functions that may call net.* — each is security definer; why each is here is in the header above */
export const NET_CALLERS = ["app.push_kick", "app.erase_kick"];

/** a call is allowed only from a named caller that is security definer */
export function netCallAllowed(c: { fn: string | null; definer: boolean }): boolean {
  return c.fn !== null && NET_CALLERS.includes(c.fn) && c.definer;
}

const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();

describe("pg_net stays behind the named functions", () => {
  it("the API never exposes net or cron", () => {
    const schemas = apiSchemas(read("supabase/config.toml"));
    expect(schemas).not.toContain("net");
    expect(schemas).not.toContain("cron");
    // the fixture: a config that exposes net must be caught
    expect(apiSchemas('[api]\nenabled = true\nschemas = ["public", "net"]\n')).toContain("net");
    expect(apiSchemas("[db]\nport = 1\n")).toEqual(["public", "graphql_public"]);
  });
  it("only app.push_kick and app.erase_kick (security definer) call net.*", () => {
    const calls = migrations.flatMap((f) => netCalls(read(`supabase/migrations/${f}`)).map((c) => ({ ...c, f })));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(netCallAllowed(c), `${c.f}: net.* called outside ${NET_CALLERS.join(" and ")} (${c.fn ?? "outside a function"})`).toBe(true);
    }
    // both named callers really exist in the migrations (a rename would leave the list empty and the guard silent)
    for (const name of NET_CALLERS) expect(calls.some((c) => c.fn === name), `${name} not found`).toBe(true);
    // the fixtures: an invoker function, another definer, a bare call — each is caught
    expect(netCalls("create function public.x() returns void language sql as $$ select net.http_get('https://a') $$;")).toEqual([{ fn: "public.x", definer: false }]);
    expect(netCalls("create or replace function app.y() returns void language plpgsql security definer set search_path = '' as $$ begin perform net.http_post(url := 'x'); end $$;"))
      .toEqual([{ fn: "app.y", definer: true }]);
    expect(netCalls("select net.http_post(url := 'https://a');")).toEqual([{ fn: null, definer: false }]);
    // a foreign function with net.* is red, even a security definer; a named one that is not definer is red too
    expect(netCallAllowed({ fn: "app.y", definer: true })).toBe(false);
    expect(netCallAllowed({ fn: "app.erase_kick", definer: false })).toBe(false);
    expect(netCallAllowed({ fn: null, definer: false })).toBe(false);
    expect(netCallAllowed({ fn: "app.erase_kick", definer: true })).toBe(true);
    expect(netCalls("-- net.http_post is called by app.push_kick only\nselect 1;")).toEqual([]);
  });
});
