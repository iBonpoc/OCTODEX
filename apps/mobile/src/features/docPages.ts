/**
 * «Страницы-вложения» of an estimate (spec 33 П24.7, S6g): pages a module adds to the client's document — a drawing
 * of simple shapes and a table of words — shown after the lines on the client page /p/ and in the estimate PDF.
 *
 * No markup is kept: a page is flat objects of scalars only (a line, a circle, a diamond, a backing box, a text), the
 * colours are the names of print tokens. The page /p/ is open to anyone with the link — an SVG string would let a
 * contractor put a script before his client (security-check of stage 0). Two rules, the same on the server:
 * - reading (`clientPages` = `app.doc_pages`, migration 20261110160000): what the page may draw passes, the rest drops;
 * - writing (`pagesProblem` = `app.doc_pages_problem`, the trigger on estimate_versions): too many, too long → refused,
 *   never cut (the client signs the whole calc_inputs: what he sees is what he signs).
 * The examples both sides check: test/fixtures/docPages.json (unit docPages, db T165).
 * The core does not know who drew the page: the module names it and fills it.
 */
import { print as P } from "@octo/design-tokens";

/** the same escape as docPdf's `esc` — this file stays a leaf (estimateDoc and ops.ts import it; docPdf imports them) */
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export type DocInk = "ink" | "mut";
export type DocFill = "paper" | "ink";
export type DocAnchor = "start" | "middle" | "end";

export type DocPrim =
  /** a line */
  | {
      t: "l";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      sw: number;
      ink: DocInk;
      dash?: number;
    }
  /** a circle */
  | { t: "c"; cx: number; cy: number; r: number; sw: number; fill: DocFill }
  /** a diamond (a square on its corner) */
  | { t: "d"; cx: number; cy: number; r: number; sw: number; fill: DocFill }
  /** a paper box behind a label */
  | { t: "r"; x: number; y: number; w: number; h: number }
  /** a text */
  | { t: "x"; x: number; y: number; s: string; fs: number; anchor?: DocAnchor };

export interface DocAttachPage {
  /** the author's own key, unique in the document (a module: «<module>:<its id>») */
  id: string;
  title: string;
  note?: string;
  /** the drawing's box, in its own units */
  w: number;
  h: number;
  items: DocPrim[];
  /** a table under the drawing: words only */
  head?: string[];
  rows?: string[][];
}

export const PAGE_LIMITS = {
  pages: 4,
  items: 3000,
  rows: 200,
  cols: 12,
  /** characters of any text; the id has its own */
  str: 200,
  id: 64,
  coord: 1e5,
  /** the write limit: bytes of the text the server keeps (jsonb::text), measured the same way here — `jsonbTextBytes` */
  bytes: 512 * 1024,
} as const;

const num = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const C = PAGE_LIMITS.coord;
const coords = (o: Record<string, unknown>, keys: string[]) => keys.every((k) => num(o[k], -C, C));
/** characters, as the server counts them (code points, not UTF-16 units) */
const len = (s: string) => Array.from(s).length;
const clip = (s: string, n: number = PAGE_LIMITS.str) => (len(s) > n ? Array.from(s).slice(0, n).join("") : s);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cell = (v: unknown) => (typeof v === "string" ? clip(v) : "");

/** one shape as the page may draw it, else null (the same as app.doc_prim) */
export function docPrim(v: unknown): DocPrim | null {
  if (!isObj(v)) return null;
  switch (v.t) {
    case "l": {
      if (!coords(v, ["x1", "y1", "x2", "y2"]) || !num(v.sw, 0.01, 100) || (v.ink !== "ink" && v.ink !== "mut")) return null;
      const p: DocPrim = {
        t: "l",
        x1: v.x1 as number,
        y1: v.y1 as number,
        x2: v.x2 as number,
        y2: v.y2 as number,
        sw: v.sw,
        ink: v.ink,
      };
      if (num(v.dash, 0.01, 1000)) p.dash = v.dash;
      return p;
    }
    case "c":
    case "d":
      if (!coords(v, ["cx", "cy"]) || !num(v.r, 0.01, 1000) || !num(v.sw, 0, 100) || (v.fill !== "paper" && v.fill !== "ink")) return null;
      return {
        t: v.t,
        cx: v.cx as number,
        cy: v.cy as number,
        r: v.r,
        sw: v.sw,
        fill: v.fill,
      };
    case "r":
      if (!coords(v, ["x", "y"]) || !num(v.w, 0, C) || !num(v.h, 0, C)) return null;
      return { t: "r", x: v.x as number, y: v.y as number, w: v.w, h: v.h };
    case "x": {
      if (!coords(v, ["x", "y"]) || typeof v.s !== "string" || !num(v.fs, 1, 200)) return null;
      const p: DocPrim = {
        t: "x",
        x: v.x as number,
        y: v.y as number,
        s: clip(v.s),
        fs: v.fs,
      };
      if (v.anchor === "start" || v.anchor === "middle" || v.anchor === "end") p.anchor = v.anchor;
      return p;
    }
    default:
      return null;
  }
}

