/**
 * unit:seeCosts — #1837 (spec 54 §4 №5): «who sees our costs» is one rule for the whole app.
 * - roleSeesCosts is the table of the server's app.can_view_costs (19 §9); the database test T364–T366 checks the same
 *   table against the function itself (supabase/tests/core_rls.sql) — change both together.
 * - seeCosts: what the last load said; not known yet in the cloud — no (an old cache never shows nor writes a cost);
 *   the demo (no server) — by its role.
 * - The guard: no screen, feature or store code reads db.costsVisible itself — only features/access.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/cloud/client", () => ({ supabase: {} }));
import { roleSeesCosts, seeCosts } from "../src/features/access";
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

  it("a membership that is not active, or none: no", () => {
    expect(roleSeesCosts("owner", true, false)).toBe(false);
    expect(costsVisibleFor({ role: "owner", status: "invited" })).toBe(false);
    expect(costsVisibleFor(undefined)).toBe(false);
  });

  it("the phone: the load's answer wins; not known in the cloud — no; the demo — by role, the tech no", () => {
    expect(seeCosts({ costsVisible: true }, "sales", "cloud")).toBe(true);
    expect(seeCosts({ costsVisible: false }, "director", "cloud")).toBe(false);
    expect(seeCosts({ costsVisible: false }, "director", "demo")).toBe(false);
    // an old cache (before the field) or before the first load: no cost is shown or written on a guess
    expect(seeCosts({}, "director", "cloud")).toBe(false);
    expect(seeCosts({}, "director", "demo")).toBe(true);
    expect(seeCosts({}, "dispatcher", "demo")).toBe(true);
    expect(seeCosts({}, "sales", "demo")).toBe(true);
    expect(seeCosts({}, "tech", "demo")).toBe(false);
  });

  it("guard: only features/access.ts reads db.costsVisible (the load writes it; a param of that name is a boolean)", () => {
    const SRC = join(__dirname, "../src");
    // `<something db-like>.costsVisible` — a read of the stored flag, not a boolean parameter called costsVisible
    const READ = /\b(?:db|d0|d|next|cur|raw|store\.db|dbRef\.current)\??\.costsVisible\b/;
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
