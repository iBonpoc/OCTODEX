/**
 * A drafting sheet of the shop drawings (#1349): paper inches, origin bottom-left, y up (as on a drawing board). Pure —
 * no DOM, no measuring: a text's width comes from the Arial width table (metrics.ts), so the same code lays a sheet out
 * on a phone and in a test. Everything drawn is also remembered as an obstacle (text boxes, bubbles, line segments):
 * a label is placed only where it stands free (`place`), and `problems` lists what still overlaps or leaves the
 * border — the check made before a sheet is saved. Sizes are tokens (shopSheet); the ink is the print ink.
 */
import { print, shopSheet as SS } from "@octo/design-tokens";
import { CHARS, DEFAULT_W, W_BOLD, W_REG } from "./metrics";

export type Pt = [number, number];

/** lineweights by layer, mm (the AIA layer in the comment) */
export const LW = {
  border: SS.lwBorder, // G-ANNO-BRDR
  gutter: SS.lwRun, // A-GUTR
  heavy: SS.lwHeavy, // the title block's top rule, title underlines, end-cap ticks
  ttlb: SS.lwBlock, // G-ANNO-TTLB
  med: SS.lwMed, // A-ANNO-SYMB, A-ANNO-TEXT
  thin: SS.lwThin, // A-ANNO-DIMS, A-GUTR-FACE, leaders
  hair: SS.lwHair, // table row rules, hatch
} as const;

/** text heights (cap height), inches: none is below `sm` — 11 pt on the sheet, 7 pt when it is reduced to Letter */
export const TH = { sm: SS.textSm, body: SS.text, title: SS.textTitle, sheet: SS.textSheet } as const;

/** a drafting text height is its cap height: Arial's, in em */
const CAP = SS.capEm;
/** the font size of a text of cap height `h` (inches), in points */
export const fontPt = (h: number) => (h / CAP) * 72;
const PX = 96;
const INK = print.ink, PAPER = print.paper, GRAY = SS.band;

export function textW(s: string, h: number, bold = false): number {
  const tab = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of s) {
    const i = CHARS.indexOf(ch);
    w += i >= 0 ? tab[i]! : DEFAULT_W;
  }
  return (w / 1000) * (h / CAP);
}

/** break a text into lines no wider than `maxW` */
export function wrap(s: string, h: number, maxW: number, bold = false): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of s.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && textW(next, h, bold) > maxW) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
export const V = { sub, add, mul, cross, len: (a: Pt) => Math.hypot(a[0], a[1]), unit: (a: Pt, b: Pt): Pt => { const d = sub(b, a); const l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; }, lerp: (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };

interface Shape { poly: Pt[]; what: string }
interface Seg { a: Pt; b: Pt; what: string }

/** convex polygons overlap (separating axis) */
function polyHit(p: Pt[], q: Pt[]): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length]!, poly[i]!);
      const ax: Pt = [-e[1], e[0]];
      const pr = (pts: Pt[]) => { let lo = Infinity, hi = -Infinity; for (const v of pts) { const d = v[0] * ax[0] + v[1] * ax[1]; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi] as const; };
      const [a0, a1] = pr(p), [b0, b1] = pr(q);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}
const segHit = (s: Seg, p: Pt[]) => polyHit([s.a, s.b], p) && crossesOrInside(s, p);
function crossesOrInside(s: Seg, p: Pt[]): boolean {
  const inside = (v: Pt) => { let sign = 0; for (let i = 0; i < p.length; i++) { const c = cross(sub(p[(i + 1) % p.length]!, p[i]!), sub(v, p[i]!)); if (Math.abs(c) < 1e-9) continue; if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); } return true; };
  if (inside(s.a) || inside(s.b)) return true;
  const d = sub(s.b, s.a);
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, e = sub(p[(i + 1) % p.length]!, a);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const t = cross(sub(a, s.a), e) / den, u = cross(sub(a, s.a), d) / den;
    if (t > 0 && t < 1 && u > 0 && u < 1) return true;
  }
  return false;
}

export interface TextOpts { anchor?: "l" | "c" | "r"; bold?: boolean; rot?: number; pad?: number }
export interface LineOpts { lw?: number; ghost?: boolean; dash?: boolean }

/** one thing put on the sheet as a whole (a dimension, a tag with its leader, a table): its own parts never clash */
export class Part {
  svg: string[] = [];
  shapes: Shape[] = [];
  segs: Seg[] = [];
  /** the smallest text height on it */
  minH = Infinity;
  readonly H: number;
  readonly what: string;
  constructor(H: number, what = "") { this.H = H; this.what = what; }

  private x = (v: number) => (v * PX).toFixed(2);
  private y = (v: number) => ((this.H - v) * PX).toFixed(2);
  private pts = (ps: Pt[]) => ps.map((p) => `${this.x(p[0])},${this.y(p[1])}`).join(" ");
  private sw = (mm: number) => ((mm / 25.4) * PX).toFixed(2);

