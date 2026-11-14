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

/** #816 (C-08): the general rule lets a bare 0 and 1 through; the module's screens carry no such border — `component.hairline` */
describe("design system: the module's hairline is a token", () => {
  it("no «borderWidth: 1» (nor a 1 in another border width) in modules/gutters", () => {
    const hits: string[] = [];
    for (const f of code.filter((x) => x.includes(join("src", "modules", "gutters")))) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((l, i) => {
          if (/\bborder(Top|Bottom|Left|Right)?Width:\s*1\b(?![.\w])/.test(l)) hits.push(`${relative(ROOT, f)}:${i + 1}`);
        });
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

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
    expect(hits).toEqual([]);
  });
  it("a sheet is not cut away when its data goes (#1163): no always-open sheet or wrapper, no `if (!x) return null` before a sheet, no key that flips at the close", () => {
    const bare: string[] = [];
    const early: string[] = [];
    const flipKey: string[] = [];
    const at = (src: string, i: number) => src.slice(0, i).split("\n").length;
    for (const f of code) {
      const raw = readFileSync(f, "utf8");
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, (c) => (c.includes("ds-allow") ? c : ""));
      const rel = relative(ROOT, f);
      if (rel.endsWith(join("ui", "overlays.tsx"))) continue; // the Sheet itself
      // every capitalised element's opening tag, to its own `>` (braces counted: a `>` inside {…} is not the end of the tag):
      // a sheet — or a wrapper that holds one — given `visible` with no value or `visible={true}` is mounted by its owner's
      // condition, and the owner's unmount is a cut
      for (const m of src.matchAll(/<[A-Z]\w*/g)) {
        let depth = 0;
        let i = m.index! + m[0].length;
        for (; i < src.length; i++) {
          const c = src[i];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          else if (c === ">" && depth === 0 && src[i - 1] !== "=") break;
        }
        const tag = src.slice(m.index!, i + 1);
        const flat = tag.replace(/\{[^{}]*\}/g, (b) => (/^\{\s*true\s*\}$/.test(b) ? "{TRUE}" : "{}"));
        if (!(/\bvisible(\s|\/|>)/.test(flat) || /\bvisible=\{TRUE\}/.test(flat))) continue;
        const line = raw.split("\n")[at(src, m.index!) - 1] ?? "";
        if (line.includes("ds-allow")) continue;
        bare.push(`${rel}:${at(src, m.index!)}`);
      }
      // `if (!x) return null;` and then a sheet (a body named …Sheet…) — the sheet is gone with its data (not the held value of `useHeldSheet`: that one stays until the sheet has left)
      for (const m of src.matchAll(/if \(!(?!h\.value\b|\w*[Hh]eld\.value\b)[\w.?]+\)\s*return null;\s*\n(?:\s*\/\/[^\n]*\n)*\s*return <(?:\w*Sheet\w*|Sheet)\b/g)) early.push(`${rel}:${at(src, m.index!)}`);
      // a key that flips with a sheet's open state remounts it at the close — it is cut, not led out
      for (const m of src.matchAll(/key=\{`[^`]*\$\{\s*(?:!!|String\(|[^}?]*===|\w*(?:[oO]pen|[vV]isible|[sS]heet)\w*\s*\?(?!\?))[^}]*\}[^`]*`\}/g)) flipKey.push(`${rel}:${at(src, m.index!)}`);
    }
    expect(bare).toEqual([]);
    expect(early).toEqual([]);
    expect(flipKey).toEqual([]);
  });
  it("the Gutters toolbar's grip is a drag: lift = light, set down on another edge = medium (DS §15.6, #1159)", () => {
    const src = readFileSync(join(ROOT, "modules", "gutters", "draw", "DrawScreen.tsx"), "utf8");
    const grip = src.slice(src.indexOf("const gripPan = usePanGesture"), src.indexOf("const pickPlace"));
    expect(grip).toMatch(/onActivate:[\s\S]*?haptics\.light\(\)/);
    // not on every move, and nothing when it stays at its edge
    expect(grip.slice(grip.indexOf("onUpdate:"), grip.indexOf("onFinalize:"))).not.toMatch(/haptics\./);
    expect(grip).toMatch(/dropHaptic\(place, p\)/);
  });
  it("the canvas's own pan and pinch (CanvasView) are navigation of the view, not dragging a thing: no haptics, no Draggable (the exception is written here)", () => {
    const src = readFileSync(join(ROOT, "modules", "gutters", "canvas", "CanvasView.tsx"), "utf8");
    expect(src).not.toMatch(/haptics/);
    expect(src).not.toMatch(/features\/dnd|Draggable|DndProvider/);
  });
  it("dragging gives haptics: lift = light, drop into a zone = medium (DS §15.6, #1088)", () => {
    const src = readFileSync(join(ROOT, "features", "dnd.tsx"), "utf8");
    expect(src).toMatch(/onActivate:[\s\S]*?haptics\.light\(\)/);
    expect(src).toMatch(/onDeactivate:[\s\S]*?haptics\.medium\(\)/);
  });
  it("every drag that is held (activateAfterLongPress / handle) has its three feelings: light on lift, selection on a new place, medium on drop; none when nothing moved (founder 12.11)", () => {
    const hits: string[] = [];
    for (const f of code) {
      const src = readFileSync(f, "utf8");
      if (!/holdConfig\(|activateAfterLongPress/.test(src) || f.endsWith(join("ui", "haptics.ts")) || f.endsWith(join("ui", "pointer.ts"))) continue;
      // «medium» may come through feelOf(result) — the drop's feel decided by what it came to (sortable.ts)
      for (const k of ["light", "selection", "medium"]) if (!new RegExp(k === "medium" ? "haptics\\.medium\\(|feelOf\\(" : `haptics\\.${k}\\(`).test(src)) hits.push(`${relative(ROOT, f)}: haptics.${k}`);
    }
    expect(hits, "a drag without its haptics (DS §15.6): lift = light, new place = selection, drop = medium").toEqual([]);
    const sortable = readFileSync(join(ROOT, "features", "SortableList.tsx"), "utf8");
    // let go where it was taken: no drop, no «medium»
    expect(sortable).toMatch(/r\.p !== fromSlot\.current/);
    // the buzz follows what the drop came to (feelOf, tested in sortable.test): it is asked after the result, never before
    expect(sortable).toMatch(/const res: DropResult = d \? drop\(d\) : "same";[\s\S]*?feelOf\(res\)/);
    expect(sortable.slice(0, sortable.indexOf("const res: DropResult"))).not.toMatch(/haptics\.(medium|warning)/);
    // one finger: only the held row's own gesture writes its place (a second finger would make the row jump); a refused begin sets nothing
    expect(sortable).toMatch(/const w = dragWrite\(activeSV\.value, k,/);
    expect(sortable).toMatch(/if \(!canBegin\(activeKey\.current\)\) return;[\s\S]*?activeSV\.value = key;/);
    // a row that goes while it is held lets the page scroll again (lock(false)) — on its own and when the list goes
    expect(sortable).toMatch(/heldGone\(activeKey\.current, keys\)\) abort\(\)/);
    expect(sortable).toMatch(/useEffect\(\(\) => \(\) => abortRef\.current\(\), \[\]\)/);
    // the shadow is a token
    expect(sortable).toMatch(/component\.liftShadow/);
    // the kind of pointer, not the width, decides how a body starts a drag
    for (const f of ["SortableList.tsx", "dnd.tsx"]) expect(readFileSync(join(ROOT, "features", f), "utf8")).toMatch(/holdConfig\(/);
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

  // DS §3.1 п.2, rule 2 (#1386): a status colour is always an icon and a word — a warn / bad / ok / info text is a
  // <StatusNote> (src/ui/statusNote.tsx), or has its icon right before it (3 lines up), or says ds-allow. All places
  // are moved (#1386 done): PENDING stays empty — a new one is a mistake, not a debt.
  it("a status colour on text has its icon (StatusNote), not the colour alone", () => {
    const PENDING: Record<string, number> = {};
    const found: Record<string, string[]> = {};
    for (const f of outsideUi) {
      const s = readFileSync(f, "utf8");
      const lines = s.split("\n");
      for (const m of s.matchAll(/<T\b[^<>]*?\btone="(warn|bad|ok|info)"/g)) {
        const n = s.slice(0, m.index).split("\n").length;
        if (/\bIcon\b|statusIcon|ds-allow/.test(lines.slice(Math.max(0, n - 4), n).join("\n"))) continue;
        (found[relative(ROOT, f)] ??= []).push(`${relative(ROOT, f)}:${n}`);
      }
    }
    const bad = Object.entries(found).filter(([k, v]) => v.length > (PENDING[k] ?? 0)).flatMap(([, v]) => v);
    expect(bad, `colour without its icon — use <StatusNote tone=…>:\n${bad.join("\n")}`).toEqual([]);
    const stale = Object.entries(PENDING).filter(([k, n]) => (found[k]?.length ?? 0) < n).map(([k, n]) => `${k}: ${found[k]?.length ?? 0} < ${n}`);
    expect(stale, `fixed — lower its number in PENDING:\n${stale.join("\n")}`).toEqual([]);
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

/** founder 12.11.2026 (#1166, «Добавить фото»): in a tile where an icon stands over a text, the text is centred too — else a two-line
 *  caption sits at the left under a centred icon. A tile = a column whose items are centred (alignItems center), with an icon and a text in it. */
describe("design system: a text under a centred icon is centred", () => {
  it("every <T> in such a tile has `center` (or is one line, or says ds-allow)", () => {
    const hits: string[] = [];
    for (const f of code) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/style=\{\{([^{}]*)\}\}\s*>/g)) {
        const st = m[1] ?? "";
        // any column whose items are centred (a tile, a ToolCell): an icon over a text — the text is centred too
        if (!st.includes('alignItems: "center"') || st.includes('flexDirection: "row"')) continue;
        // the direct children of the tile: depth 0 until the tile closes (a nested View is one child — an icon in a circle counts)
        const rest = src.slice((m.index ?? 0) + m[0].length);
        let depth = 0;
        let hasPicture = false;
        const texts: string[] = [];
        for (const tk of rest.matchAll(/<(\/?)([A-Za-z]*View|Press|Icon|T)\b([^>]*?)(\/?)>/g)) {
          const [, close, name, attrs, selfClose] = tk;
          if (name === "T") {
            if (depth === 0 && !close) texts.push(attrs ?? "");
            continue;
          }
          if (close) { depth--; if (depth < 0) break; continue; }
          if (depth <= 1 && name === "Icon") hasPicture = true;
          if (name !== "Icon" && !selfClose) depth++;
        }
        if (!hasPicture) continue;
        for (const a of texts) {
          if (/\bcenter\b/.test(a) || /numberOfLines=\{1\}/.test(a) || a.includes("ds-allow")) continue;
          hits.push(`${relative(ROOT, f)}: <T${a.slice(0, 50)}>`);
        }
      }
    }
    expect([...new Set(hits)], "add `center` to the text (DS §18, #1166)").toEqual([]);
  });
});

/**
 * DS §11 п.17–18 (founder 14.11, #1411): a form's fields lie straight on the background — no card around them; the field's helper
 * action («Вставить», «Очистить», «Показать») is an icon inside the field (`TextField action`), not a worded button beside it.
 */
describe("design system: a form's fields have no plate (#1411)", () => {
  /** <Card> blocks that hold a <TextField> (lexically), by the line the card opens on */
  const cardsWithFields = (src: string): number[] => {
    const re = /<Card\b|<\/Card>|<TextField\b/g;
    const stack: number[] = [];
    const hits = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m[0] === "<Card") {
        const close = src.indexOf(">", m.index);
        if (src[close - 1] === "/") continue;
        stack.push(src.slice(0, m.index).split("\n").length);
      } else if (m[0] === "</Card>") stack.pop();
      else if (stack.length) hits.add(stack[stack.length - 1]);
    }
    return [...hits];
  };
  /**
   * Where a card still holds a field, and why. The count is exact: a new card with a field fails, and so does one taken away
   * without its line here (the list only shrinks).
   */
  const ALLOWED: Record<string, { n: number; why: string }> = {
    "app/auth/company.tsx": { n: 1, why: "вход — особый шаблон (§12.3), #1455" },
    "app/auth/sign-in.tsx": { n: 1, why: "вход — особый шаблон (§12.3), #1455" },
    "app/auth/trade.tsx": { n: 1, why: "вход — особый шаблон (§12.3), #1455" },
    "app/f/[token].tsx": { n: 1, why: "публичная форма заявки клиента — особый шаблон (§12.3), #1455" },
    "app/company/[section].tsx": { n: 8, why: "разделы настроек — шаблон «Настройки», #1455" },
    "app/company/checklist/[id].tsx": { n: 1, why: "пункт чек-листа — объект списка, карточка (правило 12)" },
    "features/client/ClientSheets.tsx": { n: 1, why: "каждый дополнительный человек клиента — объект списка, карточка (правило 12)" },
    "app/purchase-order/[id].tsx": { n: 1, why: "карточка объекта (шаблон «К»), не форма" },
    "features/JobLinesBlock.tsx": { n: 1, why: "блок карточки работы (налог), не форма" },
    "features/NotesBlock.tsx": { n: 1, why: "блок заметок карточки объекта, не форма" },
    "features/VisitChecklist.tsx": { n: 2, why: "чек-лист выезда — блок карточки, не форма" },
  };
  it("no <TextField> inside a <Card> (outside the written exceptions)", () => {
    const bad: string[] = [];
    for (const f of code.filter((x) => x.endsWith(".tsx") && !x.includes(join("src", "ui")) && !x.includes(join("src", "modules")))) {
      const rel = relative(ROOT, f).split("\\").join("/");
      const n = cardsWithFields(readFileSync(f, "utf8")).length;
      const allowed = ALLOWED[rel]?.n ?? 0;
      if (n !== allowed) bad.push(`${rel}: ${n} card(s) with a field, the list says ${allowed}`);
    }
    expect(bad, "DS §11 п.17: a form's fields lie straight on the background (`FieldGroup`), no `Card` around them").toEqual([]);
  });
  /**
   * Rows of a field and a worded button that SENDS what is typed («Добавить», «Сохранить») — not a helper of the field, so they stay;
   * exact counts by file (a new row with a button beside a field fails: a helper goes into the field as an icon).
   */
  const SUBMIT_ROWS: Record<string, { n: number; why: string }> = {
    "app/job/[id].tsx": { n: 1, why: "«Добавить» заметку — отправляет набранное" },
    "features/JobLinesBlock.tsx": { n: 1, why: "«Сохранить» ставку налога" },
    "features/ServiceCategoryPicker.tsx": { n: 1, why: "«Добавить» свою категорию" },
    "features/VisitChecklist.tsx": { n: 2, why: "«Добавить» пункт чек-листа" },
    "features/client/ClientSheets.tsx": { n: 2, why: "«Удалить» человека; «Добавить» метку" },
  };
  it("a field's helper action is an icon inside it: no worded button in one row with a field", () => {
    const bad: string[] = [];
    for (const f of code.filter((x) => x.endsWith(".tsx") && !x.includes(join("src", "ui")) && !x.includes(join("src", "modules")))) {
      const src = readFileSync(f, "utf8");
      const rel = relative(ROOT, f).split("\\").join("/");
      const rows: string[] = [];
      // each <RowView> block (to its own closing tag) that holds a <TextField> and a <Button label=…>
      const re = /<RowView\b|<\/RowView>/g;
      const open: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (m[0] === "<RowView") {
          const close = src.indexOf(">", m.index);
          if (src[close - 1] !== "/") open.push(m.index);
          continue;
        }
        const start = open.pop();
        if (start === undefined) continue;
        const block = src.slice(start, m.index);
        if (/<TextField\b/.test(block) && /<Button\b[^>]*\blabel=/.test(block)) rows.push(`${rel}:${src.slice(0, start).split("\n").length}`);
      }
      if (rows.length !== (SUBMIT_ROWS[rel]?.n ?? 0)) bad.push(...rows, `${rel}: ${rows.length} row(s), the list says ${SUBMIT_ROWS[rel]?.n ?? 0}`);
    }
    expect(bad, "DS §11 п.18: `TextField action={{ icon, label, onPress }}`, not a button with words beside the field").toEqual([]);
  });
});

