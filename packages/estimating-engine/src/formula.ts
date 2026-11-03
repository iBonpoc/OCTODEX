import { D, dec, type Dec } from "./decimal.js";

/**
 * Safe formula language for assemblies (ADR-005 §3).
 * Numbers, identifiers, + - * / ( ), < <= > >= == !=, and/or/not, true/false,
 * functions: ceil floor round min max if. No property access, no eval/Function.
 * Booleans are Decimal 1 / 0.
 */
export class FormulaError extends Error {}

type Tok = { t: "num"; v: string } | { t: "id"; v: string } | { t: "op"; v: string } | { t: "eof" };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Bad number at ${i}`);
      out.push({ t: "num", v: m[0] }); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0] }); i += m[0].length; continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "==", "!="].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/(),<>".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new FormulaError(`Unexpected character '${c}' at ${i}`);
  }
  out.push({ t: "eof" });
  return out;
}

export type Node =
  | { k: "num"; v: Dec }
  | { k: "var"; name: string }
  | { k: "un"; op: "-" | "not"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const FUNCS = new Set(["ceil", "floor", "round", "min", "max", "if"]);
const BP: Record<string, number> = {
  or: 1, and: 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6,
};
const PREFIX_BP = 7;

export function parse(src: string): Node {
  if (src.length > 500) throw new FormulaError("Formula too long");
  const toks = lex(src);
  let p = 0;
  const peek = (): Tok => toks[p]!;
  const next = (): Tok => toks[p++]!;
  const isOp = (t: Tok, v: string) => t.t === "op" && t.v === v;
  const binOp = (t: Tok): string | null =>
    t.t === "op" ? t.v : t.t === "id" && (t.v === "and" || t.v === "or") ? t.v : null;

  function expect(v: string) {
    if (!isOp(next(), v)) throw new FormulaError(`Expected '${v}'`);
  }
  function prefix(): Node {
    const t = next();
    if (t.t === "num") return { k: "num", v: dec(t.v) };
    if (isOp(t, "(")) { const e = expr(0); expect(")"); return e; }
    if (isOp(t, "-")) return { k: "un", op: "-", a: expr(PREFIX_BP) };
    if (t.t === "id") {
      if (t.v === "not") return { k: "un", op: "not", a: expr(PREFIX_BP) };
      if (t.v === "true") return { k: "num", v: dec(1) };
      if (t.v === "false") return { k: "num", v: dec(0) };
      if (isOp(peek(), "(")) {
        if (!FUNCS.has(t.v)) throw new FormulaError(`Unknown function '${t.v}'`);
        next();
        const args: Node[] = [];
        if (!isOp(peek(), ")")) {
          for (;;) {
            args.push(expr(0));
            if (isOp(peek(), ",")) { next(); continue; }
            break;
          }
        }
        expect(")");
        return { k: "call", fn: t.v, args };
      }
      return { k: "var", name: t.v };
    }
    throw new FormulaError("Unexpected token");
  }
  function expr(minBp: number): Node {
    let left = prefix();
    for (;;) {
      const op = binOp(peek());
      if (!op || !(op in BP) || BP[op]! <= minBp) break;
      next();
      left = { k: "bin", op, a: left, b: expr(BP[op]!) };
    }
    return left;
  }
  const tree = expr(0);
  if (peek().t !== "eof") throw new FormulaError("Unexpected trailing input");
  return tree;
}

export type Vars = Record<string, Dec | number | string | boolean>;
const truthy = (d: Dec) => !d.isZero();
const B = (b: boolean) => dec(b ? 1 : 0);

export function evaluate(node: Node, vars: Vars): Dec {
  switch (node.k) {
    case "num":
      return node.v;
    case "var": {
      if (!Object.prototype.hasOwnProperty.call(vars, node.name)) {
        throw new FormulaError(`Unknown variable '${node.name}'`);
      }
      const v = vars[node.name]!;
      return typeof v === "boolean" ? B(v) : dec(v as Dec | number | string);
    }
    case "un": {
      const a = evaluate(node.a, vars);
      return node.op === "-" ? a.neg() : B(!truthy(a));
    }
    case "bin": {
      if (node.op === "and") return B(truthy(evaluate(node.a, vars)) && truthy(evaluate(node.b, vars)));
      if (node.op === "or") return B(truthy(evaluate(node.a, vars)) || truthy(evaluate(node.b, vars)));
      const a = evaluate(node.a, vars);
      const b = evaluate(node.b, vars);
      switch (node.op) {
        case "+": return a.add(b);
        case "-": return a.sub(b);
        case "*": return a.mul(b);
        case "/":
          if (b.isZero()) throw new FormulaError("Division by zero");
          return a.div(b);
        case "<": return B(a.lt(b));
        case "<=": return B(a.lte(b));
        case ">": return B(a.gt(b));
        case ">=": return B(a.gte(b));
        case "==": return B(a.eq(b));
        case "!=": return B(!a.eq(b));
      }
      throw new FormulaError(`Bad operator ${node.op}`);
    }
    case "call": {
      const args = node.args;
      const need = (n: number) => {
        if (args.length !== n) throw new FormulaError(`${node.fn} expects ${n} argument(s)`);
      };
      switch (node.fn) {
        case "ceil": need(1); return evaluate(args[0]!, vars).ceil();
        case "floor": need(1); return evaluate(args[0]!, vars).floor();
        case "round": need(1); return evaluate(args[0]!, vars).toDecimalPlaces(0, D.ROUND_HALF_UP);
        case "min":
          if (!args.length) throw new FormulaError("min needs arguments");
          return D.min(...args.map(a => evaluate(a, vars)));
        case "max":
          if (!args.length) throw new FormulaError("max needs arguments");
          return D.max(...args.map(a => evaluate(a, vars)));
        case "if":
          need(3);
          return truthy(evaluate(args[0]!, vars)) ? evaluate(args[1]!, vars) : evaluate(args[2]!, vars);
      }
      throw new FormulaError(`Unknown function ${node.fn}`);
    }
  }
}

export const evalFormula = (src: string, vars: Vars): Dec => evaluate(parse(src), vars);