  line(a: Pt, b: Pt, o: LineOpts = {}): this {
    this.svg.push(`<line x1="${this.x(a[0])}" y1="${this.y(a[1])}" x2="${this.x(b[0])}" y2="${this.y(b[1])}" stroke-width="${this.sw(o.lw ?? LW.thin)}"${o.dash ? ' stroke-dasharray="4 3"' : ""}/>`);
    if (!o.ghost) this.segs.push({ a, b, what: this.what });
    return this;
  }
  poly(ps: Pt[], o: LineOpts & { close?: boolean; fill?: "none" | "gray" | "ink" | "paper" } = {}): this {
    const fill = o.fill === "gray" ? GRAY : o.fill === "ink" ? INK : o.fill === "paper" ? PAPER : "none";
    this.svg.push(`<${o.close ? "polygon" : "polyline"} points="${this.pts(ps)}" fill="${fill}" stroke-width="${this.sw(o.lw ?? LW.thin)}"${o.lw === 0 ? ' stroke="none"' : ""}/>`);
    if (!o.ghost && o.lw !== 0) for (let i = 0; i + 1 < ps.length + (o.close ? 1 : 0); i++) this.segs.push({ a: ps[i]!, b: ps[(i + 1) % ps.length]!, what: this.what });
    return this;
  }
  rect(x0: number, y0: number, x1: number, y1: number, o: LineOpts & { fill?: "none" | "gray" | "ink" | "paper" } = {}): this {
    return this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { ...o, close: true });
  }
  /** a bubble: nothing else may stand in it */
  circle(c: Pt, r: number, o: LineOpts & { solid?: boolean; fill?: "paper" } = {}): this {
    this.svg.push(`<circle cx="${this.x(c[0])}" cy="${this.y(c[1])}" r="${(r * PX).toFixed(2)}" fill="${o.fill === "paper" ? PAPER : "none"}" stroke-width="${this.sw(o.lw ?? LW.med)}"/>`);
    if (o.solid !== false) this.shapes.push({ poly: ngon(c, r, 8, 22.5), what: this.what });
    return this;
  }
  /** an arc from angle a0 to a1 (degrees, counter-clockwise) */
  arc(c: Pt, r: number, a0: number, a1: number, o: LineOpts = {}): this {
    const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 6));
    const ps: Pt[] = [];
    for (let i = 0; i <= n; i++) { const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; ps.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); }
    return this.poly(ps, o);
  }
  /** a closed shape other things keep out of (a tag's box or hexagon) */
  solid(ps: Pt[], o: LineOpts & { fill?: "paper" } = {}): this {
    this.poly(ps, { ...o, close: true, ghost: true, lw: o.lw ?? LW.med });
    this.shapes.push({ poly: ps, what: this.what });
    return this;
  }
  /** a text of cap height h; (x, y) is the middle of its height at the left, centre or right end */
  text(s: string, x: number, y: number, h: number, o: TextOpts = {}): this {
    if (!s) return this;
    this.minH = Math.min(this.minH, h);
    const w = textW(s, h, o.bold);
    const x0 = o.anchor === "c" ? -w / 2 : o.anchor === "r" ? -w : 0;
    const rot = o.rot ?? 0, r = (rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
    const at = (lx: number, ly: number): Pt => [x + lx * cs - ly * sn, y + lx * sn + ly * cs];
    const pad = o.pad ?? 0.015;
    this.shapes.push({ poly: [at(x0 - pad, -h / 2 - pad), at(x0 + w + pad, -h / 2 - pad), at(x0 + w + pad, h / 2 + pad), at(x0 - pad, h / 2 + pad)], what: `“${s}”` });
    const base = at(0, -h / 2);
    const anchor = o.anchor === "c" ? "middle" : o.anchor === "r" ? "end" : "start";
    this.svg.push(`<text x="${this.x(base[0])}" y="${this.y(base[1])}" font-size="${((h / CAP) * PX).toFixed(2)}"${o.bold ? ' font-weight="700"' : ""} text-anchor="${anchor}"${rot ? ` transform="rotate(${(-rot).toFixed(2)} ${this.x(base[0])} ${this.y(base[1])})"` : ""}>${esc(s)}</text>`);
    return this;
  }
  /** parallel lines clipped to a polygon: ANSI31 (one way) or ANSI37 (both ways) */
  hatch(ps: Pt[], kind: "ansi31" | "ansi37", step: number, id: string): this {
    const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const span = y1 - y0;
    let lines = "";
    for (let k = x0 - span; k < x1 + span; k += step) {
      lines += `<line x1="${this.x(k)}" y1="${this.y(y0)}" x2="${this.x(k + span)}" y2="${this.y(y1)}"/>`;
      if (kind === "ansi37") lines += `<line x1="${this.x(k + span)}" y1="${this.y(y0)}" x2="${this.x(k)}" y2="${this.y(y1)}"/>`;
    }
    this.svg.push(`<clipPath id="${id}"><polygon points="${this.pts(ps)}"/></clipPath><g clip-path="url(#${id})" stroke-width="${this.sw(LW.hair)}">${lines}</g>`);
    return this;
  }
}