/**
 * #1412 (founder 14.11 on the estimate: «Что это вообще за уродливая вёрстка?… чтобы такого не было больше»; DS §7.3, §8.9, Б4):
 * a record's card has one main button (its next step) and «⋯» with the rest — no row of three and more pill buttons.
 */
describe("design system: a record's card has no row of pill buttons (#1412)", () => {
  /** rows (`RowView`, to its own closing tag) with 3+ `<Button`, by the line the row opens on */
  const pillRows = (src: string): number[] => {
    const re = /<RowView\b|<\/RowView>/g;
    const open: number[] = [];
    const rows: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m[0] === "<RowView") {
        const close = src.indexOf(">", m.index);
        if (src[close - 1] !== "/") open.push(m.index);
        continue;
      }
      const start = open.pop();
      if (start === undefined) continue;
      if ((src.slice(start, m.index).match(/<Button\b/g) ?? []).length >= 3) rows.push(src.slice(0, start).split("\n").length);
    }
    return rows;
  };
  /** cards still to move (#1474) and rows that are not a card's actions — exact counts, the list only shrinks */
  const ALLOWED: Record<string, { n: number; why: string }> = {
    "app/job/[id].tsx": { n: 2, why: "карточка работы — #1474" },
    "app/receipt/[id].tsx": { n: 1, why: "квитанция — #1474" },
    "app/property/[id].tsx": { n: 1, why: "карточка объекта — #1474" },
    "features/invoice/InvoiceCard.tsx": { n: 1, why: "карточка счёта — #1474" },
    "features/EstimateCard.tsx": { n: 1, why: "шторка «Отправить»: три способа отправки — выбор внутри начатого действия, не действия карточки" },
  };
  it("no row of 3+ buttons on a record's card (src/app/**/[id].tsx, features/**/*Card.tsx)", () => {
    const bad: string[] = [];
    for (const f of code.filter((x) => /\[id\]\.tsx$|Card\.tsx$/.test(x) && !x.includes(join("src", "ui")) && !x.includes(join("src", "modules")) && !x.includes(join("features", "estimate", "")))) {
      const rel = relative(ROOT, f).split("\\").join("/");
      const n = pillRows(readFileSync(f, "utf8")).length;
      const allowed = ALLOWED[rel]?.n ?? 0;
      if (n !== allowed) bad.push(`${rel}: ${n} row(s) of pill buttons, the list says ${allowed}`);
    }
    expect(bad, "one main button (ActionBar / the top of the content from 820) and «⋯» with the rest (Б4)").toEqual([]);
  });
});
