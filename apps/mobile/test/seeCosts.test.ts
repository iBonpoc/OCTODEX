/**
 * unit:seeCosts — #1837 (spec 54 §4 №5): «who sees our costs» is one rule for the whole app.
 * - roleSeesCosts is the table of the server's app.can_view_costs (19 §9); the database test T364–T366 checks the same
 *   table against the function itself (supabase/tests/core_rls.sql, T364) — change both together.
 * - serverSaysCosts: what the last load said; not known yet in the cloud — no; the demo (no server) — yes.
 * - seeCosts (what a screen shows): the server's «yes» and never in the tech view.
 * - keepCosts (what a write carries): the costs the phone holds, unless the server said «no».
 * - The guard: no screen, feature or store code reads db.costsVisible itself — only features/access.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/cloud/client", () => ({ supabase: {} }));
import { keepCosts, roleSeesCosts, seeCosts, serverSaysCosts } from "../src/features/access";
import { costsVisibleFor } from "../src/cloud/repo";

/** the server's roles × view_costs → app.can_view_costs (the same rows as T364 in core_rls.sql) */
const TABLE: [role: string, viewCosts: boolean, sees: boolean][] = [
  ["owner", false, true],
  ["admin", false, true],
  ["office", false, true],
  ["sales", false, false],
  ["sales", true, true],
  ["tech", false, false],
  ["tech", true, false],
  ["subcontractor", false, false],
  ["subcontractor", true, false],
];

describe("unit:seeCosts — #1837", () => {
  it("the client's table is the server's: every role, with and without view_costs", () => {
    for (const [role, viewCosts, sees] of TABLE) {
      expect(roleSeesCosts(role, viewCosts), `${role} view_costs=${viewCosts}`).toBe(sees);
      const m = { role, status: "active", permissions_override: viewCosts ? { view_costs: true } : null };
      expect(costsVisibleFor(m), `the load: ${role} view_costs=${viewCosts}`).toBe(sees);
    }
  });

  it("a membership that is not active, or none: no; an unknown role: no; view_costs as the text «true»: yes, as the server", () => {
    expect(roleSeesCosts("owner", true, false)).toBe(false);
    expect(costsVisibleFor({ role: "owner", status: "invited" })).toBe(false);
    expect(costsVisibleFor({ role: "office", status: "disabled" })).toBe(false);
    expect(costsVisibleFor({ role: "owner", status: "deleted" })).toBe(false);
    expect(costsVisibleFor(undefined)).toBe(false);
    expect(roleSeesCosts("auditor", true)).toBe(false);
    expect(costsVisibleFor({ role: "sales", status: "active", permissions_override: { view_costs: "true" } })).toBe(true);
  });

  it("the phone: the load's answer wins; not known in the cloud — no; the demo — yes", () => {
    expect(serverSaysCosts({ costsVisible: true }, "cloud")).toBe(true);
    expect(serverSaysCosts({ costsVisible: false }, "demo")).toBe(false);
    // an old cache (before the field) or before the first load: nothing is counted or written on a guess
    expect(serverSaysCosts({}, "cloud")).toBe(false);
    expect(serverSaysCosts({}, "demo")).toBe(true);
  });

  it("a screen shows costs on the server's «yes», never in the tech view (an owner who switched to «Мастер» too)", () => {
    expect(seeCosts({ costsVisible: true }, "sales", "cloud")).toBe(true);
    expect(seeCosts({ costsVisible: true }, "tech", "cloud")).toBe(false);
    expect(seeCosts({ costsVisible: false }, "director", "cloud")).toBe(false);
    expect(seeCosts({}, "director", "cloud")).toBe(false);
    expect(seeCosts({}, "director", "demo")).toBe(true);
    expect(seeCosts({}, "dispatcher", "demo")).toBe(true);
    expect(seeCosts({}, "sales", "demo")).toBe(true);
    expect(seeCosts({}, "tech", "demo")).toBe(false);
  });

  it("a write carries the costs the phone holds unless the server said «no» (an unknown flag never drops them for good)", () => {
    expect(keepCosts({})).toBe(true);
    expect(keepCosts({ costsVisible: true })).toBe(true);
    expect(keepCosts({ costsVisible: false })).toBe(false);
  });

  it("guard: only features/access.ts reads db.costsVisible (the load writes it; a param of that name is a boolean)", () => {
    const SRC = join(__dirname, "../src");
    // a read of the stored flag: `x.costsVisible`, `x?.costsVisible`, `x["costsVisible"]`, `{ costsVisible } = …` —
    // but a boolean parameter or prop of that name (p.costsVisible, ctx.costsVisible, c./o.costsVisible) is not one
    const READ = /(?<!\b(?:p|ctx|c|o))\??\.costsVisible\b|\[\s*["']costsVisible["']\s*\]|\{[^}=]*\bcostsVisible\b[^}=]*\}\s*=(?!=)/;
    const ALLOWED: Record<string, string> = {
      "features/access.ts": "the one rule",
      "cloud/repo.ts": "the load writes what the server said",
      // «Сборки»' file (#1834): merging a fresh load keeps no history the server did not send — the flag as it came
      "features/suppliers.ts": "keepCostHistory after a load",
    };
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) {
          const rel = relative(SRC, p).replace(/\\/g, "/");
          if (ALLOWED[rel]) continue;
          readFileSync(p, "utf8").split("\n").forEach((line, i) => {
            const code = line.replace(/\/\/.*$/, "");
            if (/^\s*\*/.test(code)) return;
            if (READ.test(code)) bad.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
        }
      }
    };
    walk(SRC);
    expect(bad).toEqual([]);
  });
});
