/**
 * Arguments of `npm run shot` (#2360). A pure parser: no I/O, so it is tested (apps/mobile/test/shotArgs.test.ts).
 *   npm run shot -- /client/c1 --theme dark --width 390 --lang ru --role director --font large --reduce-motion
 *                   --scroll 112|<testID> --do "click:tab-plan;fill:search=ab" --frames 4 --every 120 --crop <testID>
 *                   --engine web|sim --state <name> --by <who> --keep --repo <path>
 *   npm run shot -- --all           (the six v2 screens × 2 themes × header 0/44/72/112/300)
 */
const THEMES = ["dark", "light"];
const WIDTHS = [390, 820, 1280];
const LANGS = ["ru", "en", "es"];
const ROLES = ["director", "tech", "dispatcher", "sales"];
const FONTS = ["normal", "large"];
const ENGINES = ["web", "sim"];
const HEIGHT = { 390: 844, 820: 1180, 1280: 800 };

/** the six screens of visual v2 (the same list as e2e/visual/visual.cjs) */
const ALL_SCREENS = [
  { name: "home", route: "/today" },
  { name: "plan", route: "/plan" },
  { name: "client", route: "/client/c1" },
  { name: "visit", route: "/visit/v4" },
  { name: "estimate", route: "/estimate/new?id=e6" },
  { name: "money", route: "/finance" },
];
const HEADER_SCROLLS = [0, 44, 72, 112, 300];

function fail(msg) { const e = new Error(msg); e.usage = true; return e; }
function oneOf(name, v, list) { if (!list.includes(v)) throw fail(`--${name}: «${v}» — допустимо ${list.join(" | ")}`); return v; }
function int(name, v, min = 0) { const n = Number(v); if (!Number.isInteger(n) || n < min) throw fail(`--${name}: нужно целое число ≥ ${min}, получено «${v}»`); return n; }

const VALUE_FLAGS = ["theme", "width", "lang", "role", "font", "scroll", "do", "frames", "every", "crop", "engine", "state", "by", "repo", "udid"];
const BOOL_FLAGS = ["reduce-motion", "keep", "all", "no-build", "offline"];

/** split "click:a;fill:b=text" into [{type:"click",arg:"a"}, {type:"fill",arg:"b",value:"text"}] */
function parseActions(s) {
  if (!s) return [];
  return s.split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf(":");
    const type = (i < 0 ? x : x.slice(0, i)).trim();
    const rest = i < 0 ? "" : x.slice(i + 1);
    const known = ["click", "clicktext", "fill", "type", "key", "wait", "scroll", "hover", "expect", "offline", "online", "goto"];
    if (!known.includes(type)) throw fail(`--do: действие «${type}» неизвестно (${known.join(", ")})`);
    if (type === "fill") {
      const j = rest.indexOf("=");
      if (j < 0) throw fail(`--do: fill:<testID>=<текст> — нет «=» в «${x}»`);
      return { type, arg: rest.slice(0, j), value: rest.slice(j + 1) };
    }
    if (["click", "clicktext", "type", "key", "wait", "scroll", "hover", "expect", "goto"].includes(type) && !rest) throw fail(`--do: «${type}» без аргумента`);
    if (type === "wait") int("do wait", rest);
    return { type, arg: rest };
  });
}

function parseArgs(argv) {
  const o = { theme: "dark", width: 390, lang: "ru", role: "director", font: "normal", reduceMotion: false, scroll: null, actions: [], frames: 1, every: 100, crop: null, engine: "web", state: null, by: process.env.SHOT_BY || "unknown", keep: false, all: false, route: null, repo: null, udid: null, noBuild: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { rest.push(a); continue; }
    const [k0, inline] = a.slice(2).split(/=(.*)/s);
    const k = k0;
    if (BOOL_FLAGS.includes(k)) { if (k === "reduce-motion") o.reduceMotion = true; else if (k === "keep") o.keep = true; else if (k === "all") o.all = true; else if (k === "no-build") o.noBuild = true; else if (k === "offline") o.offline = true; continue; }
    if (!VALUE_FLAGS.includes(k)) throw fail(`неизвестный флаг --${k}. Известны: ${[...VALUE_FLAGS, ...BOOL_FLAGS].map((x) => "--" + x).join(" ")}`);
    const v = inline !== undefined ? inline : argv[++i];
    if (v === undefined || v.startsWith("--")) throw fail(`--${k}: нет значения`);
    if (k === "theme") o.theme = oneOf(k, v, THEMES);
    else if (k === "width") o.width = oneOf(k, int(k, v, 1), WIDTHS);
    else if (k === "lang") o.lang = oneOf(k, v, LANGS);
    else if (k === "role") o.role = oneOf(k, v, ROLES);
    else if (k === "font") o.font = oneOf(k, v, FONTS);
    else if (k === "engine") o.engine = oneOf(k, v, ENGINES);
    else if (k === "scroll") o.scroll = /^\d+$/.test(v) ? Number(v) : v;
    else if (k === "do") o.actions = parseActions(v);
    else if (k === "frames") o.frames = int(k, v, 1);
    else if (k === "every") o.every = int(k, v, 16);
    else if (k === "crop") o.crop = v;
    else if (k === "state") o.state = v.replace(/[^\p{L}\p{N}_-]+/gu, "-");
    else if (k === "by") o.by = v;
    else if (k === "repo") o.repo = v;
    else if (k === "udid") o.udid = v;
  }
  if (o.frames > 60) throw fail("--frames: не больше 60");
  if (o.all) { if (rest.length) throw fail("--all не берёт маршрут"); return o; }
  if (rest.length !== 1) throw fail("нужен ровно один маршрут, например: npm run shot -- /client/c1 --theme dark   (или --all)");
  if (!rest[0].startsWith("/")) throw fail(`маршрут должен начинаться с «/»: «${rest[0]}»`);
  o.route = rest[0];
  return o;
}

/** --all → the list of single-shot option sets */
function expandAll(o) {
  const out = [];
  for (const s of ALL_SCREENS) for (const theme of THEMES) for (const y of HEADER_SCROLLS)
    out.push({ ...o, all: false, route: s.route, theme, scroll: y || null, state: `${s.name}-h${y}` });
  return out;
}

const heightFor = (w) => HEIGHT[w];
module.exports = { parseArgs, parseActions, expandAll, heightFor, THEMES, WIDTHS, LANGS, ROLES, ALL_SCREENS, HEADER_SCROLLS };
