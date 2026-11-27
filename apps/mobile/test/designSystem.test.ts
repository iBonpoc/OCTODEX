/**
 * Design-system guard (CLAUDE.md rule 1, "Naryad"): components use tokens only.
 * Fails on raw colors, raw numbers for size/spacing/radius/font, raw font families, and lists of objects
 * as Divider-separated ListRows inside one Card, a new list on ListCard (rule 12 as of 21.11 — ListGroup / GroupRow), and the removed ItemCard.
 * A deliberate exception needs `// ds-allow: <reason>` on the same line.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { V2_VARIANTS } from "../src/features/showcase/registry";

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
/**
 * «Графит» — пилот витрины #2254, НЕ ПРАВИЛО (условие аудита 1; DS §8.0 и §25): ONE named exception — its own folder may
 * have its own Text, Pressable, TextInput and Modal (the pilot does not touch src/ui). Every tokens-only rule below still
 * holds there, through the `graphite` tokens. Roll-back = delete the folder (and this line).
 */
const PILOT_GRAPHITE = join("src", "features", "showcase", "graphite");
const inPilot = (f: string) => f.includes(PILOT_GRAPHITE);
const outsideUiAndPilot = outsideUi.filter((f) => !inPilot(f));

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
    const hits = outsideUiAndPilot.filter((f) => {
      const imp = readFileSync(f, "utf8").split("\n").find((l) => /from "react-native"/.test(l) && /\bText\b/.test(l) && !l.includes("ds-allow"));
      return !!imp;
    });
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });
  it("taps only through Press / Button / IconButton / Card (44 pt hit area), no raw Pressable / Touchable* outside src/ui", () => {
    const hits = outsideUiAndPilot.filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .some((l) => /from "react-native"/.test(l) && /\b(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/.test(l) && !l.includes("ds-allow")),
    );
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });
  // Rule 29 (founder 16.11.2026: «никаких кастомных кнопок, никаких кастомных шторок… всё по токенам и сущностям»; DS §8.0):
  // screens and modules are built from src/ui only. Counts below are the debt found on 16.11 — they may only go down;
  // fixing goes with the waves of spec 56 (Gutters draw/** — wave G). A new place is an exception in DS §8.0 first.
  const RULE29_MODAL: Record<string, number> = {
    "features/SignatureFullscreen.tsx": 1,
    "modules/gutters/draw/InputWindow.tsx": 1,
    "nav/NavMenu.tsx": 1,
  };
  const countIn = (src: string, re: RegExp) => (src.match(re) || []).length;
  it("rule 29: no own Modal outside src/ui (sheets and windows — Sheet / InputDialog of src/ui); the old ones only go down", () => {
    const now: Record<string, number> = {};
    for (const f of outsideUiAndPilot) {
      const src = readFileSync(f, "utf8");
      if (!/import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*"react-native"/.test(src)) continue;
      const n = countIn(src, /<Modal\b/g);
      if (n) now[relative(ROOT, f).split("\\").join("/")] = n;
    }
    const over = Object.entries(now).filter(([k, n]) => n > (RULE29_MODAL[k] ?? 0)).map(([k, n]) => `${k}: ${n} > ${RULE29_MODAL[k] ?? 0}`);
    const less = Object.entries(RULE29_MODAL).filter(([k, n]) => (now[k] ?? 0) < n).map(([k, n]) => `${k}: ${now[k] ?? 0} < ${n} — lower the list`);
    expect(over, `own Modal outside src/ui (rule 29, DS §8.0):\n${over.join("\n")}`).toEqual([]);
    expect(less, less.join("\n")).toEqual([]);
  });
  // a Press drawn as a button / tile / chip by the screen itself: its own background, radius or border in the tag
  const RULE29_STYLED_PRESS: Record<string, number> = {
    "features/LegalAgree.tsx": 1, // the Terms / Privacy links drawn as underlined text (#2022); spec 56 §11.1 waits for the lawyer
    "features/PhotoStrip.tsx": 2,
    "features/estimate/SwipeRow.tsx": 1,
    "features/showcase/Rows.tsx": 1,
    "modules/gutters/draw/CornerSheet.tsx": 1,
    "modules/gutters/draw/DrawScreen.tsx": 2,
    "modules/gutters/draw/FracPicker.tsx": 1,
    "modules/gutters/settings/SettingsScreen.tsx": 1,
    "nav/Fab.tsx": 2, // the header «＋» is the one header's HeaderButton now (visual-v2)
    "nav/NavMenu.tsx": 2,
    "nav/SearchEntry.tsx": 1,
    "nav/SideNav.tsx": 2,
  };
  // #2022: an own look is also a style kept in a variable (`style={hitBox}`), a link drawn in the child text (`textDecorationLine`),
  // or a button-sized Press (`accessibilityRole="button"` + `minHeight: component.button…`) — not only a background in the tag
  const OWN_LOOK = /backgroundColor|borderRadius|borderWidth|fillStyle\(/;
  const styledPress = (src: string) => {
    // what the file's own `const name = { … }` objects hold (a style kept in a variable)
    const objOf = (name: string): string => {
      const m = new RegExp(`\\b(?:const|let)\\s+${name}\\s*(?::[^=]+)?=\\s*\\{`).exec(src);
      if (!m) return "";
      let depth = 0;
      let i = m.index + m[0].length - 1;
      const start = i;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) break;
      }
      return src.slice(start, i + 1);
    };
    let n = 0;
    for (const m of src.matchAll(/<Press\b/g)) {
      let depth = 0;
      let i = m.index! + 6;
      for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === ">" && depth === 0) break;
      }
      const tag = src.slice(m.index!, i);
      // the style's own names: style={x} / style={[x, …]} → the objects they name in this file
      const styleExpr = /\bstyle=\{([\s\S]*)\}/.exec(tag)?.[1] ?? "";
      const named = [...styleExpr.matchAll(/(?:^|[\s[,(])([a-z][A-Za-z0-9]*)\b(?!\s*[.:(])/g)].map((x) => objOf(x[1]!)).join(" ");
      const look = tag + " " + named;
      // the element's own children (up to its closing tag; a self-closing Press has none)
      const selfClosing = src[i - 1] === "/";
      const end = selfClosing ? i : src.indexOf("</Press>", i);
      const children = selfClosing || end < 0 ? "" : src.slice(i, end);
      const buttonSized = /accessibilityRole=["{]+button/.test(tag) && /minHeight:\s*component\.button\./.test(look);
      if (OWN_LOOK.test(look) || /textDecorationLine:\s*["'`]underline/.test(children) || buttonSized) n++;
    }
    return n;
  };
  it("rule 29: no Press drawn as an own button outside src/ui (Button / IconButton / ListRow / OptionRow / OptionTile); the old ones only go down", () => {
    const now: Record<string, number> = {};
    for (const f of outsideUi) {
      const n = styledPress(readFileSync(f, "utf8"));
      if (n) now[relative(ROOT, f).split("\\").join("/")] = n;
    }
    const over = Object.entries(now).filter(([k, n]) => n > (RULE29_STYLED_PRESS[k] ?? 0)).map(([k, n]) => `${k}: ${n} > ${RULE29_STYLED_PRESS[k] ?? 0}`);
    const less = Object.entries(RULE29_STYLED_PRESS).filter(([k, n]) => (now[k] ?? 0) < n).map(([k, n]) => `${k}: ${now[k] ?? 0} < ${n} — lower the list`);
    expect(over, `own button-looking Press outside src/ui (rule 29, DS §8.0):\n${over.join("\n")}`).toEqual([]);
    expect(less, less.join("\n")).toEqual([]);
  });
  // #1997: inside src/ui too. A ui component is built from ui components; its own look (a Press with a background, radius
  // or border) belongs only to the component that defines that look — listed here by file, with what it defines. A new file,
  // or one more in a listed file, is an own button hidden in ui (as the old «Сохранить изменения?» of Sheet was, #1996).
  const UI_OWN_STYLED_PRESS: Record<string, number> = {
    "ui/dayStrip.tsx": 1, // DayCell — the weekday and the day pill (moved from features/PlanParts.tsx, BUILD-PLAN §1 поток В)
    "ui/controls.tsx": 7, // Button, IconButton, Toggle, Segmented, TagChip, TextField's action; + a style kept in a variable (#2022)
    "ui/filterBar.tsx": 4, // FilterBar (chip, «Фильтр», «Сброс»), FilterRow
    "ui/fracKeys.tsx": 1, // FracKeys — the key
    "ui/headerIcon.tsx": 1, // HeaderButton — the one header's circle 40 («←», «×», search, the bell, «＋», «⋯»; visual-v2 «Единая шапка»)
    "ui/listCard.tsx": 2, // ListCard, its open panel
    "ui/optionTile.tsx": 1, // OptionTile
    "ui/overlays.tsx": 2, // Menu row; LEGACY — the old unsaved question of Sheet, goes with #1996 (UnsavedAsk from Button); the toast's filled «Отменить» left with the v2 stack (#2214)
    "ui/pctUsdField.tsx": 1, // PctUsdField — the «% | $» switch
    "ui/selectField.tsx": 1, // SelectField — the row
    "ui/surfaces.tsx": 2, // Card (pressable, its `base` style — seen since #2022), ListRow
    "ui/swipeRow.tsx": 1, // SwipeRow — the action button under a swiped row (#2350, DS §8.11а)
  };
  it("rule 29 inside src/ui (#1997): an own look only in the component that defines it; the list only goes down", () => {
    const now: Record<string, number> = {};
    for (const f of code.filter((x) => x.includes(join("src", "ui")))) {
      const n = styledPress(readFileSync(f, "utf8"));
      if (n) now[relative(ROOT, f).split("\\").join("/")] = n;
    }
    const over = Object.entries(now).filter(([k, n]) => n > (UI_OWN_STYLED_PRESS[k] ?? 0)).map(([k, n]) => `${k}: ${n} > ${UI_OWN_STYLED_PRESS[k] ?? 0}`);
    const less = Object.entries(UI_OWN_STYLED_PRESS).filter(([k, n]) => (now[k] ?? 0) < n).map(([k, n]) => `${k}: ${now[k] ?? 0} < ${n} — lower the list`);
    expect(over, `an own button-looking Press inside src/ui — build it from Button / ListRow / OptionRow …, or add the component that defines the look with a reason (rule 29, DS §8.0):\n${over.join("\n")}`).toEqual([]);
    expect(less, less.join("\n")).toEqual([]);
  });
  it("the styled-Press counter sees what it must (guards the guard)", () => {
    expect(styledPress(`<Press onPress={go} style={{ backgroundColor: c.surf2, borderRadius: radius.pill }}><T>x</T></Press>`)).toBe(1);
    expect(styledPress(`<Press onPress={go} accessibilityRole="button"><T>x</T></Press>`)).toBe(0);
    expect(styledPress(`<Press style={[a, { borderWidth: 1 }]} onPress={() => { if (x) y(); }}>z</Press>`)).toBe(1);
    // #2022 С1: a button-sized Press with its style in a variable and a link look in the child text
    expect(styledPress(`const hitBox = { minHeight: component.button.hit, justifyContent: "center" };\n<Press accessibilityRole="button" style={hitBox}><T style={{ textDecorationLine: "underline" }}>x</T></Press>`)).toBe(1);
    // С2: the look kept in a variable
    expect(styledPress(`const s = { borderRadius: radius.pill };\n<Press style={s} onPress={go}><T>x</T></Press>`)).toBe(1);
    expect(styledPress(`const s = { borderRadius: radius.pill };\n<Press style={[s, { flex: 1 }]} onPress={go}><T>x</T></Press>`)).toBe(1);
    // the link look in the child alone
    expect(styledPress(`<Press onPress={go}><T style={{ textDecorationLine: "underline" }}>x</T></Press>`)).toBe(1);
    // С3: a plain Press (a row, a card from src/ui inside) stays green
    expect(styledPress(`<Press onPress={go} accessibilityRole="button"><T>x</T></Press>`)).toBe(0);
    expect(styledPress(`const pad = { padding: space[2] };\n<Press onPress={go} style={pad}><T>x</T></Press>`)).toBe(0);
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
      if (!/[hH]oldConfig\(|activateAfterLongPress/.test(src) || f.endsWith(join("ui", "haptics.ts")) || f.endsWith(join("ui", "pointer.ts"))) continue;
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
    // (#2375: the estimate's list asks its own — sortHoldConfig, a finger after `sortHoldMs` 500 — by the same kind of pointer)
    for (const f of ["SortableList.tsx", "dnd.tsx"]) expect(readFileSync(join(ROOT, "features", f), "utf8")).toMatch(/[hH]oldConfig\(/);
  });
  it("text fields only through <TextField> (no raw TextInput outside src/ui)", () => {
    const hits = outsideUiAndPilot.filter((f) =>
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

describe("design system: «Графит» stays a pilot (#2254)", () => {
  const REL = (f: string) => relative(ROOT, f).split("\\").join("/");
  it("the `graphite` tokens are read only inside the pilot folder", () => {
    const hits = code.filter((f) => !inPilot(f) && /\bgraphite(Themes)?\b[^\n]*from "@octo\/design-tokens"|from "@octo\/design-tokens"[^\n]*\bgraphite\b/.test(readFileSync(f, "utf8"))).map(REL);
    expect(hits).toEqual([]);
  });
  it("the pilot folder is opened only by the showcase (its first screen and its section screen)", () => {
    const hits = code.filter((f) => !inPilot(f) && /features\/showcase\/graphite\//.test(readFileSync(f, "utf8"))).map(REL);
    expect(hits.sort()).toEqual(["app/settings/design-system/[section].tsx", "app/settings/design-system/index.tsx"]);
  });
  it("Jost is loaded only by the pilot (the app's start is not touched)", () => {
    const hits = code.filter((f) => !inPilot(f) && /@expo-google-fonts\/jost/.test(readFileSync(f, "utf8"))).map(REL);
    expect(hits).toEqual([]);
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

// #2350 (SCREEN-SPECS.md): every variant of the last v2 pass is written in DS §12.14 and drawn by the showcase
describe("design system: the v2 variants are written and shown (DS §12.14)", () => {
  const ds = readFileSync(join(__dirname, "..", "..", "..", "design", "naryad-ds", "DESIGN-SYSTEM.md"), "utf8");
  const sec = ds.slice(ds.indexOf("### 12.14."), ds.indexOf("### 12.15."));
  it("DS §12.14 exists and comes before §12.15", () => expect(sec.length).toBeGreaterThan(1000));
  it.each(V2_VARIANTS.map((v) => [`${v.part} ${v.prop}`, v] as const))("%s", (_, v) => {
    const src = readFileSync(join(ROOT, v.src), "utf8");
    expect(new RegExp(`\\b${v.part}\\b`).test(src), `${v.part} is not in ${v.src} any more — update V2_VARIANTS`).toBe(true);
    expect(new RegExp(`\\b${v.prop}\\b`).test(src), `${v.part}: prop «${v.prop}» is not in ${v.src} any more`).toBe(true);
    expect(sec.includes(v.part) && new RegExp(`\\b${v.prop}\\b`).test(sec.slice(sec.indexOf(v.part))), `write ${v.part} «${v.prop}» in DESIGN-SYSTEM.md §12.14`).toBe(true);
    if (v.shown) expect(readFileSync(join(ROOT, "features", "showcase", v.shown), "utf8").includes(v.use), `show ${v.part} ${v.use.trim()} in features/showcase/${v.shown}`).toBe(true);
    else expect(v.why ?? "", "a variant not in the showcase says where it is seen").not.toBe("");
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

  // Rule 12 as of 21.11 (founder, #2350): a list is grouped rows in one card — ListGroup / GroupRow (ui/groupedList.tsx),
  // not a card per object. The lists still on ListCard move over in waves; this list may only shrink — a new file with
  // <ListCard is red, a moved one must be struck off here.
  it("lists are ListGroup/GroupRow: ListCard only in the files not moved yet (the list only shrinks)", () => {
    const LISTCARD_LEFT = new Set([
      "app/client/import.tsx", "app/client/imports.tsx", "app/company/checklists.tsx",
      "app/company/intake.tsx", "app/estimate/templates.tsx", "app/messages/[key].tsx",
      "app/property/[id].tsx", "app/purchase-orders/index.tsx", "app/reports/[id].tsx",
      "app/suppliers/[id].tsx", "app/suppliers/index.tsx", "app/team.tsx",
      "features/AttentionCards.tsx", "features/JobOrdersBlock.tsx",
      "features/ServiceCategoryPicker.tsx", "features/client/ClientDuplicates.tsx", "features/client/PropertySections.tsx",
      "features/comms/MessagesScreen.tsx", "features/invoice/VoidInvoice.tsx",
      "features/lead/LeadParts.tsx", "features/listCards.tsx", "features/notices.tsx", "features/payments/AdvancesBlock.tsx",
      "modules/gutters/list/StartScreen.tsx",
      "modules/gutters/prices/PricesScreen.tsx",
    ]);
    const using = outsideUi
      .filter((f) => /<ListCard\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f).split("\\").join("/"))
      .filter((f) => !f.startsWith("features/showcase/"));
    const added = using.filter((f) => !LISTCARD_LEFT.has(f));
    expect(added, `a new list on ListCard — use ListGroup/GroupRow (rule 12):\n${added.join("\n")}`).toEqual([]);
    const moved = [...LISTCARD_LEFT].filter((f) => !using.includes(f));
    expect(moved, `moved to ListGroup — strike it off LISTCARD_LEFT:\n${moved.join("\n")}`).toEqual([]);
  });
});

describe("design system: the tape's yellow (founder 09.11, #674 — an exception to rule 2)", () => {
  it("`tape.*` only in the Gutters tape measure", () => {
    // the red needle too (#2412, the 5th exception of rule 2): only the tape draws it
    const hits = code.filter((f) => /\btape\.(markText|markFill|needle)\b/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
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
    "app/company/checklist/[id].tsx": { n: 1, why: "пункт чек-листа — объект списка, карточка (правило 12)" },
    "features/client/ClientSheets.tsx": { n: 1, why: "каждый дополнительный человек клиента — объект списка, карточка (правило 12)" },
    "app/purchase-order/[id].tsx": { n: 1, why: "карточка объекта (шаблон «К»), не форма" },
    "features/JobLinesBlock.tsx": { n: 1, why: "блок карточки работы (налог), не форма" },
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
    "features/JobLinesBlock.tsx": { n: 1, why: "«Сохранить» ставку налога" },
    "features/VisitChecklist.tsx": { n: 2, why: "«Добавить» пункт чек-листа" },
    "features/client/ClientSheets.tsx": { n: 1, why: "«Добавить» метку" },
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
  // EstimateCard's «Отправить» sheet: one main button (sends at once, MAP §13 п.1) and two in a row under it (#2218) — the list is empty
  const ALLOWED: Record<string, { n: number; why: string }> = {};
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

/**
 * Ш III-1 (спека 63 §3а, #2292): «ноль значений по месту» for what the eye sees in motion — a bezier curve, the duration
 * of an animation, a layer. The scan is the codemod's own (scripts/codemod/motionLiterals.cjs, TypeScript API): the guard and
 * the tool cannot disagree. `DEBT` is the places an open PR holds right now; each batch shortens it, a new place is red.
 */
describe("design system: no curve, animation time or layer written in place (Ш III-1)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scan } = require("../../../scripts/codemod/motionLiterals.cjs") as { scan: () => { file: string; line: number; kind: string; text: string; hasToken: boolean }[] };
  const DEBT = new Set([
    "src/ui/overlays.tsx zIndex 100", // PR 1996 / 1975 / 1964 hold the file; the toast layer has no token yet (z.toast is 8, the toast is above the modal)
    "src/ui/surfaces.tsx zIndex 10", // PR 2141 holds the file
    "src/ui/surfaces.tsx zIndex 0",
  ]);
  const left = () => scan().map((h) => ({ ...h, key: `${h.file.split("\\").join("/")} ${h.kind} ${h.text}` }));
  it("every literal that has a token is already written as the token", () => {
    expect(left().filter((h) => h.hasToken && !DEBT.has(h.key)).map((h) => `${h.file}:${h.line} ${h.kind} ${h.text}`)).toEqual([]);
  });
  it("a literal without a token needs its token first (or a line of DEBT, with the PR that holds the file)", () => {
    expect(left().filter((h) => !h.hasToken && !DEBT.has(h.key)).map((h) => `${h.file}:${h.line} ${h.kind} ${h.text}`)).toEqual([]);
  });
  it("DEBT has no line that is already paid", () => {
    const keys = new Set(left().map((h) => h.key));
    expect([...DEBT].filter((k) => !keys.has(k))).toEqual([]);
  });
});

/**
 * DS §7.5 (founder 27.11.2026, #3064, #3065): no column of buttons. In one JSX container (a card, a sheet, a block) at most one
 * main and one second button: ≥ 3 `Button`s there is red — the sections are GroupRows «›» of a ListGroup, the rare actions «⋯».
 * Counted as a button: `<Button>`, a `<View>`/fragment around one, `cond ? <Button/> : …`, `cond && <Button/>`; `<ButtonPair>` = 2;
 * `.map(…)` returning a button = 3 (a column of them). The old places are listed by file with their number of such containers;
 * the list only goes down (rule 29) — the waves of #3065 take them away.
 */
describe("design system: no column of buttons (DS §7.5, #3065)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ts = require("typescript") as typeof import("typescript");
  const BUTTON_COLUMNS_LEFT: Record<string, number> = {
    "app/estimate/new.tsx": 1, // stays: founder 23.11 (audit MAP wave 1 п.6, picture n09) — the four ways to add, two pairs over the lines
    "app/purchase-order/[id].tsx": 1,
    "features/PhotoStrip.tsx": 1,
    "features/RelatedBlock.tsx": 1,
    "features/VisitChecklist.tsx": 1,
    "features/VisitForm.tsx": 2,
    "features/lead/LeadSheets.tsx": 3,
    "features/showcase/Buttons.tsx": 2, // stays: the «wrong» example of §7.5 on purpose; the two ButtonPair samples (row | column) side by side
    "features/showcase/ProtoV2.tsx": 1,
    "modules/ModulePlaces.tsx": 2,
    "modules/gutters/draw/AttrPanel.tsx": 1,
    "modules/gutters/settings/SettingsScreen.tsx": 1,
    "modules/gutters/view/ViewScreen.tsx": 1,
    "ui/confirmDialog.tsx": 2, // stays: a dialog may have three answers in a column (HIG Alerts; «Сохранить изменения?», DS §7.5)
    "ui/dateField.tsx": 1, // the quick days «Сегодня · Завтра · Без даты» are a choice, not actions — goes when they become ChoiceChips
  };
  type N = import("typescript").Node;
  const tagOf = (n: N) => (ts.isJsxElement(n) ? n.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(n) ? n.tagName.getText() : null);
  const kids = (n: N) => (ts.isJsxElement(n) || ts.isJsxFragment(n) ? n.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim())) : []);
  const btn = (n: N | undefined): number => {
    if (!n) return 0;
    if (ts.isParenthesizedExpression(n)) return btn(n.expression);
    const t = tagOf(n);
    if (t === "Button") return 1;
    if (t === "ButtonPair") return 2;
    if (t === "View" || ts.isJsxFragment(n)) { const k = kids(n); return k.length === 1 ? btn(k[0]) : 0; }
    if (ts.isJsxExpression(n)) return btn(n.expression);
    if (ts.isConditionalExpression(n)) return Math.max(btn(n.whenTrue), btn(n.whenFalse));
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return btn(n.right);
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "map") {
      const fn = n.arguments[0];
      if (fn && ts.isArrowFunction(fn)) {
        let body: N | undefined = fn.body;
        if (ts.isBlock(body)) body = body.statements.find(ts.isReturnStatement)?.expression;
        return btn(body) ? 3 : 0;
      }
    }
    return 0;
  };
  const columns = (file: string, src: string) => {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const at: number[] = [];
    const visit = (n: N) => {
      if ((ts.isJsxElement(n) || ts.isJsxFragment(n)) && kids(n).reduce((s, x) => s + btn(x), 0) >= 3) at.push(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return at;
  };
  it("no new container with ≥ 3 buttons; the old ones only go down", () => {
    const now: Record<string, number[]> = {};
    for (const f of code.filter((x) => x.endsWith(".tsx") && !x.includes(join("showcase", "graphite")))) {
      const src = readFileSync(f, "utf8");
      if (!/<Button/.test(src)) continue;
      const at = columns(f, src);
      if (at.length) now[relative(ROOT, f).split("\\").join("/")] = at;
    }
    const over = Object.entries(now).filter(([k, a]) => a.length > (BUTTON_COLUMNS_LEFT[k] ?? 0)).map(([k, a]) => `${k}: lines ${a.join(", ")} (${a.length} > ${BUTTON_COLUMNS_LEFT[k] ?? 0})`);
    const less = Object.entries(BUTTON_COLUMNS_LEFT).filter(([k, n]) => (now[k]?.length ?? 0) < n).map(([k, n]) => `${k}: ${now[k]?.length ?? 0} < ${n} — lower the list`);
    expect(over, `a column of buttons (DS §7.5): sections → GroupRow «›» in a ListGroup, rare → «⋯», at most one main + one second:\n${over.join("\n")}`).toEqual([]);
    expect(less, less.join("\n")).toEqual([]);
  });
  it("the counter sees what it must (guards the guard)", () => {
    const B = '<Button label="a" onPress={f} />';
    expect(columns("a.tsx", `const x = <View>${B}${B}${B}</View>;`)).toHaveLength(1);
    expect(columns("a.tsx", `const x = <Card><View testID="w">${B}</View>{ok ? ${B} : null}{on && ${B}}</Card>;`)).toHaveLength(1);
    expect(columns("a.tsx", `const x = <View>{xs.map((a) => <View key={a}>${B}</View>)}</View>;`)).toHaveLength(1);
    expect(columns("a.tsx", `const x = <View><ButtonPair main={m} second={s} />${B}</View>;`)).toHaveLength(1);
    expect(columns("a.tsx", `const x = <View>${B}${B}<ListGroup><GroupRow title="a" /></ListGroup></View>;`)).toHaveLength(0);
    expect(columns("a.tsx", `const x = <View><View>${B}<T>a</T></View>${B}</View>;`)).toHaveLength(0);
  });
});
