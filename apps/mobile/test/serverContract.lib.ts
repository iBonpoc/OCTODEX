/**
 * The app's side of the server contract (docs/ai/CHECKS.md §3а; docs/specs/21 §5): every `.rpc("name", {keys})`,
 * `call("name", {…})` of cloud/team.ts and `.from("table")` in apps/mobile/src and supabase/functions.
 * Shared by serverContract.test.ts (against the migrations' text) and serverCatalog.test.ts (against the live catalog).
 */
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../../..");
export const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
export const walk = (dir: string): string[] =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
        const p = `${dir}/${d.name}`;
        return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
      })
    : [];

/* ---------- the app's side ---------- */
/** the text of a balanced (...) / {...} starting at `open` */
export function balanced(src: string, open: number): string {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack: string[] = [];
  let str: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (str) {
      if (c === "\\") i++;
      else if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") str = c;
    else if (pairs[c]) stack.push(pairs[c]!);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}
/** top-level keys of an object literal `{ a: 1, b, c: f(x, y) }` */
export function objectKeys(obj: string): string[] {
  const inner = obj.trim().replace(/^\{|\}$/g, "");
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let str: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (str) {
      cur += c;
      if (c === "\\") cur += inner[++i] ?? "";
      else if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") str = c;
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => /^\s*([A-Za-z_]\w*)\s*(?::|$)/.exec(p)?.[1]).filter((k): k is string => !!k);
}
export interface AppCall {
  fn: string;
  keys: string[] | null; // null — the arguments are not a literal object (cannot be checked by keys)
  where: string;
}
export function appCalls(file: string, src: string): AppCall[] {
  const out: AppCall[] = [];
  for (const m of src.matchAll(/(?:\.rpc|\bcall(?:<[^>]*>)?)\(\s*"([a-z_][a-z0-9_]*)"\s*(,)?/g)) {
    const at = m.index! + m[0].length;
    let keys: string[] | null = [];
    if (m[2]) {
      const brace = src.slice(at).search(/\S/);
      const start = at + brace;
      keys = src[start] === "{" ? objectKeys(balanced(src, start)) : null;
    }
    out.push({ fn: m[1]!, keys, where: `${file}:${src.slice(0, m.index).split("\n").length}` });
  }
  return out;
}
export function appTables(src: string): string[] {
  return [...src.matchAll(/\.from\(\s*"([a-z_][a-z0-9_]*)"\s*\)/g)].map((m) => m[1]!);
}

/** every call and table of the real app */
export function repoCalls() {
  const files = [...walk("apps/mobile/src"), ...walk("supabase/functions")];
  return {
    calls: files.flatMap((f) => appCalls(f, read(f))),
    tables: files.flatMap((f) => appTables(read(f)).map((t) => ({ t, f }))),
  };
}