/** the pages as the client may see them (the same as app.doc_pages): the first 4, a broken page drops, the first of an id wins */
export function clientPages(raw: unknown): DocAttachPage[] {
  if (!Array.isArray(raw)) return [];
  const out: DocAttachPage[] = [];
  const seen = new Set<string>();
  for (const v of raw.slice(0, PAGE_LIMITS.pages)) {
    if (!isObj(v) || typeof v.id !== "string" || len(v.id) < 1 || len(v.id) > PAGE_LIMITS.id || typeof v.title !== "string") continue;
    if (!num(v.w, 1, C) || !num(v.h, 1, C) || seen.has(v.id)) continue;
    seen.add(v.id);
    const items = Array.isArray(v.items)
      ? v.items
          .slice(0, PAGE_LIMITS.items)
          .map(docPrim)
          .filter((p): p is DocPrim => p !== null)
      : [];
    const page: DocAttachPage = {
      id: v.id,
      title: clip(v.title),
      w: v.w,
      h: v.h,
      items,
    };
    if (typeof v.note === "string") page.note = clip(v.note);
    if (Array.isArray(v.head)) page.head = v.head.slice(0, PAGE_LIMITS.cols).map(cell);
    if (Array.isArray(v.rows))
      page.rows = v.rows
        .slice(0, PAGE_LIMITS.rows)
        .filter((r): r is unknown[] => Array.isArray(r))
        .map((r) => r.slice(0, PAGE_LIMITS.cols).map(cell));
    out.push(page);
  }
  return out;
}

/** a JSON number as Postgres prints its numeric: no exponent ("1e-7" → "0.0000001", "1e+300" → 1 and 300 zeros) */
export function numericText(x: number): string {
  const j = JSON.stringify(x);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(j);
  if (!m) return j;
  const [, sign, int, frac = "", e] = m;
  const digits = int! + frac;
  const point = int!.length + Number(e);
  const plain =
    point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return sign + plain;
}

const utf8 = (s: string) => new TextEncoder().encode(s).length;

/** the bytes of the server's own text of a JSON value (jsonb::text: «, » and «: » between items, numbers as numeric) —
 *  the size the trigger t07_doc_pages measures, so the phone never sends what the server refuses (#727 review) */
export function jsonbTextBytes(v: unknown): number {
  if (v === null || v === undefined) return 4;
  if (typeof v === "boolean") return v ? 4 : 5;
  if (typeof v === "number") return Number.isFinite(v) ? numericText(v).length : 4;
  if (typeof v === "string") return utf8(JSON.stringify(v));
  if (Array.isArray(v)) return v.length ? 2 + v.reduce((n: number, x) => n + jsonbTextBytes(x), 0) + 2 * (v.length - 1) : 2;
  if (typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return e.length ? 2 + e.reduce((n, [k, x]) => n + utf8(JSON.stringify(k)) + 2 + jsonbTextBytes(x), 0) + 2 * (e.length - 1) : 2;
  }
  return 4;
}

/** every text anywhere inside */
function* texts(v: unknown): Generator<string> {
  if (typeof v === "string") yield v;
  else if (Array.isArray(v)) for (const x of v) yield* texts(x);
  else if (isObj(v)) for (const x of Object.values(v)) yield* texts(x);
}

export type PagesProblem = "pages" | "count" | "shape" | "long" | "id" | "size";

