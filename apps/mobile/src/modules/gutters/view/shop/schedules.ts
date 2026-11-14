/**
 * Sheets «SCHEDULES & MATERIALS» (#1349): the gutter schedule, the downspout schedule and the material list with the
 * basis of every quantity — and the «MATERIAL ORDER» for the supplier. The quantities are the estimate's own (the
 * engine's parts): the sheet, the estimate and the order show one number. A table that does not fit goes on to the
 * next sheet. What the measurement does not say is «TBD», never a guess.
 */
import type { PartQty } from "@octo/estimating-engine";
import { partName } from "../../prices";
import { B, R, TBT, header, sheetFrame } from "./frame";
import { SW, attrWord, dsSizeText, lenText, sw, type ShopCtx, type Tr } from "./job";
import { miterCutDeg, type ShopDs, type ShopEnd, type ShopModel, type ShopSeg } from "./model";
import { LW, TH, ngon, textW, wrap, type Part, type Sheet } from "./sheet";

const X0 = 0.75, X1 = R - 0.375, LINE = 0.2;
const cap1 = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const kindWord = (t: Tr, k?: string) => t(k === "in" ? "mod.gutters.draw.cornerIn" : k === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");

const endWord = (t: Tr, e: ShopEnd) => (e.kind === "cap" ? sw(t, "endCap", { s: e.hand! }) : e.kind === "join" ? sw(t, "join") : sw(t, "miter", { deg: e.angleDeg!, kind: kindWord(t, e.cornerKind) }));
/** «End cap L to 90° outside miter» */
export const segWord = (t: Tr, s: ShopSeg) => cap1(sw(t, "fromTo", { a: endWord(t, s.ends[0]), b: endWord(t, s.ends[1]) }));
const tbd = (t: Tr) => SW(t, "tbd");
const elbowWord = (t: Tr, d: ShopDs) => (d.elbows === undefined ? tbd(t) : d.elbows.length ? d.elbows.map((e) => `${e.style} ×${e.qty}`).join(", ") : "—");
const offsetWord = (t: Tr, d: ShopDs) => (d.offsets === undefined ? tbd(t) : d.offsets.length ? d.offsets.map((o) => `${o.lengthIn}"${o.qty > 1 ? ` ×${o.qty}` : ""}`).join(", ") : "—");

/** the sheets a table flows over: a new one is made when the next row has no room */
class Flow {
  sheets: Sheet[] = [];
  s!: Sheet;
  y = 0;
  private make: (i: number) => Sheet;
  private top: number;
  constructor(make: (i: number) => Sheet, top: number) { this.make = make; this.top = top; this.next(); }
  next() { this.s = this.make(this.sheets.length); this.sheets.push(this.s); this.y = this.top; }
  room(h: number) { return this.y - h >= TBT + 0.2; }
}

interface Col { x: number; w: number; align?: "r"; bold?: boolean }
interface Row { cells: string[]; bold?: boolean; ruleAbove?: boolean; mark?: (p: Part, x: number, y: number) => void }

function table(f: Flow, title: string, cont: string, cols: Col[], head: string[], rows: Row[], rowRules = false) {
  let rules: Part | null = null, drawn = 0;
  const open = (again: boolean) => {
    const y0 = f.y;
    f.s.draw(`${title} heading`, (p) => header(p, again ? `${title} ${cont}` : title, X0, X1, y0, 0.15));
    f.y -= 0.42;
    const yy = f.y;
    head.forEach((v, i) => v && f.s.draw(`${title} head`, (p) => p.text(v, cols[i]!.x, yy, TH.sm, { anchor: cols[i]!.align ?? "l", bold: true })));
    rules = f.s.part(`${title} rules`);
    f.y -= 0.14; rules.line([X0, f.y], [X1, f.y], { lw: LW.med }); f.y -= 0.07;
  };
  const close = () => { if (rules) { rules.line([X0, f.y], [X1, f.y], { lw: LW.ttlb }); f.s.add(rules); rules = null; } f.y -= 0.12; };
  if (!f.room(1.2)) f.next();
  open(false);
  for (const r of rows) {
    const lines = r.cells.map((v, i) => wrap(v, TH.sm, cols[i]!.w, !!cols[i]!.bold || !!r.bold));
    const h = Math.max(1, ...lines.map((l) => l.length)) * LINE + 0.08;
    if (!f.room(h + 0.1)) { close(); f.next(); open(true); drawn = 0; }
    if (drawn && (r.ruleAbove || rowRules)) rules!.line([X0, f.y], [X1, f.y], { lw: r.ruleAbove ? LW.ttlb : LW.hair });
    const top = f.y, n = ++drawn;
    lines.forEach((ls, i) => ls.forEach((ln, k) => f.s.draw(`${title} row ${n}`, (p) => p.text(ln, cols[i]!.x, top - 0.04 - LINE / 2 - k * LINE, TH.sm, { anchor: cols[i]!.align ?? "l", bold: !!cols[i]!.bold || !!r.bold }))));
    if (r.mark) f.s.draw(`${title} tag ${n}`, (p) => r.mark!(p, X0 + 0.19, top - h / 2));
    f.y -= h;
  }
  close();
  f.y -= 0.3;
}

export interface MatRow { tag: string; item: string; color: string; qty: string; basis: string }

const partOf = (p: PartQty) => p.attrs.part ?? p.key.split(".")[0]!;
const qtyText = (x: ShopCtx, p: PartQty) => {
  const n = Number(p.qty);
  if (!Number.isFinite(n)) return p.qty;
  if (p.unit === "ft") return lenText(n * 12, x.fmt);
  return `${Math.round(n * 100) / 100} ${x.t(`mod.gutters.view.u.${p.unit}`)}`;
};
function partRow(x: ShopCtx, m: ShopModel, p: PartQty): MatRow {
  const { t, rules: r } = x, part = partOf(p), { color, ...rest } = p.attrs;
  const tag = part === "end_cap" ? (p.attrs.side === "L" ? "A" : p.attrs.side === "R" ? "B" : "") : "";
  const total = m.chains.reduce((n, c) => n + c.totalIn, 0);
  const basis =
    part === "end_cap" && tag ? sw(t, "b.planTag", { tag })
    : part === "coil" ? sw(t, r.wasteFt > 0 ? "b.coil" : "b.coilNone", { len: lenText(total, x.fmt), ft: r.wasteFt })
    : part === "gutter" ? sw(t, "b.sum")
    : part === "hanger" ? sw(t, r.hangerExtra ? "b.hangerEnds" : "b.hanger", { n: r.hangerSpacingIn })
    : part === "outlet" ? sw(t, "b.perDs")
    : part === "elbow" ? sw(t, "b.sched")
    : part === "ds" ? sw(t, "b.drops")
    : part === "dsstick" ? sw(t, "b.stick", { ft: r.dsStickFt })
    : sw(t, "b.rules");
  // the app names a part by its properties (the estimate's own line); an end cap's hand is said after it
  const { side, ...named } = rest;
  return { tag, item: `${partName(t, { ...p, attrs: named }, x.fmt)}${side ? ` · ${side}` : ""}`, color: color ? attrWord(t, "c", color) : "—", qty: qtyText(x, p), basis };
}
const materials = (x: ShopCtx) => x.parts.filter((p) => p.kind === "material" && Number(p.qty) > 0);

/** the material list: the tagged parts, the corners cut on site (a corner made of a part is the estimate's own row), then the rest of the estimate's parts — each with its basis */
export function materialRows(x: ShopCtx, m: ShopModel): MatRow[] {
  const { t } = x;
  const miters = m.tags.filter((g) => g.kind === "miter" && g.cut > 0).map((g): MatRow => ({ tag: g.tag, item: cap1(sw(t, "miterRow", { kind: kindWord(t, g.cornerKind), deg: g.angleDeg! })), color: "—", qty: `${g.cut} ${t("mod.gutters.view.u.ea")}`, basis: sw(t, "b.cut", { deg: miterCutDeg(g.angleDeg!) }) }));
  const rows = materials(x).map((p) => partRow(x, m, p));
  return [...rows.filter((r) => r.tag), ...miters, ...rows.filter((r) => !r.tag)];
}
/** what is bought: the engine marks a finished length (a gutter made from coil or sections, a downspout made from sticks) as the estimate's only */
export function orderRows(x: ShopCtx, m: ShopModel): MatRow[] {
  return materials(x).filter((p) => p.use !== "estimate").map((p) => partRow(x, m, p));
}

const tagMark = (tag: string) => (p: Part, cx: number, cy: number) => {
  if (!tag) return;
  p.circle([cx, cy], 0.15);
  p.text(tag, cx, cy, TH.sm, { anchor: "c", bold: true, pad: 0 });
};
const MAT_COLS: Col[] = [{ x: X0, w: 0.6 }, { x: X0 + 0.72, w: 4.15 }, { x: 5.75, w: 1.35 }, { x: 8.2, w: 1.0, align: "r", bold: true }, { x: 8.4, w: X1 - 8.4 }];
const matHead = (t: Tr) => [SW(t, "h.tag"), SW(t, "h.item"), SW(t, "h.color"), SW(t, "h.qty"), SW(t, "h.basis")];

/** `first` — the number of the first of these sheets; `of` — sheets in the set (counted by a first pass) */
export function schedulesSheets(x: ShopCtx, m: ShopModel, first: number, of: number): Sheet[] {
  const { t, fmt } = x;
  const f = new Flow((i) => sheetFrame(t, x.job, { sheet: `G-${first + i}`, title: SW(t, "schedTitle"), sub: [SW(t, "sheetOf", { n: first + i, of }), SW(t, "ref", { s: "G-1" })], scale: SW(t, "none") }), 16.2);
  const cont = SW(t, "cont");
  const rows: Row[] = [];
  for (const c of m.chains) {
    c.segs.forEach((sg, i) => rows.push({ cells: [sg.tag, segWord(t, sg), lenText(sg.lengthIn, fmt)], ruleAbove: i === 0 && c.n > 1 }));
    rows.push({ cells: [SW(t, "run", { n: c.n }), sw(t, "subtotal"), lenText(c.totalIn, fmt)], bold: true });
  }
  rows.push({ cells: [SW(t, "totalRow"), "", lenText(m.chains.reduce((n, c) => n + c.totalIn, 0), fmt)], bold: true, ruleAbove: true });
  table(f, `1  ${SW(t, "s1")}`, cont, [{ x: X0, w: 1.0 }, { x: 1.9, w: 6.6 }, { x: X1, w: 1.5, align: "r" }], [SW(t, "h.seg"), SW(t, "h.desc"), SW(t, "h.length")], rows);

  if (m.ds.length) {
    const dsRows: Row[] = m.ds.map((d) => ({ cells: [d.tag, sw(t, "loc", { s: d.seg.tag, d: lenText(d.fromEndIn, fmt) }), dsSizeText(d.size), elbowWord(t, d), offsetWord(t, d), d.dropIn === undefined ? tbd(t) : lenText(d.dropIn, fmt)] }));
    table(f, `2  ${SW(t, "s2")}`, cont, [{ x: X0, w: 0.7 }, { x: 1.55, w: 3.2 }, { x: 4.9, w: 1.0 }, { x: 6.0, w: 1.9 }, { x: 8.0, w: 1.1 }, { x: X1, w: 1.1, align: "r" }], [SW(t, "h.ds"), SW(t, "h.location"), SW(t, "h.size"), SW(t, "h.elbows"), SW(t, "h.offset"), SW(t, "h.drop")], dsRows);
    f.y += 0.22;
    const note = wrap(SW(t, "dsNote"), TH.sm, X1 - X0);
    if (!f.room(note.length * LINE + 0.4)) f.next();
    const y0 = f.y;
    f.s.draw("downspout note", (p) => note.forEach((ln, i) => p.text(ln, X0, y0 - i * LINE, TH.sm)));
    f.y -= note.length * LINE + 0.4;
  }
  const mat = materialRows(x, m);
  table(f, `${m.ds.length ? 3 : 2}  ${SW(t, "s3")}`, cont, MAT_COLS, matHead(t), mat.map((r) => ({ cells: ["", r.item, r.color, r.qty, r.basis], mark: tagMark(r.tag) })), true);
  const note = wrap(SW(t, "matNote"), TH.sm, X1 - X0);
  if (!f.room(note.length * LINE)) f.next();
  const y0 = f.y + 0.2;
  f.s.draw("material note", (p) => note.forEach((ln, i) => p.text(ln, X0, y0 - i * LINE, TH.sm)));
  return f.sheets;
}

/** the order's page: Letter's shape at the drawing's width — printed on Letter it is reduced like the drawings */
export const ORDER_H = (11 * 11) / 8.5;

/** «MATERIAL ORDER» for the supplier: whom, the PO number and the delivery are blanks to fill by hand */
export function orderSheets(x: ShopCtx, m: ShopModel): Sheet[] {
  const { t } = x, rows = orderRows(x, m);
  const build = (of: number) => {
    const f = new Flow((i) => {
      const s = sheetFrame(t, x.job, { sheet: `MO-${i + 1}`, title: SW(t, "orderTitle"), sub: [SW(t, "sheetOf", { n: i + 1, of })], scale: SW(t, "none") }, ORDER_H);
      if (i) return s;
      const top = ORDER_H - B;
      s.draw("order title", (p) => { p.text(SW(t, "orderTitle"), X0, top - 0.5, 0.19, { bold: true }); p.line([X0, top - 0.68], [X1, top - 0.68], { lw: LW.heavy }); });
      const blank = (key: string, v: string | undefined, bx: number, xe: number, y: number) =>
        s.draw(key, (p) => {
          const label = SW(t, key), lx = bx + textW(label, TH.sm) + 0.12;
          p.text(label, bx, y, TH.sm);
          if (v) p.text(wrap(v.toLocaleUpperCase(), TH.sm, xe - lx, true)[0] ?? "", lx, y, TH.sm, { bold: true });
          else p.line([lx, y - 0.07], [xe, y - 0.07], { lw: LW.hair });
        });
      const xm = 6.2;
      blank("o.supplier", undefined, X0, xm - 0.3, top - 1.1); blank("o.po", undefined, xm, X1, top - 1.1);
      blank("o.deliver", x.job.address, X0, xm - 0.3, top - 1.5); blank("o.needed", undefined, xm, X1, top - 1.5);
      blank("o.by", x.job.company.name, X0, xm - 0.3, top - 1.9); blank("date", x.job.date, xm, X1, top - 1.9);
      return s;
    }, ORDER_H - B - 2.5);
    table(f, SW(t, "s3"), SW(t, "cont"), MAT_COLS, ["#", ...matHead(t).slice(1)], rows.map((r, i) => ({ cells: [String(i + 1), r.item, r.color, r.qty, r.basis] })), true);
    const note = wrap(SW(t, "o.note"), TH.sm, X1 - X0);
    if (!f.room(note.length * LINE)) f.next();
    const y0 = f.y + 0.2;
    f.s.draw("order note", (p) => note.forEach((ln, i) => p.text(ln, X0, y0 - i * LINE, TH.sm)));
    return f.sheets;
  };
  return build(build(1).length);
}
