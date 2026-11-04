/**
 * Design-system guard (CLAUDE.md rule 1, "Naryad"): components use tokens only.
 * Fails on raw colors, raw numbers for size/spacing/radius/font, raw font families, and lists of objects
 * rendered as rows inside one card (rule 12 — use CardList / ItemCard).
 * A deliberate exception needs `// ds-allow: <reason>` on the same line.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "src");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(f)) files.push(p);
  }
};
walk(ROOT);
const code = files.filter((f) => !f.includes(`${join("src", "i18n")}`) && !f.endsWith("seed.ts"));

const STYLE_KEYS =
  "width|height|minHeight|maxHeight|minWidth|maxWidth|fontSize|borderRadius|borderWidth|borderTopWidth|borderBottomWidth|padding|paddingHorizontal|paddingVertical|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginHorizontal|marginVertical|marginTop|marginBottom|marginLeft|marginRight|gap|rowGap|columnGap|top|left|right|bottom|lineHeight|letterSpacing";
const rules: { name: string; re: RegExp }[] = [
  { name: "raw color", re: /(color|Color|fill|stroke|background)\s*[:=]\s*["'`](#[0-9a-fA-F]{3,8}|rgba?\()/ },
  { name: "raw number in style", re: new RegExp(`\\b(${STYLE_KEYS}):\\s*-?(?!0\\b|1\\b)\\d+(\\.\\d+)?(?![%\\w.])`) },
  { name: "raw opacity", re: /opacity:\s*0?\.\d/ },
  { name: "raw fontWeight", re: /fontWeight:\s*["']?\d/ },
  { name: "raw fontFamily", re: /fontFamily:\s*["']/ },
];

const outsideUi = code.filter((f) => !f.includes(`${join("src", "ui")}`));

describe("design system: components", () => {
  it("text only through <T> (no raw react-native Text outside src/ui)", () => {
    const hits = outsideUi.filter((f) => {
      const imp = readFileSync(f, "utf8").split("\n").find((l) => /from "react-native"/.test(l) && /\bText\b/.test(l) && !l.includes("ds-allow"));
      return !!imp;
    });
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });
  it("taps only through Press / Button / IconButton / Card (44 pt hit area), no raw Pressable / Touchable* outside src/ui", () => {
    const hits = outsideUi.filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .some((l) => /from "react-native"/.test(l) && /\b(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/.test(l) && !l.includes("ds-allow")),
    );
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });
  it("no hardcoded UI text in JSX (all strings via i18n RU/EN/ES)", () => {
    const hits: string[] = [];
    for (const f of outsideUi.filter((x) => x.endsWith(".tsx"))) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.includes("ds-allow")) return;
          const inline = /<[A-Za-z][\w.]*(\s[^<>]*)?>\s*[^<>{}]*[A-Za-zА-Яа-яЁё]{3,}[^<>{}]*<\//.test(line); // <T>Hello</T>
          const bare = /^\s*[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё'’]*(\s+[A-Za-zА-Яа-яЁё'’,.!?-]+)+\s*$/.test(line) && !/^\s*(return|else|break|continue|default|try|finally|do|type|import|export|as|from|const|let|await|async|case)\b/.test(line); // text on its own line
          if (inline || bare) hits.push(`${relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 100)}`);
        });
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("design system: tokens only", () => {
  for (const rule of rules) {
    it(`no ${rule.name}`, () => {
      const hits: string[] = [];
      for (const f of code) {
        readFileSync(f, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (line.includes("ds-allow")) return;
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
            if (rule.re.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 100)}`);
          });
      }
      expect(hits, hits.join("\n")).toEqual([]);
    });
  }

  it("lists of objects are cards (no Divider-separated rows of ItemCard/ListRow inside one Card in screens)", () => {
    const hits: string[] = [];
    for (const f of code.filter((x) => x.includes(`${join("src", "app")}`))) {
      const s = readFileSync(f, "utf8");
      // <Card> … .map( … <Divider /> … <ListRow   (allowed only with ds-allow, e.g. menus inside sheets)
      const re = /<Card>\s*\{[^{}]*\.map\([\s\S]{0,300}?<Divider \/>[\s\S]{0,200}?<ListRow/g;
      for (const m of s.matchAll(re)) {
        const line = s.slice(0, m.index).split("\n").length;
        if (!s.split("\n")[line - 1]!.includes("ds-allow")) hits.push(`${relative(ROOT, f)}:${line}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