/** why the server would refuse these pages, or null (the same as app.doc_pages_problem, the size measured as the server does) */
export function pagesProblem(raw: unknown): PagesProblem | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return "pages";
  // the size first, as the server: nothing below walks a huge value
  if (jsonbTextBytes(raw) > PAGE_LIMITS.bytes) return "size";
  if (raw.length > PAGE_LIMITS.pages) return "count";
  for (const p of raw) {
    if (!isObj(p) || !Array.isArray(p.items) || p.items.length > PAGE_LIMITS.items) return "shape";
    if (p.head !== undefined && (!Array.isArray(p.head) || p.head.length > PAGE_LIMITS.cols)) return "shape";
    if (
      p.rows !== undefined &&
      (!Array.isArray(p.rows) || p.rows.length > PAGE_LIMITS.rows || p.rows.some((r) => !Array.isArray(r) || r.length > PAGE_LIMITS.cols))
    )
      return "shape";
  }
  for (const s of texts(raw)) if (len(s) > PAGE_LIMITS.str) return "long";
  const ids = raw.map((p) => (p as Record<string, unknown>).id).filter((id): id is string => typeof id === "string");
  if (ids.some((id) => len(id) > PAGE_LIMITS.id)) return "long";
  if (new Set(ids).size !== ids.length) return "id";
  return null;
}

/** a document as it may go to the server: pages the server would refuse are left out (the estimate itself must not stall) */
export function withSendablePages<D extends { pages?: unknown }>(doc: D): D {
  if (doc.pages === undefined || pagesProblem(doc.pages) === null) return doc;
  const { pages: _p, ...rest } = doc;
  return rest as D;
}

/* ---------------- drawing ---------------- */

export const inkOf = (k: DocInk) => (k === "mut" ? P.mut : P.ink);
export const fillOf = (k: DocFill) => (k === "ink" ? P.ink : P.paper);
/** a number in an attribute: finite, a tenth at most (the page passed the rules, this is the last guard) */
const n = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : 0);

/** the diamond's path: a square standing on its corner */
export const diamondPath = (cx: number, cy: number, r: number) => `M${n(cx)} ${n(cy - r)}L${n(cx + r)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r)} ${n(cy)}Z`;

function primSvg(p: DocPrim): string {
  switch (p.t) {
    case "l":
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${inkOf(p.ink)}" stroke-width="${n(p.sw)}" stroke-linecap="round"${
        p.dash ? ` stroke-dasharray="${n(p.dash)} ${n(p.dash)}"` : ""
      }/>`;
    case "c":
      return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${fillOf(p.fill)}" stroke="${P.ink}" stroke-width="${n(p.sw)}"/>`;
    case "d":
      return `<path d="${diamondPath(p.cx, p.cy, p.r)}" fill="${fillOf(p.fill)}" stroke="${P.ink}" stroke-width="${n(p.sw)}"/>`;
    case "r":
      return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${P.paper}"/>`;
    case "x":
      return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${n(p.fs)}" text-anchor="${p.anchor ?? "middle"}" fill="${P.ink}">${esc(p.s)}</text>`;
  }
}

/** the pages for the PDF: each from a new sheet — the title, the drawing, the note, the table; nothing when there are none */
/** one sheet of shapes as an SVG element (the page's drawing; a module's own PDF uses it too) — only what passes the
 *  rules is drawn: the shapes go through docPrim again here */
export function sheetSvg(sheet: { w: number; h: number; items: unknown[] }): string {
  const w = num(sheet.w, 1, C) ? sheet.w : 1, h = num(sheet.h, 1, C) ? sheet.h : 1;
  const items = sheet.items.slice(0, PAGE_LIMITS.items).map(docPrim).filter((p): p is DocPrim => p !== null);
  return `<svg viewBox="0 0 ${n(w)} ${n(h)}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">${items.map(primSvg).join("")}</svg>`;
}

export function pagesHtml(raw: unknown): string {
  return clientPages(raw)
    .map((pg) => {
      const svg = pg.items.length ? sheetSvg(pg) : "";
      const head = pg.head?.length ? `<thead><tr>${pg.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : "";
      const rows = pg.rows?.length ? `<tbody>${pg.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>` : "";
      const table = head || rows ? `<table>${head}${rows}</table>` : "";
      return `<div class="attach" style="break-before:page"><h2>${esc(pg.title)}</h2>${svg}${pg.note ? `<p class="note"><b>${esc(pg.note)}</b></p>` : ""}${table}</div>`;
    })
    .join("");
}
