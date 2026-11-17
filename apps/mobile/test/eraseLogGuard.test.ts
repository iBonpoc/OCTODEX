/**
 * eraseLogGuard — the logs of the erasure carry no text of a Postgres error (issue #1982, security check of PR #1979).
 * The text of an error can hold values (a storage path, an id of a person) and lands in the database log; only SQLSTATE may.
 * The guard reads the LAST definition of each erasure function in the migrations (a later «create or replace» wins) and
 * refuses `sqlerrm` / `sqlstate, sqlerrm` / `message_text` in it. A fixture that must fail keeps it from passing silently.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const DIR = path.join(ROOT, "supabase/migrations");

/** the erasure functions whose last definition must not print an error text */
export const ERASE_FUNCTIONS = [
  "app.erase_account",
  "app.erase_queue_run",
  "app.erase_cron",
  "app.erase_kick",
  "app.erase_stuck",
  "app.erase_purge_done",
  "app.erase_retry",
  "public.delete_account",
  "public.storage_erase_claim",
  "public.storage_erase_done",
  "public.storage_erase_fail",
];

/** the body (head to the closing `$$;`) of the function's definition in one migration, or null */
export function definitionIn(sql: string, fn: string): string | null {
  const re = new RegExp(`create (?:or replace )?function ${fn.replace(".", "\\.")}\\s*\\(`, "gi");
  let last: string | null = null;
  for (const m of sql.matchAll(re)) {
    const end = sql.indexOf("\n$$;", m.index!);
    last = sql.slice(m.index!, end === -1 ? undefined : end + 4);
  }
  return last;
}

/** the printed error text: sqlerrm, or message_text read from get stacked diagnostics */
export function printsErrorText(body: string): boolean {
  const code = body.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  return /\bsqlerrm\b/i.test(code) || /\bmessage_text\b/i.test(code);
}

describe("erasure logs carry SQLSTATE only", () => {
  it("the last definition of every erasure function prints no error text", () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const fn of ERASE_FUNCTIONS) {
      let last: { f: string; body: string } | null = null;
      for (const f of files) {
        const body = definitionIn(fs.readFileSync(path.join(DIR, f), "utf8"), fn);
        if (body) last = { f, body };
      }
      expect(last, `${fn} is not defined in any migration`).not.toBeNull();
      expect(printsErrorText(last!.body), `${fn} (${last!.f}) prints an error text: only sqlstate may be logged`).toBe(false);
    }
  });
  it("the fixtures: an error text is caught, sqlstate and a comment about it pass", () => {
    expect(printsErrorText("raise warning 'x: % %', sqlstate, sqlerrm;")).toBe(true);
    expect(printsErrorText("get stacked diagnostics v = message_text;")).toBe(true);
    expect(printsErrorText("raise warning 'x: %', sqlstate;")).toBe(false);
    expect(printsErrorText("-- the text (sqlerrm) is not logged\nraise warning 'x: %', sqlstate;")).toBe(false);
    // the last definition wins: an older one with sqlerrm does not count once a later one is clean
    const a = "create or replace function app.f() returns void language plpgsql as $$ begin raise warning '%', sqlerrm; end;\n$$;\n";
    const b = "create or replace function app.f() returns void language plpgsql as $$ begin raise warning '%', sqlstate; end;\n$$;\n";
    expect(printsErrorText(definitionIn(a + b, "app.f")!)).toBe(false);
    expect(printsErrorText(definitionIn(b + a, "app.f")!)).toBe(true);
  });
});
