/**
 * Sheet «GUTTER LAYOUT PLAN» of one storey (#1349): the plan to a standard architectural scale — the gutter as a band
 * of its true width (heavy = the back at the fascia, thin = the front face, gray between), dimensions on the outside,
 * an angle at every corner, tags — then the section, the notes and the legend (lower.ts). No tables here.
 * What is fixed is drawn first; every label then takes the first free place of its candidates (Sheet.place).
 */
import type { P } from "../../geometry";
import { dimAligned, dimAngle, dir, left, norm, turn } from "./dim";
import { BAND_Y, L, R, T, bubble, sheetFrame } from "./frame";
import { SW, lenText, type ShopCtx } from "./job";
import { lowerBand } from "./lower";
import type { ShopChain, ShopModel, ShopSeg } from "./model";
import { LW, TH, V, ngon, textW, type Part, type Pt, type Sheet } from "./sheet";

/** standard architectural scales, the largest first: inches of the house in an inch of paper */
export const SCALES: { k: number; name: string }[] = [
  { k: 48, name: '1/4" = 1\'-0"' }, { k: 64, name: '3/16" = 1\'-0"' }, { k: 96, name: '1/8" = 1\'-0"' }, { k: 128, name: '3/32" = 1\'-0"' },
  { k: 192, name: '1/16" = 1\'-0"' }, { k: 384, name: '1/32" = 1\'-0"' }, { k: 768, name: '1/64" = 1\'-0"' },
];
/** the view title's line, the plan's field and the room its dimensions need round the gutters */
const VT = { x: 0.8, y: 7.2 };
const AREA = { x0: L + 0.2, x1: R - 0.2, y0: 7.42, y1: T - 0.07 }, ROOM = 0.72;
/** a dimension line stands this far from the gutter's back: «FACE» and its arrow fit between */
const DIM_OFF = 0.55;

export function pickScale(wIn: number, hIn: number) {
  return SCALES.find((s) => wIn / s.k + 2 * ROOM <= AREA.x1 - AREA.x0 && hIn / s.k + 2 * ROOM <= AREA.y1 - AREA.y0) ?? SCALES[SCALES.length - 1]!;
}

function* around(pref: Pt, dists: number[]): Generator<Pt> {
  for (const a of [0, 22.5, -22.5, 45, -45, 67.5, -67.5, 90, -90, 112.5, -112.5, 135, -135, 157.5, -157.5, 180])
    for (const d of dists) yield V.mul(turn(norm(pref), a), d);
}