export const ngon = (c: Pt, r: number, n: number, startDeg: number): Pt[] => Array.from({ length: n }, (_, k) => { const t = ((startDeg + (360 / n) * k) * Math.PI) / 180; return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as Pt; });
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export class Sheet {
  parts: Part[] = [];
  /** what could not be placed free (a label with no free spot) */
  notes: string[] = [];
  readonly w: number;
  readonly h: number;
  readonly border: number;
  constructor(w: number, h: number, border: number) { this.w = w; this.h = h; this.border = border; }

  part(what = ""): Part { return new Part(this.h, what); }
  add(p: Part): Part { this.parts.push(p); return p; }
  /** draw straight away */
  draw(what: string, f: (p: Part) => void): Part { const p = this.part(what); f(p); return this.add(p); }

  private inside(p: Part): boolean {
    const b = this.border, ok = (v: Pt) => v[0] >= b && v[0] <= this.w - b && v[1] >= b && v[1] <= this.h - b;
    return p.shapes.every((s) => s.poly.every(ok)) && p.segs.every((s) => ok(s.a) && ok(s.b));
  }
  /** what `p` runs into among the parts already on the sheet */
  clash(p: Part, others: Part[] = this.parts): string | null {
    for (const o of others) {
      if (o === p) continue;
      for (const s of p.shapes) {
        for (const t of o.shapes) if (polyHit(s.poly, t.poly)) return `${s.what || p.what} × ${t.what || o.what}`;
        for (const g of o.segs) if (segHit(g, s.poly)) return `${s.what || p.what} × line of ${o.what}`;
      }
      for (const g of p.segs) for (const t of o.shapes) if (segHit(g, t.poly)) return `line of ${p.what} × ${t.what || o.what}`;
    }
    return null;
  }
  free(p: Part): boolean { return this.inside(p) && !this.clash(p); }
  /** the first candidate that stands free is put on the sheet; none — the first one, and a note for `problems` */
  place(what: string, candidates: Iterable<(p: Part) => void>): Part {
    let first: Part | null = null;
    for (const f of candidates) {
      const p = this.part(what);
      f(p);
      first ??= p;
      if (this.free(p)) return this.add(p);
    }
    if (!first) throw new Error(`no candidates for ${what}`);
    this.notes.push(`no free place for ${what}`);
    return this.add(first);
  }
  /** every overlap and everything outside the border: empty — the sheet may be saved */
  problems(): string[] {
    const out: string[] = [];
    this.parts.forEach((p, i) => {
      if (p.what !== "border" && !this.inside(p)) out.push(`${p.what} is outside the border`);
      const c = this.clash(p, this.parts.slice(i + 1));
      if (c) out.push(c);
    });
    return out;
  }
  /** the smallest text on the sheet, points */
  minPt(): number { return fontPt(Math.min(...this.parts.map((p) => p.minH))); }
  /** `k` — printed smaller (Letter): the whole sheet is scaled, nothing is laid out again */
  svg(k = 1): string {
    const W = this.w * PX, H = this.h * PX;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${(this.w * k).toFixed(3)}in" height="${(this.h * k).toFixed(3)}in" viewBox="0 0 ${W} ${H}" font-family="Arial, 'Liberation Sans', Helvetica, sans-serif" stroke="${INK}" fill="none" stroke-linecap="butt" stroke-linejoin="miter"><g>${this.parts.map((p) => p.svg.join("")).join("\n")}</g></svg>`.replace(/<text /g, `<text stroke="none" fill="${INK}" `);
  }
}

/** the sheets as a printable page: each on a page of `page` inches, scaled to fit it (1 — its own size), centred */
export function sheetsHtml(sheets: Sheet[], title: string, page?: { w: number; h: number }): string {
  const { w, h } = page ?? sheets[0]!;
  const k = Math.min(1, w / sheets[0]!.w, h / sheets[0]!.h);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${w}in ${h}in;margin:0}html,body{margin:0;padding:0;background:${PAPER}}div{width:${w}in;height:${h}in;display:flex;align-items:center;justify-content:center;overflow:hidden;page-break-after:always;break-after:page}div:last-child{page-break-after:auto;break-after:auto}svg{display:block}</style></head><body>${sheets.map((s) => `<div>${s.svg(k)}</div>`).join("")}</body></html>`;
}
