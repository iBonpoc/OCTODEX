/**
 * pushNetGuard — pg_net on the hosting (docs/specs/27-push.md §4.6, «Принятые риски»; director's check of prod 07.11).
 * On Supabase supabase_admin grants EXECUTE on net.* to PUBLIC and lets anon read net's tables; our revoke (as postgres)
 * cannot take that away. The protection is ours to keep:
 * 1. the API never exposes the schemas net and cron (supabase/config.toml [api].schemas);
 * 2. net.* is called by one function only — app.push_kick, security definer (the key is read from Vault inside it).
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

const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();

describe("pg_net stays behind app.push_kick", () => {
  it("the API never exposes net or cron", () => {
    const schemas = apiSchemas(read("supabase/config.toml"));
    expect(schemas).not.toContain("net");
    expect(schemas).not.toContain("cron");
    // the fixture: a config that exposes net must be caught
    expect(apiSchemas('[api]\nenabled = true\nschemas = ["public", "net"]\n')).toContain("net");
    expect(apiSchemas("[db]\nport = 1\n")).toEqual(["public", "graphql_public"]);
  });
  it("only app.push_kick (security definer) calls net.*", () => {
    const calls = migrations.flatMap((f) => netCalls(read(`supabase/migrations/${f}`)).map((c) => ({ ...c, f })));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c, `${c.f}: net.* called outside app.push_kick`).toMatchObject({ fn: "app.push_kick", definer: true });
    }
    // the fixtures: an invoker function, another definer, a bare call — each is caught
    expect(netCalls("create function public.x() returns void language sql as $$ select net.http_get('https://a') $$;")).toEqual([{ fn: "public.x", definer: false }]);
    expect(netCalls("create or replace function app.y() returns void language plpgsql security definer set search_path = '' as $$ begin perform net.http_post(url := 'x'); end $$;"))
      .toEqual([{ fn: "app.y", definer: true }]);
    expect(netCalls("select net.http_post(url := 'https://a');")).toEqual([{ fn: null, definer: false }]);
    expect(netCalls("-- net.http_post is called by app.push_kick only\nselect 1;")).toEqual([]);
  });
});
