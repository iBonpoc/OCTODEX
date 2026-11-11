/**
 * Design-system guard (CLAUDE.md rule 1, "Naryad"): components use tokens only.
 * Fails on raw colors, raw numbers for size/spacing/radius/font, raw font families, and lists of objects
 * rendered as rows inside one card (rule 12 — ListCard in CardGrid / CardList), and the removed ItemCard.
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
  { name: "raw size prop (icon / avatar / control)", re: /\b(s|size|visibleHeight)=\{-?\d/ },
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
  it("vibration only through ui/haptics.ts (no expo-haptics anywhere else; the «Вибрация» switch must work, DS §15.6)", () => {
    const hits = code.filter((f) => !f.endsWith(join("ui", "haptics.ts")) && /from "expo-haptics"/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    // ds-allow: visit/[id].tsx is held by #868 — moves to haptics in a small follow-up PR after it lands
    expect(hits.filter((f) => f !== join("app", "visit", "[id].tsx"))).toEqual([]);
  });
  it("dragging gives haptics: lift = light, drop into a zone = medium (DS §15.6, #1088)", () => {
    const src = readFileSync(join(ROOT, "features", "dnd.tsx"), "utf8");
    expect(src).toMatch(/onActivate:[\s\S]*?haptics\.light\(\)/);
    expect(src).toMatch(/onDeactivate:[\s\S]*?haptics\.medium\(\)/);
  });
  it("text fields only through <TextField> (no raw TextInput outside src/ui)", () => {
    const hits = outsideUi.filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .some((l) => /from "react-native"/.test(l) && /\bTextInput\b/.test(l) && !l.includes("ds-allow")),
    );
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });
  it("every <TextField> says what it holds (type= → keyboard, autofill, formatting)", () => {
    const hits: string[] = [];
    for (const f of code.filter((x) => x.endsWith(".tsx"))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<TextField\b[\s\S]*?\/>/g)) {
        if (!/\stype=/.test(m[0])) hits.push(`${relative(ROOT, f)}:${src.slice(0, m.index).split("\n").length}  ${m[0].slice(0, 90)}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
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

describe("design system: the showcase covers everything (#1093, Настройки → Дизайн-система)", () => {
  const reg = readFileSync(join(ROOT, "features", "showcase", "registry.ts"), "utf8");
  const listed = (name: string) => reg.includes(`"${name}"`);
  it("every component exported from src/ui/*.tsx is in a showcase section, or is on the pending / not-shown list with a reason", () => {
    const missing: string[] = [];
    for (const f of readdirSync(join(ROOT, "ui")).filter((x) => x.endsWith(".tsx"))) {
      for (const m of readFileSync(join(ROOT, "ui", f), "utf8").matchAll(/^export (?:function|const) ([A-Z][a-z][A-Za-z0-9]*)\b/gm)) if (!listed(m[1]!)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing, "add the component to a section of features/showcase/registry.ts and show it (same PR)").toEqual([]);
  });
  it("every group of `tokens` is drawn by a showcase section", async () => {
    const { tokens } = await import("@octo/design-tokens");
    const missing = Object.keys(tokens).filter((g) => !listed(g));
    expect(missing, "add the token group to a section of features/showcase/registry.ts").toEqual([]);
  });
  it("every section points to a heading that exists in DESIGN-SYSTEM.md", () => {
    const ds = readFileSync(join(__dirname, "..", "..", "..", "design", "naryad-ds", "DESIGN-SYSTEM.md"), "utf8");
    const bad: string[] = [];
    for (const m of reg.matchAll(/ds: "§(\d+(?:\.\d+)?)"/g)) {
      const n = m[1]!;
      if (!new RegExp(`^#{2,3} ${n.replace(".", "\\.")}\\.`, "m").test(ds)) bad.push(`§${n}`);
    }
    expect(bad).toEqual([]);
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

  // 06 «Серия B» (B4): the old one-row ItemCard is gone — a list of objects is ListCard (compact for related objects),
  // a single hint is Card + ListRow. Nothing in src may bring it back (definition, import or use).
  it("no ItemCard anywhere in src (lists → ListCard, single hints → Card + ListRow)", () => {
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/\bItemCard\b/.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("design system: the tape's yellow (founder 09.11, #674 — an exception to rule 2)", () => {
  it("`tape.*` only in the Gutters tape measure", () => {
    const hits = code.filter((f) => /\btape\.mark(Text|Fill)\b/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    expect(hits).toEqual([join("modules", "gutters", "draw", "Tape.tsx")]);
  });
});
