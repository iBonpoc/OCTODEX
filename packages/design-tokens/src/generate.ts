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
/** a number becomes px unless it is a ratio, a weight, a count or a time (those keep the raw number; the name says the unit) */
const UNITLESS = /(weight|lineHeight|tracking|scale|Scale|opacity|ease|Ms$|^motion\.|\.z\.|^z\.|Steps|blur|cols|Cols|stroke|Stroke|max$|Max$|ratio|Ratio|liftScale)/;
const cssValue = (path: string, v: Leaf) =>
  typeof v === "number" && /tracking/.test(path) ? `${v}em` : typeof v === "number" && !UNITLESS.test(path) ? `${v}px` : String(v);

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
