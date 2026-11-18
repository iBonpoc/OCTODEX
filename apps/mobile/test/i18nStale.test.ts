/**
 * Old labels left in e2e after an i18n change (#621, docs/ai/CHECKS.md §9 п.2, §10 п.6): a PR renamed a label, and a spec
 * of another PR (or an old one) still looked for the old text — red only in the batch or on main (≈8 of 41 red runs).
 * Here: every value of src/i18n (ru, en, es) that this branch changed or removed against its base — when the old text
 * is shown nowhere any more, no line of e2e/specs or e2e/cloud (as they are on THIS branch) may still contain it.
 * A line that names the old text on purpose («было «…»») carries `i18n-old: ok`.
 * Base: I18N_BASE (CI: the PR's base commit) or `git merge-base HEAD origin/main`. Known gap: an old text that stays
 * a part of a new one («Смета» → «Смета клиента») is skipped — the screen still shows it.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Dict = Record<string, string>;
const app = join(__dirname, "..");
const LANGS = ["ru", "en", "es"] as const;
const MIN = 4;

/** `"key": "value",` lines of a dictionary file (every value is one JSON string on one line). */
export function parseDict(src: string): Dict {
  const out: Dict = {};
  for (const m of src.matchAll(/^\s*("(?:[^"\\]|\\.)+")\s*:\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/gm)) out[JSON.parse(m[1]!)] = JSON.parse(m[2]!);
  return out;
}

export type Spec = { file: string; text: string };
export type Stale = { file: string; line: number; key: string; lang: string; old: string; now: string | null; needle: string };

/** The parts of a value a spec could look for: the text between {placeholders}, at least MIN letters. */
const needlesOf = (v: string) => v.split(/\{[^}]*\}/).map((s) => s.trim()).filter((s) => s.length >= MIN);
// comment lines (a doc block, `// …`) explain the change; code lines are what runs
const isComment = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);

/**
 * What a line of a spec looks for by its start or middle (#1961: `/Убран лишний желоб/` for «Убран лишний желоб, лежавший поверх
 * другого» — the whole old text is not on the line, so the needle above does not see it): the plain runs of its regex literals
 * and of the strings it gives `getByText` / `expectText`, at least PART letters — the regex's own signs split a run.
 */
const PART = 8;
export function lookedFor(line: string): string[] {
  const out: string[] = [];
  const runs = (body: string) => {
    for (const r of body.replace(/\\([()[\]{}.*+?^$|/\\-])/g, "\u0000$1").split(/\\[a-zA-Z]|[()[\]{}.*+?^$|]/)) {
      const t = r.replace(/\u0000/g, "").trim();
      if (t.length >= PART) out.push(t);
    }
  };
  for (const m of line.matchAll(/(?:^|[(,=:!&|?\s])\/((?:[^/\\\n]|\\.)+)\/[a-z]*/g)) runs(m[1]!);
  for (const m of line.matchAll(/(?:getByText|expectText)\(\s*"((?:[^"\\]|\\.)*)"/g)) if (m[1]!.length >= PART) out.push(m[1]!);
  return out;
}

export function staleLabels(before: Record<string, Dict>, after: Record<string, Dict>, specs: Spec[]): Stale[] {
  const shown = Object.values(after).flatMap((d) => Object.values(d));
  const out: Stale[] = [];
  const lines = specs.flatMap((s) => s.text.split("\n").map((l, i) => ({ s, l, i, parts: isComment(l) || /i18n-old: ok/.test(l) ? [] : lookedFor(l) })));
  for (const [lang, old] of Object.entries(before)) {
    for (const [key, was] of Object.entries(old)) {
      const now = after[lang]?.[key] ?? null;
      if (now === was) continue;
      const hit = new Set<string>();
      const add = (s: Spec, i: number, needle: string) => {
        const id = `${s.file}:${i}`;
        if (hit.has(id)) return;
        hit.add(id);
        out.push({ file: s.file, line: i + 1, key, lang, old: was, now, needle });
      };
      for (const needle of needlesOf(was)) {
        if (shown.some((v) => v.includes(needle))) continue; // still on some screen
        for (const { s, l, i } of lines) if (!isComment(l) && !/i18n-old: ok/.test(l) && l.includes(needle)) add(s, i, needle);
      }
      // a part of the old text the line looks for, shown nowhere any more
      for (const { s, i, parts } of lines)
        for (const part of parts) if (was.includes(part) && !shown.some((v) => v.includes(part))) add(s, i, part);
    }
  }
  return out;
}

const git = (...a: string[]) => execFileSync("git", a, { cwd: app, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
function base(): string | null {
  if (process.env.I18N_BASE) return process.env.I18N_BASE;
  try {
    return git("merge-base", "HEAD", "origin/main");
  } catch {
    return null;
  }
}
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".cjs") ? [join(dir, d.name)] : []));

