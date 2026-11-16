/**
 * Chips of a choice never stand in two lines (#1095, DS А2): a <ChoiceChips> that names its field with `label` is a
 * segment (≤4 short options) or a field with a menu. The ones without `label` are the old wrapping chips: they move over
 * one by one, and this list only shrinks — a new <ChoiceChips> must come with `label`.
 * The same for several of many (#1797, DS §А4): <MultiChips> wraps — a new choice of several is a list with flags
 * (`CheckRows`) or a `PickerSheet`; the old <MultiChips> places only go away.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "src");
const files: string[] = [];
const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx$/.test(f) && files.push(join(d, f))));
walk(ROOT);

/** the opening tag of every <ChoiceChips …> (generics and braces skipped) */
export function chipTags(src: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = [];
  for (const m of src.matchAll(/<ChoiceChips\b/g)) {
    let i = m.index! + m[0].length;
    if (src[i] === "<") {
      let g = 0;
      do {
        if (src[i] === "<") g++;
        if (src[i] === ">") g--;
        i++;
      } while (g > 0 && i < src.length);
    }
    let d = 0;
    while (i < src.length) {
      const ch = src[i]!;
      if (ch === "{") d++;
      else if (ch === "}") d--;
      else if (ch === ">" && d === 0 && src[i - 1] !== "=") break;
      i++;
    }
    out.push({ tag: src.slice(m.index!, i), line: src.slice(0, m.index!).split("\n").length });
  }
  return out;
}

/** how many <ChoiceChips> are still the old chips (no `label`). Lower it as screens move over; never raise it. */
const LEGACY_MAX = 68;

describe("ChoiceChips name their field (#1095)", () => {
  const legacy: string[] = [];
  let all = 0;
  for (const f of files) {
    for (const { tag, line } of chipTags(readFileSync(f, "utf8"))) {
      all++;
      const t = tag.replace(/\blabel:/g, "");
      // `label={undefined}` and `label=""` are not a name: the chips stay the old ones (ChoiceChips takes them as no label too)
      const named = /\blabel=/.test(t) && !/\blabel=\{\s*(undefined|null|"")\s*\}/.test(t) && !/\blabel=""/.test(t);
      if (!named && !/\bnowrap\b/.test(t)) legacy.push(`${relative(ROOT, f)}:${line}`);
    }
  }
  it("the old chips (no label, not in a horizontal scroll) do not grow", () => {
    expect(legacy.length, `new <ChoiceChips> needs label=; the old ones:\n${legacy.join("\n")}`).toBeLessThanOrEqual(LEGACY_MAX);
  });
  it("`label={undefined}` and an empty label do not get around it", () => {
    const sample = (tag: string) => chipTags(tag)[0]!.tag;
    expect(/\blabel=\{\s*(undefined|null|"")\s*\}/.test(sample('<ChoiceChips label={undefined} items={x} />'))).toBe(true);
    expect(/\blabel=""/.test(sample('<ChoiceChips label="" items={x} />'))).toBe(true);
  });
  it("the parser sees the chips (guards the guard)", () => {
    expect(all).toBeGreaterThan(80);
    expect(all - legacy.length).toBeGreaterThanOrEqual(5);
  });
});

/** the old wrapping <MultiChips> places (several of many). Lower it as screens move over to `CheckRows`; never raise it. */
const MULTI_LEGACY_MAX = 12;

describe("several of many: no wrapping chips (#1797)", () => {
  const places: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<MultiChips\b/g)) places.push(`${relative(ROOT, f)}:${src.slice(0, m.index!).split("\n").length}`);
  }
  it("the old <MultiChips> places do not grow", () => {
    expect(places.length, `a new choice of several is CheckRows (ui/checkRows.tsx), not MultiChips; the old ones:\n${places.join("\n")}`).toBeLessThanOrEqual(MULTI_LEGACY_MAX);
  });
  it("the first run's directions are a list with flags", () => {
    expect(places.some((p) => p.startsWith("app/auth/trade.tsx"))).toBe(false);
  });
});