export function planSheet(x: ShopCtx, m: ShopModel, story: number, no: { sheet: string; n: number; of: number; schedules: string }): Sheet {
  const { t, fmt } = x;
  const chains = m.chains.filter((c) => c.story === story);
  const pts = chains.flatMap((c) => c.segs.flatMap((s) => [s.a, s.b]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = pickScale(maxX - minX, maxY - minY);
  const cx = (AREA.x0 + AREA.x1) / 2, cy = (AREA.y0 + AREA.y1) / 2;
  const tp = (p: P): Pt => [cx + (p[0] - (minX + maxX) / 2) / sc.k, cy + (p[1] - (minY + maxY) / 2) / sc.k];

  const s = sheetFrame(t, x.job, { sheet: no.sheet, title: SW(t, "planTitle"), sub: [SW(t, "sheetOf", { n: no.n, of: no.of }), SW(t, "notForPermit")], scale: SW(t, "asNoted") });
  const detail = "A";

  // ---- the view's title and the graphic scale (it is reduced with the sheet: true on Letter too)
  s.draw("view title", (p) => {
    const title = `${SW(t, "planTitle")} — ${SW(t, "level", { n: story })}`, tx = VT.x + 0.62;
    bubble(p, VT.x + 0.24, VT.y, String(no.n), no.sheet);
    p.text(title, tx, VT.y + 0.09, 0.16, { bold: true });
    p.line([tx, VT.y - 0.04], [Math.max(5.6, tx + textW(title, 0.16, true)), VT.y - 0.04], { lw: LW.heavy });
    p.text(SW(t, "scaleIs", { s: sc.name }), tx, VT.y - 0.18, TH.sm);
  });
  s.draw("graphic scale", (p) => {
    const gx = 6.55, gy = VT.y - 0.16;
    const total = [8, 16, 20, 40, 80, 120, 160, 240, 320, 640, 1280].filter((ft) => (ft * 12) / sc.k <= 3.8).pop() ?? 8;
    const marks = [0, total / 4, total / 2, total];
    marks.slice(1).forEach((b, i) => p.rect(gx + (marks[i]! * 12) / sc.k, gy, gx + (b * 12) / sc.k, gy + 0.07, { fill: i % 2 === 0 ? "ink" : "none", lw: LW.thin }));
    for (const v of marks) p.text(v ? `${v}'` : "0", gx + (v * 12) / sc.k, gy + 0.19, TH.sm, { anchor: "c" });
  });
  s.draw("band rule", (p) => p.line([L, BAND_Y], [R, BAND_Y], { lw: LW.med }));
  lowerBand(s, x, m, story, { sheet: no.sheet, detail, schedules: no.schedules });

  // ---- the gutters: a band of true width
  const geo = chains.map((c) => chainGeo(c, tp, sc.k));
  for (const g of geo) {
    s.draw(`run ${g.chain.n}`, (p) => {
      p.poly([...g.back, ...[...g.face].reverse()], { close: true, fill: "gray", lw: 0, ghost: true });
      p.poly(g.face, { lw: LW.thin });
      p.poly(g.back, { lw: LW.gutter });
      if (!g.closed) { p.line(g.back[0]!, g.face[0]!); p.line(g.back[g.back.length - 1]!, g.face[g.face.length - 1]!); }
      g.chain.segs.forEach((sg, i) => sg.ends.forEach((e, k) => {
        const at = k ? g.back[i + 1]! : g.back[i]!;
        if (e.kind === "cap") { const n = left(g.u[i]!); p.line(V.sub(at, V.mul(n, 0.08)), V.add(at, V.mul(n, 0.08)), { lw: LW.heavy, ghost: true }); }
        if (e.tag && (e.kind === "cap" || k === 1)) p.circle(at, 0.035, { lw: LW.med, solid: false });
      }));
    });
  }
  // ---- outlets (a square with an X in the band)
  const dsHere = m.ds.filter((d) => d.seg.story === story);
  const outletAt = (d: (typeof dsHere)[number]) => {
    const g = geo.find((q) => q.chain.segs.includes(d.seg))!, i = g.chain.segs.indexOf(d.seg);
    return { g, i, c: V.add(tp(d.at), V.mul(g.fn[i]!, d.seg.widthIn / 2 / sc.k)) };
  };
  for (const d of dsHere) {
    s.draw(`${d.tag} outlet`, (p) => {
      const { c } = outletAt(d), h = 0.055;
      p.rect(c[0] - h, c[1] - h, c[0] + h, c[1] + h, { lw: LW.ttlb, fill: "paper", ghost: true });
      p.line([c[0] - h, c[1] - h], [c[0] + h, c[1] + h], { ghost: true }).line([c[0] - h, c[1] + h], [c[0] + h, c[1] - h], { ghost: true });
    });
  }
  // ---- dimensions, on the outside of the run
  for (const g of geo) g.chain.segs.forEach((sg, i) => {
    s.place(`dim ${sg.tag}`, [DIM_OFF, DIM_OFF + 0.32, DIM_OFF + 0.64].map((off) => (p: Part) => dimAligned(p, g.back[i]!, g.back[i + 1]!, g.fn[i]!, off, lenText(sg.lengthIn, fmt))));
  });
  // ---- an angle at every corner
  for (const g of geo) g.chain.segs.forEach((sg, i) => {
    const e = sg.ends[1], n = g.chain.segs.length;
    if (e.kind !== "corner" || (i + 1 >= n && !g.closed)) return;
    const c = g.back[i + 1]!, p1 = g.back[i]!, p2 = i + 1 < n ? g.back[i + 2]! : g.back[1]!;
    const reach = Math.min(V.len(V.sub(p1, c)), V.len(V.sub(p2, c)));
    s.place(`angle at ${sg.tag}`, [0.34, 0.5, 0.68, 0.86].filter((r, k) => k === 0 || r < reach).map((r) => (p: Part) => dimAngle(p, c, p2, p1, Math.min(r, reach * 0.8), `${e.angleDeg}°`)));
  });
  // ---- segment numbers, boxed, on the house side
  for (const g of geo) g.chain.segs.forEach((sg, i) => {
    const hn = V.mul(g.fn[i]!, -1), w = textW(sg.tag, TH.sm, true) / 2 + 0.06, h = TH.sm / 2 + 0.05;
    s.place(`segment ${sg.tag}`, [0.3, 0.5, 0.7, 0.9].flatMap((d) => [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82].map((f) => (p: Part) => {
      const c = V.add(V.lerp(g.back[i]!, g.back[i + 1]!, f), V.mul(hn, d));
      p.solid([[c[0] - w, c[1] - h], [c[0] + w, c[1] - h], [c[0] + w, c[1] + h], [c[0] - w, c[1] + h]]);
      p.text(sg.tag, c[0], c[1], TH.sm, { anchor: "c", bold: true, pad: 0 });
    })));
  });
  // ---- downspout tags
  for (const d of dsHere) {
    const { g, i, c } = outletAt(d);
    const toMid = norm(V.sub(V.lerp(g.back[i]!, g.back[i + 1]!, 0.5), c));
    const r = Math.max(0.2, textW(d.tag, TH.sm, true) / 2 + 0.05);
    s.place(`${d.tag} tag`, [...around(V.add(V.mul(g.fn[i]!, -0.9), V.mul(toMid, 0.4)), [0.65, 0.9, 1.15])].map((o) => (p: Part) => {
      const tc = V.add(c, o), v = norm(o);
      p.line(V.add(c, V.mul(v, 0.08)), V.sub(tc, V.mul(v, r * 0.87)));
      p.solid(ngon(tc, r, 6, 30));
      p.text(d.tag, tc[0], tc[1], TH.sm, { anchor: "c", bold: true, pad: 0 });
    }));
  }
  // ---- tags of end caps and miters
  const tagAt = (what: string, at: Pt, key: string, pref: Pt) =>
    s.place(what, [...around(pref, [0.65, 0.85, 1.05])].map((o) => (p: Part) => {
      const tc = V.add(at, o), v = norm(o), r = 0.16;
      p.line(V.add(at, V.mul(v, 0.04)), V.sub(tc, V.mul(v, r)));
      p.circle(tc, r);
      p.text(key, tc[0], tc[1], TH.body, { anchor: "c", bold: true, pad: 0 });
    }));
  for (const g of geo) g.chain.segs.forEach((sg, i) => sg.ends.forEach((e, k) => {
    if (!e.tag) return;
    const hn = V.mul(g.fn[i]!, -1);
    if (e.kind === "cap") tagAt(`cap ${sg.tag}`, k ? g.back[i + 1]! : g.back[i]!, e.tag, V.add(V.mul(hn, 0.9), V.mul(g.u[i]!, k ? 0.4 : -0.4)));
    else if (k === 1) { const j = (i + 1) % g.chain.segs.length; tagAt(`miter ${sg.tag}`, g.back[i + 1]!, e.tag, V.add(hn, V.mul(g.fn[j]!, -1))); }
  }));
  // ---- the section mark: on the longest gutter, a level one first
  const order = geo.flatMap((g) => g.chain.segs.map((sg, i) => ({ g, i, sg }))).sort((a, b) => (Math.abs(b.g.u[b.i]![0]) > 0.9 ? 1 : 0) - (Math.abs(a.g.u[a.i]![0]) > 0.9 ? 1 : 0) || b.sg.lengthIn - a.sg.lengthIn);
  s.place("section mark", order.flatMap(({ g, i }) => [0.32, 0.68, 0.5, 0.2, 0.8].flatMap((f) => [1, -1].map((side) => (p: Part) => {
    const u = g.u[i]!, hn = V.mul(g.fn[i]!, -1), mm = V.lerp(g.back[i]!, g.back[i + 1]!, f), r = 0.24;
    const e = V.add(mm, V.mul(hn, 0.32)), c = V.add(mm, V.mul(hn, 0.32 + r + 0.02));
    p.line(V.sub(mm, V.mul(hn, 0.18)), e, { lw: LW.heavy });
    p.poly([V.add(e, V.mul(u, 0.03)), V.add(e, V.mul(u, 0.19)), V.add(V.add(e, V.mul(u, 0.03)), V.mul(hn, -0.08))], { close: true, fill: "ink", lw: 0, ghost: true });
    bubble(p, c[0], c[1], detail, no.sheet, r);
    p.text(SW(t, "section", { a: detail }), c[0] + side * (r + 0.08), c[1], TH.sm, { bold: true, anchor: side > 0 ? "l" : "r" });
  }))));
  // ---- «FACE»: which way the front face looks, once a run
  for (const g of geo) {
    const byLen = g.chain.segs.map((sg, i) => ({ sg, i })).sort((a, b) => b.sg.lengthIn - a.sg.lengthIn);
    const word = SW(t, "face");
    s.place(`face of run ${g.chain.n}`, byLen.flatMap(({ i }) => [0.7, 0.3, 0.5, 0.85, 0.15].flatMap((f) => [1, -1].map((side) => (p: Part) => {
      const fn = g.fn[i]!, u = g.u[i]!, mm = V.lerp(g.back[i]!, g.back[i + 1]!, f), w = 0.04;
      const s0 = V.add(mm, V.mul(fn, 0.1)), s1 = V.add(mm, V.mul(fn, 0.36)), tip = V.add(mm, V.mul(fn, 0.46));
      p.line(s0, s1);
      p.poly([tip, V.add(s1, V.mul(u, w)), V.sub(s1, V.mul(u, w))], { close: true, fill: "ink", lw: 0, ghost: true });
      const c = V.lerp(s0, tip, 0.5);
      if (Math.abs(fn[0]) > 0.9) p.text(word, c[0], c[1] + side * (TH.sm / 2 + 0.05), TH.sm, { anchor: "c", pad: 0.005 });
      else p.text(word, c[0] + side * 0.07, c[1], TH.sm, { anchor: side > 0 ? "l" : "r", pad: 0.005 });
    }))));
  }
  // ---- run labels, inside the building
  for (const g of geo) {
    const byLen = g.chain.segs.map((sg, i) => ({ sg, i })).sort((a, b) => b.sg.lengthIn - a.sg.lengthIn);
    s.place(`label of run ${g.chain.n}`, byLen.flatMap(({ i }) => [1.4, 1.1, 1.75, 0.9].flatMap((d) => [0.5, 0.38, 0.62, 0.25, 0.75].map((f) => (p: Part) => {
      const c = V.add(V.lerp(g.back[i]!, g.back[i + 1]!, f), V.mul(g.fn[i]!, -d));
      p.text(SW(t, "run", { n: g.chain.n }), c[0], c[1] + 0.12, 0.15, { anchor: "c", bold: true });
      p.text(SW(t, "total", { len: lenText(g.chain.totalIn, fmt) }), c[0], c[1] - 0.12, TH.sm, { anchor: "c" });
    }))));
  }
  // ---- the building, nearest to the middle of the gutters
  const all = geo.flatMap((g) => g.back), mid: Pt = [all.reduce((n, p) => n + p[0], 0) / all.length, all.reduce((n, p) => n + p[1], 0) / all.length];
  const ring: Pt[] = [[0, 0]];
  for (let r = 0.4; r <= 4; r += 0.4) for (let a = 0; a < 360; a += 30) ring.push(V.mul(dir(a), r));
  s.place("building", ring.map((o) => (p: Part) => {
    p.text(SW(t, "building"), mid[0] + o[0], mid[1] + o[1] + 0.12, 0.14, { anchor: "c", bold: true });
    p.text(SW(t, "roofAbove"), mid[0] + o[0], mid[1] + o[1] - 0.12, TH.sm, { anchor: "c" });
  }));
  return s;
}

interface ChainGeo { chain: ShopChain; closed: boolean; back: Pt[]; face: Pt[]; u: Pt[]; fn: Pt[] }

/** a run on paper: its back line, its face line (mitered at the corners), each segment's direction and face normal */
function chainGeo(chain: ShopChain, tp: (p: P) => Pt, k: number): ChainGeo {
  const segs = chain.segs, n = segs.length;
  const back = [...segs.map((s) => tp(s.a)), tp(segs[n - 1]!.b)];
  const closed = n > 2 && V.len(V.sub(back[0]!, back[n]!)) < 0.01;
  const u = segs.map((_, i) => V.unit(back[i]!, back[i + 1]!));
  // the house on the left → the face on the right
  const fn = segs.map((s: ShopSeg, i) => (s.house === "L" ? V.mul(left(u[i]!), -1) : left(u[i]!)));
  const off = segs.map((s, i) => [V.add(back[i]!, V.mul(fn[i]!, s.widthIn / k)), V.add(back[i + 1]!, V.mul(fn[i]!, s.widthIn / k))] as [Pt, Pt]);
  const meet = (i: number, j: number): Pt => {
    const [p1, p2] = off[i]!, [q1, q2] = off[j]!, d1 = V.sub(p2, p1), d2 = V.sub(q2, q1), den = V.cross(d1, d2);
    if (Math.abs(den) < 1e-9) return p2;
    return V.add(p1, V.mul(d1, V.cross(V.sub(q1, p1), d2) / den));
  };
  const face: Pt[] = [closed ? meet(n - 1, 0) : off[0]![0]];
  for (let i = 0; i + 1 < n; i++) face.push(meet(i, i + 1));
  face.push(closed ? face[0]! : off[n - 1]![1]);
  if (closed) { back.pop(); face.pop(); back.push(back[0]!); face.push(face[0]!); }
  return { chain, closed, back, face, u, fn };
}