describe("e2e: no old label after an i18n change (#621)", () => {
  const at = base();
  const ci = !!process.env.CI;
  it.skipIf(!at && !ci)("this branch's e2e do not look for a label it changed", () => {
    expect(at, "no base to compare with: set I18N_BASE (checks.yml fetches the PR's base)").toBeTruthy();
    const before = Object.fromEntries(LANGS.map((l) => [l, parseDict(git("show", `${at}:apps/mobile/src/i18n/${l}.ts`))]));
    const after = Object.fromEntries(LANGS.map((l) => [l, parseDict(readFileSync(join(app, `src/i18n/${l}.ts`), "utf8"))]));
    expect(Object.keys(after.ru!).length).toBeGreaterThan(1000);
    const specs = [...files(join(app, "e2e/specs")), ...files(join(app, "e2e/cloud"))].map((f) => ({ file: f.slice(app.length + 1), text: readFileSync(f, "utf8") }));
    const found = staleLabels(before, after, specs).map((s) => `${s.file}:${s.line} — «${s.needle}» (${s.lang} ${s.key}: «${s.old}» → ${s.now === null ? "removed" : `«${s.now}»`})`);
    expect(found, "fix these specs in this PR (or mark a line that names the old text on purpose: // i18n-old: ok)").toEqual([]);
  });

  it("GitHub gives the guard its base (checks.yml)", () => {
    const yml = readFileSync(join(app, "../../.github/workflows/checks.yml"), "utf8");
    const base = yml.indexOf("I18N_BASE=");
    expect(base, "checks.yml writes I18N_BASE").toBeGreaterThan(0);
    expect(base, "…before the unit tests run").toBeLessThan(yml.indexOf("npm run typecheck && npm test"));
  });

  it("reads the dictionaries whole", () => {
    for (const l of LANGS) {
      const src = readFileSync(join(app, `src/i18n/${l}.ts`), "utf8");
      expect(Object.keys(parseDict(src)).length, `${l}: every "key": "value" line is read`).toBe((src.match(/^\s*"[^"]+":/gm) ?? []).length);
    }
    expect(parseDict('  "a.b": "Say \\"hi\\" {n}",\n')).toEqual({ "a.b": 'Say "hi" {n}' });
  });

  // the guard itself
  const ru = (d: Dict) => ({ ru: d });
  const spec = (text: string): Spec[] => [{ file: "e2e/specs/x.cjs", text }];
  it.each([
    ["a renamed label", { "m.s": "Мои настройки" }, { "m.s": "Профиль" }, 'await h.click("Мои настройки");'],
    ["a removed label", { "m.s": "Мои настройки" }, {}, "h.expect((await p.getByText(\"Мои настройки\").count()) === 0);"],
    ["a part between placeholders", { "inv.due": "Ожидает оплаты · {n}" }, { "inv.due": "К оплате · {n}" }, "await h.expectText(/Ожидает оплаты · \\d+/);"],
    ["in a cloud spec too", { "r.m": "Роль Мастер" }, { "r.m": "Мастер" }, 'await h.expectText(/Роль Мастер/);'],
    ["the start of the old text in a regex (#1961)", { "d.c": "Убран лишний желоб, лежавший поверх другого" }, { "d.c": "Убран лишний gutter, лежавший поверх другого" }, "await h.expectText(/Убран лишний желоб/);"],
    ["the start of the old text in getByText", { "d.r": "Такой желоб уже есть — линия не добавлена" }, { "d.r": "Такой gutter уже есть — линия не добавлена" }, "await p.getByText(/Такой желоб уже есть/).first().waitFor();"],
  ])("red on %s", (_w, b, a, code) => expect(staleLabels(ru(b), ru(a), spec(code)).length).toBe(1));
  it.each([
    ["the old text still shown by another key", { "a": "Готово", "b": "Готово" }, { "a": "Сделано", "b": "Готово" }, 'await h.click("Готово");'],
    ["a spec fixed in the same PR", { "m.s": "Мои настройки" }, { "m.s": "Профиль" }, 'await h.click("Профиль");'],
    ["a comment names the old text", { "m.s": "Мои настройки" }, { "m.s": "Профиль" }, "// «Профиль» (было «Мои настройки»)"],
    ["a line marked on purpose", { "m.s": "Мои настройки" }, { "m.s": "Профиль" }, 'h.expect(n === 0, "no «Мои настройки» any more"); // i18n-old: ok'],
    ["too short to tell", { "x": "Да" }, { "x": "Ок" }, 'await h.click("Да");'],
    ["the old text is a part of the new one (the known gap)", { "e": "Смета" }, { "e": "Смета клиента" }, 'await h.click("Смета");'],
    ["a regex part still shown by the new text", { "d.c": "Убран лишний желоб" }, { "d.c": "Убран лишний gutter" }, "await h.expectText(/Убран лишний/);"],
    ["a regex of the new text", { "d.c": "Убран лишний желоб" }, { "d.c": "Убран лишний gutter" }, "await h.expectText(/Убран лишний gutter/);"],
  ])("green on %s", (_w, b, a, code) => expect(staleLabels(ru(b), ru(a), spec(code))).toEqual([]));
});
