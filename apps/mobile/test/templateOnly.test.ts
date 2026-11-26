/**
 * Дизайн-система GoRix (#2893, этап 2; правило 29, план: «экран — только из шаблона»): каждый экран `src/app/**`
 * собирается из шаблона `src/ui/templates` (ObjectScreen, EditorScreen, ListScreen, OverviewScreen, CalendarScreen —
 * и будущих «Мастер», «Документ клиенту», «Настройки»). Экран считается на шаблоне, если он сам или модуль, который
 * он рендерит (до 3 шагов импорта внутри src/app, src/features, src/modules), берёт шаблон.
 *
 * `NOT_YET` — экраны, собранные вручную на 26.11.2026 (опись этапа 1). Список ТОЛЬКО СОКРАЩАЕТСЯ: новый экран вне
 * шаблона — красный; экран переехал на шаблон — красный, пока его не убрали из списка (чтобы счётчик был честным).
 * Поимённые исключения навсегда (холст, подпись, документ клиенту до своего шаблона) — `EXEMPT`, с причиной.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const screens = walk(APP).filter((f) => f.endsWith(".tsx") && !/\/_layout\.tsx$/.test(f) && !/\+not-found\.tsx$/.test(f));
const rel = (f: string) => relative(APP, f).replace(/\\/g, "/");

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const c of [base, base + ".tsx", base + ".ts", join(base, "index.tsx"), join(base, "index.ts")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
const TEMPLATES = join(SRC, "ui", "templates");
const SEARCHED = [APP, join(SRC, "features"), join(SRC, "modules")];
const importsOf = (f: string) => [...readFileSync(f, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);

/** does this file, or a module it imports (≤ depth steps, inside app/features/modules), take a screen template? */
export function usesTemplate(file: string, depth = 3, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  for (const spec of importsOf(file)) {
    const r = resolve(file, spec);
    if (!r) continue;
    if (r.startsWith(TEMPLATES)) return true;
    if (depth > 0 && SEARCHED.some((d) => r.startsWith(d)) && usesTemplate(r, depth - 1, seen)) return true;
  }
  return false;
}

/** forever outside the screen templates — the reason and whose word (DS GoRix §9 «Исключения») */
const EXEMPT: Record<string, string> = {
  "module/[key]/[screen].tsx": "холст модуля Gutters — полный экран (DS §19а, основатель 12.11.2026 #1274)",
  "estimate/signature.tsx": "холст подписи — полный экран (правило 2/3 исключения холста)",
};

// opis 26.11.2026 (#2893 этап 1): screens built by hand — ONLY SHRINKS
const NOT_YET = new Set<string>([
  /* NOT_YET:BEGIN */
  "(tabs)/inbox.tsx",
  "(tabs)/index.tsx",
  "(tabs)/messages.tsx",
  "(tabs)/more.tsx",
  "auth/company.tsx",
  "auth/invite.tsx",
  "auth/sign-in.tsx",
  "auth/terms.tsx",
  "auth/trade.tsx",
  "calls.tsx",
  "catalog/[id].tsx",
  "catalog/index.tsx",
  "client/import.tsx",
  "client/imports.tsx",
  "company/[section].tsx",
  "company/checklist/[id].tsx",
  "company/checklists.tsx",
  "company/index.tsx",
  "company/intake.tsx",
  "company/leads.tsx",
  "company/modules.tsx",
  "company/payments.tsx",
  "company/schedule.tsx",
  "estimate/templates.tsx",
  "expense/new.tsx",
  "f/[token].tsx",
  "figures/[metric].tsx",
  "help.tsx",
  "job/new.tsx",
  "job/schedule.tsx",
  "jobs.tsx",
  "legal/[doc].tsx",
  "messages/[key].tsx",
  "money.tsx",
  "notifications.tsx",
  "p/[token].tsx",
  "property/[id].tsx",
  "purchase-order/[id].tsx",
  "purchase-orders/index.tsx",
  "receipt/[id].tsx",
  "reports/[id].tsx",
  "reports/index.tsx",
  "settings/delete-account.tsx",
  "settings/design-system/index.tsx",
  "settings/index.tsx",
  "settings/profile.tsx",
  "suppliers/[id].tsx",
  "suppliers/index.tsx",
  "team.tsx",
  /* NOT_YET:END */
]);

describe("GoRix: a screen is built from a template (only shrinks)", () => {
  const off = screens.map(rel).filter((r) => !(r in EXEMPT) && !usesTemplate(join(APP, r))).sort();
  it("no new hand-built screen", () => {
    const added = off.filter((r) => !NOT_YET.has(r));
    expect(added, "новый экран вне шаблона — соберите его из src/ui/templates (DS GoRix §5) или впишите исключение с причиной").toEqual([]);
  });
  it("a screen that moved onto a template leaves the list", () => {
    const moved = [...NOT_YET].filter((r) => !off.includes(r));
    expect(moved, "экран уже на шаблоне — уберите его из NOT_YET").toEqual([]);
  });
  it("the check itself sees a template two imports away and a hand-built screen", () => {
    expect(usesTemplate(join(APP, "client/[id].tsx"))).toBe(true);
    expect(usesTemplate(join(APP, "help.tsx"))).toBe(false);
  });
  it("exemptions name real screens", () => {
    for (const r of Object.keys(EXEMPT)) expect(existsSync(join(APP, r)), r).toBe(true);
  });
});
