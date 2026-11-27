/**
 * Дизайн-система GoRix (#2893, этап 2; правило 29, план: «экран — только из шаблона»): каждый экран `src/app/**`
 * собирается из шаблона `src/ui/templates` (ObjectScreen, EditorScreen, ListScreen, OverviewScreen, CalendarScreen —
 * и будущих «Мастер», «Документ клиенту», «Настройки»). Экран считается на шаблоне, если он сам или модуль, который
 * он рендерит (до 3 шагов импорта внутри src/app, src/features, src/modules), берёт шаблон.
 *
 * `NOT_YET` — экраны, собранные вручную на 26.11.2026 (опись этапа 1). Список ТОЛЬКО СОКРАЩАЕТСЯ: новый экран вне
 * шаблона — красный; экран переехал на шаблон — красный, пока его не убрали из списка (чтобы счётчик был честным).
 * Поимённые исключения навсегда (холст модуля, подпись, переадресации) — `EXEMPT`, с причиной. Документ клиенту (`p/`, `f/`),
 * правовые страницы и мастер входа ждут своих шаблонов (этап 5) и пока стоят в `NOT_YET`.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
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
const rel = (f: string) => relative(APP, f).replace(/\\/g, "/");
const screens = walk(APP).filter((f) => f.endsWith(".tsx") && !/(^|\/)_layout\.tsx$/.test(rel(f)) && !/\+not-found\.tsx$/.test(rel(f)));

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const c of [base, base + ".tsx", base + ".ts", join(base, "index.tsx"), join(base, "index.ts")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
const TEMPLATES = join(SRC, "ui", "templates") + sep;
const TEMPLATE_NAMES = ["OverviewScreen", "ListScreen", "ObjectScreen", "EditorScreen", "CalendarScreen"];
const TEMPLATE_FILES = new Set(TEMPLATE_NAMES.map((n) => join(SRC, "ui", "templates", `${n}.tsx`)));
const SEARCHED = [APP, join(SRC, "features"), join(SRC, "modules")].map((d) => d + sep);
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** value imports and re-exports of a file: [names taken ("*" = all / default), module spec]; `import type` and `type X` are left out */
export function valueImports(code: string): [string[], string][] {
  const out: [string[], string][] = [];
  const src = stripComments(code);
  for (const m of src.matchAll(/(?:^|[;\n])\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    if (m[2]) continue;
    const clause = m[3]!;
    const braces = clause.match(/\{([\s\S]*)\}/);
    const named = braces ? braces[1]!.split(",").map((x) => x.trim()).filter((x) => x && !x.startsWith("type ")).map((x) => x.split(/\s+as\s+/)[0]!.trim()) : [];
    const rest = braces ? clause.replace(braces[0], "").replace(/,/g, " ").trim() : clause.trim();
    const names = [...named, ...(rest ? ["*"] : [])];
    if (names.length) out.push([names, m[4]!]);
  }
  for (const m of src.matchAll(/(?:^|[;\n])\s*import\s+["']([^"']+)["']/g)) out.push([["*"], m[1]!]);
  for (const m of src.matchAll(/(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push([["*"], m[1]!]);
  return out;
}

/**
 * Does this file draw a screen template — itself, or through a module it imports (≤ `depth` steps inside app/features/modules)?
 * Only the five template components count: a type, `parts` (CreateButton, MoreButton) or `types` of the templates folder do not.
 * An import is taken as «draws» (the assumption of this guard): a screen that imports a template component is on it.
 */
export function usesTemplate(file: string, depth = 3, seen = new Map<string, number>()): boolean {
  if ((seen.get(file) ?? -1) >= depth) return false;
  seen.set(file, depth);
  for (const [names, spec] of valueImports(readFileSync(file, "utf8"))) {
    const r = resolve(file, spec);
    if (!r) continue;
    if (TEMPLATE_FILES.has(r)) return true;
    if (r.startsWith(TEMPLATES)) {
      if (names.some((n) => TEMPLATE_NAMES.includes(n))) return true;
      continue;
    }
    if (depth > 0 && SEARCHED.some((d) => r.startsWith(d)) && usesTemplate(r, depth - 1, seen)) return true;
  }
  return false;
}

/** forever outside the screen templates — the reason and whose word (DS GoRix §9 «Исключения») */
const EXEMPT: Record<string, string> = {
  "(tabs)/index.tsx": "переадресация на главную роли, экрана нет (как NOT_A_SCREEN в screens.test.ts)",
  "(tabs)/inbox.tsx": "переадресация, экрана нет (как NOT_A_SCREEN в screens.test.ts)",
  "module/[key]/[screen].tsx": "холст модуля Gutters — полный экран (DS §19а, основатель 12.11.2026 #1274)",
  "estimate/signature.tsx": "холст подписи — полный экран (правило 2/3 исключения холста)",
};

// opis 26.11.2026 (#2893 этап 1): screens built by hand — ONLY SHRINKS
const NOT_YET = new Set<string>([
  /* NOT_YET:BEGIN */
  "(tabs)/triage.tsx",
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
  "estimate/new.tsx",
  "estimate/templates.tsx",
  "expense/new.tsx",
  "f/[token].tsx",
  "figures/[metric].tsx",
  "finance.tsx",
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
  it("the check itself: a template component counts; a type, parts or the types file do not (code review 26.11)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tpl-"));
    const tpl = relative(dir, join(SRC, "ui", "templates")).replace(/\\/g, "/");
    const fx = (name: string, code: string) => {
      const f = join(dir, name);
      writeFileSync(f, code);
      return f;
    };
    expect(usesTemplate(fx("a.tsx", `import { ObjectScreen } from "${tpl}";`))).toBe(true);
    expect(usesTemplate(fx("b.tsx", `import { ListScreen as L, type MainAction } from "${tpl}/index";`))).toBe(true);
    expect(usesTemplate(fx("c.tsx", `import { EditorScreen } from "${tpl}/EditorScreen";`))).toBe(true);
    expect(usesTemplate(fx("d.tsx", `import type { MainAction } from "${tpl}";`))).toBe(false);
    expect(usesTemplate(fx("e.tsx", `import { type MainAction } from "${tpl}";`))).toBe(false);
    expect(usesTemplate(fx("f.tsx", `import { CreateButton, MoreButton } from "${tpl}/parts";`))).toBe(false);
    expect(usesTemplate(fx("g.tsx", `// import { ObjectScreen } from "${tpl}";\nexport default 1;`))).toBe(false);
    expect(usesTemplate(join(APP, "client/[id].tsx")), "a real screen two imports away").toBe(true);
  });
  it("exemptions name real screens", () => {
    for (const r of Object.keys(EXEMPT)) expect(existsSync(join(APP, r)), r).toBe(true);
  });
});
