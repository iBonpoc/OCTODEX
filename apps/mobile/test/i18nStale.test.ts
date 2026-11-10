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

export function staleLabels(before: Record<string, Dict>, after: Record<string, Dict>, specs: Spec[]): Stale[] {
  const shown = Object.values(after).flatMap((d) => Object.values(d));
  const out: Stale[] = [];
  for (const [lang, old] of Object.entries(before)) {
    for (const [key, was] of Object.entries(old)) {
      const now = after[lang]?.[key] ?? null;
      if (now === was) continue;
      for (const needle of needlesOf(was)) {
        if (shown.some((v) => v.includes(needle))) continue; // still on some screen
        for (const s of specs)
          s.text.split("\n").forEach((l, i) => {
            if (!isComment(l) && !/i18n-old: ok/.test(l) && l.includes(needle)) out.push({ file: s.file, line: i + 1, key, lang, old: was, now, needle });
          });
      }
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
  ])("red on %s", (_w, b, a, code) => expect(staleLabels(ru(b), ru(a), spec(code)).length).toBe(1));
  it.each([
    ["the old text still shown by another key", { "a": "Готово", "b": "Готово" }, { "a": "Сделано", "b": "Готово" }, 'await h.click("Готово");'],
    ["a spec fixed in the same PR", { "m.s": "Мои настройки" }, { "m.s": "Профиль" }, 'await h.click("Профиль");'],
    ["a comment names the old text", { "m.s": "Мои настройки" }, { "m.s": "Профиль" }, "// «Профиль» (было «Мои настройки»)"],
    ["a line marked on purpose", { "m.s": "Мои настройки" }, { "m.s": "Профиль" }, 'h.expect(n === 0, "no «Мои настройки» any more"); // i18n-old: ok'],
    ["too short to tell", { "x": "Да" }, { "x": "Ок" }, 'await h.click("Да");'],
    ["the old text is a part of the new one (the known gap)", { "e": "Смета" }, { "e": "Смета клиента" }, 'await h.click("Смета");'],
  ])("green on %s", (_w, b, a, code) => expect(staleLabels(ru(b), ru(a), spec(code))).toEqual([]));
});
