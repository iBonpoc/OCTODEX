/**
 * Дизайн-система GoRix (#2893, этап 2 плана): `index.ts` — единственный источник значений. Отсюда строятся
 * `design/gorix/tokens.css` (сайт, PDF, веб-страницы «как будет») и `design/gorix/tokens.md` (таблицы для документа —
 * в самом документе чисел нет, только имена токенов). Руками эти два файла не правят: `test/generated.test.ts`
 * краснеет, если они разошлись с `index.ts`; перестроить — `npm run gen -w @octo/design-tokens`.
 */
import { breakpoint, component, font, layout, motion, radius, rhythm, size, space, spaceHalf, themes, z, type ThemeName } from "./index";

type Leaf = string | number;
type Row = [path: string, value: Leaf];

/** every string/number leaf of a token object as «a.b.c» → value; arrays by index; booleans and functions skipped */
export function flatten(obj: unknown, prefix = ""): Row[] {
  if (typeof obj === "string" || typeof obj === "number") return [[prefix, obj]];
  if (obj === null || typeof obj !== "object") return [];
  const out: Row[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out.push(...flatten(v, prefix ? `${prefix}.${k}` : k));
  return out;
}

/** the groups of the shared (theme-free) tokens, in the order of the document's «Основа» */
export const GROUPS: { name: string; title: string; value: unknown }[] = [
  { name: "font", title: "Текст", value: font },
  { name: "space", title: "Отступы", value: space },
  { name: "spaceHalf", title: "Полушаги отступов", value: spaceHalf },
  { name: "rhythm", title: "Ритм экрана", value: rhythm },
  { name: "radius", title: "Скругления", value: radius },
  { name: "size", title: "Размеры", value: size },
  { name: "motion", title: "Движение", value: motion },
  { name: "z", title: "Слои", value: z },
  { name: "breakpoint", title: "Ширины", value: breakpoint },
  { name: "layout", title: "Раскладка", value: layout },
  { name: "component", title: "Детали", value: component },
];

const cssName = (path: string) => "--" + path.replace(/\./g, "-").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
/**
 * The unit of a number in css, by the token's path (code review 26.11: a regex over all names gave «0.55px» opacities and
 * unit-less durations). Only what is surely a length gets px, surely a time gets ms; everything else stays a plain number
 * (a ratio, a count, a weight, a scroll threshold whose meaning the name does not tell) — read it in tokens.md and index.ts.
 */
const PX_GROUPS = /^(space|spaceHalf|rhythm|radius|breakpoint)\./;
const LENGTH_END = /(^|\.)(h|w|height|width|radius|gap|pad|padL|padR|px|py|inset|icon|size|dot|maxW|min|row|bar|btn|border|hairline|line|track|edge|glyph|fab|logo|ring|circle|rule|thumb|md|sm|chevron|offsetY|blur|blurOverlay|minSize|contentMax|formMax|field|fieldPhone|hitMin|hitMinAndroid|controlLg|controlMd|controlMdPhone|controlSm|iconXs|iconSm|iconMd|iconLg|statusbarH|tabbarH|safeBottom|rowMin|rowMax|display|title|heading|body|button|caption|micro|input|figure|figureSm|badge|badgeText|fade|labelW|colW|timeW|valueW|valueCompactW|fieldW|sumW|titleW|tileMin|swatchField|swatchRow|actionW|actionFull|mark|splash|wait|about|intro|knob|bodySlop|fs)$/;
const NOT_LENGTH = /(opacity|alpha|ratio|scale|Scale|velocity|weight|lineHeight|steps|Steps|stack|levels|cols|Cols|Em$|stops|damping|mass|stiffness|tilt|squash|maxChars|maxItems|maxRows|elevation|iconStroke|ease)/;
export function cssUnit(path: string): "px" | "em" | "ms" | "" {
  if (/tracking/.test(path)) return "em";
  if (path.startsWith("motion.")) return /(dur[A-Z]|Ms$|delay|Delay|cycle|stagger|Stagger|timeout|Timeout)/.test(path.split(".").pop()!) ? "ms" : "";
  if (NOT_LENGTH.test(path) || path.startsWith("z.") || path.startsWith("layout.gridCols")) return "";
  if (PX_GROUPS.test(path)) return "px";
  if (/^(size|font\.size|layout)\./.test(path) || path === "font.minSize") return "px";
  if (/^c\.(blur|blurOverlay|shadow\.radius|shadow\.offsetY)$/.test(path)) return "px";
  if (path.startsWith("component.") && LENGTH_END.test(path)) return "px";
  return "";
}
const cssValue = (path: string, v: Leaf) => (typeof v === "number" ? `${v}${cssUnit(path)}` : String(v));

const THEME_NAMES: ThemeName[] = ["light", "dark"];

/** the css custom property of a token path: «c.status.ok.fill» → «--c-status-ok-fill» */
export { cssName };

export function renderCss(): string {
  const head = "/* СГЕНЕРИРОВАНО из packages/design-tokens/src/index.ts — руками не править (npm run gen -w @octo/design-tokens). */\n";
  const shared = GROUPS.flatMap((g) => flatten(g.value, g.name)).map(([p, v]) => `  ${cssName(p)}: ${cssValue(p, v)};`);
  const theme = (t: ThemeName) => flatten(themes[t], "c").map(([p, v]) => `  ${cssName(p)}: ${cssValue(p, v)};`);
  return [
    head,
    `:root {\n${shared.join("\n")}\n}\n`,
    `:root, :root[data-theme="light"] {\n${theme("light").join("\n")}\n  color-scheme: light;\n}\n`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${theme("dark").map((l) => "  " + l).join("\n")}\n    color-scheme: dark;\n  }\n}\n`,
    `:root[data-theme="dark"] {\n${theme("dark").join("\n")}\n  color-scheme: dark;\n}\n`,
  ].join("\n");
}

const md = (v: Leaf) => (typeof v === "string" ? `\`${v}\`` : String(v));

export function renderTable(): string {
  const out: string[] = [
    "# Токены GoRix — таблицы значений",
    "",
    "> СГЕНЕРИРОВАНО из `packages/design-tokens/src/index.ts` — руками не править. Перестроить: `npm run gen -w @octo/design-tokens`.",
    "> Документ `GORIX-DS.md` называет токены по имени; значения — только здесь и в коде.",
    "",
    "## Цвет (по темам)",
    "",
    "| Токен | Светлая | Тёмная |",
    "| --- | --- | --- |",
  ];
  const light = new Map(flatten(themes.light, "c"));
  for (const [p, v] of flatten(themes.dark, "c")) out.push(`| \`${p}\` | ${md(light.get(p) ?? "—")} | ${md(v)} |`);
  for (const [p, v] of light) if (!flatten(themes.dark, "c").some(([d]) => d === p)) out.push(`| \`${p}\` | ${md(v)} | — |`);
  for (const g of GROUPS) {
    out.push("", `## ${g.title} (\`${g.name}\`)`, "", "| Токен | Значение |", "| --- | --- |");
    for (const [p, v] of flatten(g.value, g.name)) out.push(`| \`${p}\` | ${md(v)} |`);
  }
  out.push("");
  return out.join("\n");
}

export { THEME_NAMES };
