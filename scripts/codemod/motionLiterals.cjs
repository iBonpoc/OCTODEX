/**
 * Codemod / guard «ноль значений по месту», пачка III-1 (спека 63 §3а; #2292): the numbers the eye sees — a bezier curve,
 * a duration of an animation, a layer (`zIndex`) — are written in the design tokens (`motion.*`, `z.*`), not in the screen.
 *
 *   node scripts/codemod/motionLiterals.cjs            — rewrites the known literals in src/app, src/features, src/ui (not the showcase)
 *   node scripts/codemod/motionLiterals.cjs --check    — lists what is left (exit 1); the same `scan` is the guard in test/designSystem.test.ts
 *
 * Uses the TypeScript compiler API (already in the repo; no new dependency). A literal without a token is only reported.
 * Not touched: timers that are not an animation (`setTimeout` of a network wait), `duration: 0`, minutes in calendar data.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const APP = path.join(__dirname, "..", "..", "apps", "mobile");
const ROOTS = ["src/app", "src/features", "src/ui"];
const SKIP = (rel) => rel.startsWith("src/features/showcase/");

/** literal → token expression (the table the codemod writes) */
const BEZIER = { "0.45,0,0.55,1": "motion.easeInOut", "0.4,0,0.6,1": "motion.easeBrandWay", "0.45,0,0.35,1": "motion.easeBrandFold" };
const DURATION = { 80: "motion.durPress" };
const ZINDEX = { 0: "z.under", 1: "z.over", 2: "z.dragged" };
/** calls whose object argument carries an animation's `duration` / `delay` */
const ANIM_CALL = /^(withTiming|withDelay|withSpring|withRepeat|withSequence|Animated\.timing)$/;

function walkFiles(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkFiles(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const files = () => ROOTS.flatMap((r) => walkFiles(path.join(APP, r))).filter((f) => !SKIP(path.relative(APP, f).split(path.sep).join("/")));

const numeric = (n) => (ts.isNumericLiteral(n) ? Number(n.text) : ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand) ? -Number(n.operand.text) : null);

/** [{ file, line, kind, text, start, end, to }] — `to` is the token expression, or null when there is none yet */
function scanFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const add = (node, kind, to) => hits.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind, text: node.getText(), start: node.getStart(), end: node.getEnd(), to });
  const calleeName = (c) => c.expression.getText();
  const visit = (node, inAnim) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name === "Easing.bezier") {
        const nums = node.arguments.map(numeric);
        if (nums.length === 4 && nums.every((x) => x !== null)) {
          const to = BEZIER[nums.join(",")];
          add(node, "bezier", to ? `Easing.bezier(...${to})` : null);
        }
      }
      if (name === "withDelay" && node.arguments[0] && numeric(node.arguments[0]) > 0) add(node.arguments[0], "delay", null);
      const anim = ANIM_CALL.test(name);
      node.arguments.forEach((a) => visit(a, anim || inAnim));
      visit(node.expression, inAnim);
      return;
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const key = node.name.text;
      if (inAnim && (key === "duration" || key === "delay")) {
        const v = numeric(node.initializer);
        if (v !== null && v > 0) add(node.initializer, key, DURATION[v] ?? null);
      }
      if (key === "zIndex") {
        const lits = [];
        // the layer is the value itself or a branch of `a ? x : y`; a number in the condition is not a layer
        const find = (n) => {
          if (ts.isConditionalExpression(n)) { find(n.whenTrue); find(n.whenFalse); return; }
          if (ts.isParenthesizedExpression(n)) { find(n.expression); return; }
          if (numeric(n) !== null) lits.push(n);
        };
        find(node.initializer);
        for (const l of lits) add(l, "zIndex", ZINDEX[numeric(l)] ?? null);
      }
    }
    ts.forEachChild(node, (c) => visit(c, inAnim));
  };
  visit(sf, false);
  return { src, sf, hits };
}

/** every literal in the zone that is still written by hand, as `{ file (rel to apps/mobile), line, kind, text }` */
function scan() {
  return files().flatMap((f) => scanFile(f).hits.map((h) => ({ file: path.relative(APP, f).split(path.sep).join("/"), line: h.line, kind: h.kind, text: h.text, hasToken: !!h.to })));
}

/** the tokens a file needs in its `@octo/design-tokens` import */
function ensureImports(src, names) {
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*"@octo\/design-tokens";/);
  const need = [...names];
  if (!m) return `import { ${need.sort().join(", ")} } from "@octo/design-tokens";\n` + src;
  const have = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  const all = [...new Set([...have, ...need])];
  if (all.length === have.length) return src;
  const types = all.filter((x) => x.startsWith("type "));
  const plain = all.filter((x) => !x.startsWith("type ")).sort();
  return src.replace(m[0], `import { ${[...plain, ...types].join(", ")} } from "@octo/design-tokens";`);
}

/** `--skip=ui/surfaces.tsx,ui/overlays.tsx`: files an open PR holds are left alone (paths under src/) */
function apply() {
  let changed = 0;
  const skip = (process.argv.find((a) => a.startsWith("--skip=")) || "").slice(7).split(",").filter(Boolean);
  for (const f of files()) {
    if (skip.some((x) => f.endsWith(path.join("src", x)))) continue;
    const { src, hits } = scanFile(f);
    const todo = hits.filter((h) => h.to).sort((a, b) => b.start - a.start);
    if (!todo.length) continue;
    let out = src;
    for (const h of todo) out = out.slice(0, h.start) + h.to + out.slice(h.end);
    const names = new Set(todo.map((h) => h.to.match(/\b(motion|z)\b/)[1]));
    out = ensureImports(out, names);
    fs.writeFileSync(f, out);
    changed += todo.length;
    console.log(`${path.relative(APP, f)}: ${todo.length}`);
  }
  console.log(`replaced ${changed}`);
}

module.exports = { scan, BEZIER, DURATION, ZINDEX };

if (require.main === module) {
  if (process.argv.includes("--check")) {
    const left = scan();
    for (const h of left) console.log(`${h.file}:${h.line} ${h.kind} ${h.text}${h.hasToken ? "  (has a token: run the codemod)" : "  (no token yet)"}`);
    process.exit(left.length ? 1 : 0);
  } else apply();
}
