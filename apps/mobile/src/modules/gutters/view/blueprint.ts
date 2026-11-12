/**
 * «Чертёж как на бумаге» (founder 10.11, #739; spec 33 П24.8): the measurement as a drawing sheet — white paper, thin
 * black lines, a dimension line beside every gutter (extension lines, slash ticks, the length over it), the gutter's
 * number in a circle, downspouts «D1», corners «outside 90°», end caps as a tick across the end, and a title block
 * (company, address, date, rough / tape, a scale bar). One sheet for «Просмотр замера», both PDFs and the estimate's
 * page: pure data — the core's attached-page shapes (features/docPages, П24.7), drawn by the core on screen and paper.
 * No prices. Sizes are tokens (drawingPrint), colours are print ink names; the storey is a word («эт 2»), never a colour.
 */
import { drawingPrint as DP } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import type { DocAttachPage, DocPrim } from "@/features/docPages";
import { cornerCut, findCorners, houseSides, runEnds, runLengthIn, type Drawing, type P } from "../geometry";
import { fmtLen, MM_PER_IN, type LenFormat } from "../canvas/format";
import { fitView, storyOf, toScreen } from "../canvas/scene";

type Tr = (key: DictKey, params?: Record<string, string | number>) => string;

export interface SheetStamp {
  company?: string;
  /** the object's address, or the lead's name when there is no address */
  address?: string;
  /** the date as the document shows it (US format) */
  date?: string;
  /** measured roughly (no tape) */
  rough: boolean;
  /** the company's format of lengths (#1092): every length on the sheet is shown in it; feet-inches when not said */
  fmt?: LenFormat;
}

export interface Sheet {
  w: number;
  h: number;
  items: DocPrim[];
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** a text's width in sheet units: the same estimate the canvas uses (labels.ts), no measuring on a server */
const textW = (s: string, fs: number) => Math.ceil(Array.from(s).length * fs * 0.6);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** a nice length for the scale bar: the one of 1, 2, 5 × 10ⁿ feet nearest to `scalePx` on the sheet */
export function scaleBarFt(k: number): number {
  const want = DP.scalePx / (k * 12);
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  return steps.reduce((best, s) => (Math.abs(Math.log(s / want)) < Math.abs(Math.log(best / want)) ? s : best), steps[0]!);
}

/** the scale bar in the company's format (#1092): feet in the US formats, metres (half to a hundred) in the metric ones — inches */
export function scaleBarIn(k: number, fmt: LenFormat = "ftin"): number {
  if (fmt === "m" || fmt === "cm" || fmt === "mm") {
    const want = DP.scalePx / (k * (1000 / MM_PER_IN));
    const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
    const m = steps.reduce((best, s) => (Math.abs(Math.log(s / want)) < Math.abs(Math.log(best / want)) ? s : best), steps[0]!);
    return (m * 1000) / MM_PER_IN;
  }
  return scaleBarFt(k) * 12;
}

/** two gutters whose ends are this close (inches) are one contour: a corner, a bay, a gap for a downspout */
const SAME_CONTOUR_IN = 36;

/**
 * The drawing's contours (#1091): runs joined end to end (or nearly) are one house, the rest stand apart. Indexes into
 * `d.runs`, the biggest contour first; a run is in exactly one. Pure.
 */
export function contours(d: Drawing): number[][] {
  const n = d.runs.length;
  const up = d.runs.map((_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i]!)));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = d.runs[i]!, b = d.runs[j]!;
      if ([a.a, a.b].some((p) => [b.a, b.b].some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= SAME_CONTOUR_IN))) up[find(j)] = find(i);
    }
  const by = new Map<number, number[]>();
  d.runs.forEach((_, i) => by.set(find(i), [...(by.get(find(i)) ?? []), i]));
  const extent = (ix: number[]) => {
    const pts = ix.flatMap((i) => [d.runs[i]!.a, d.runs[i]!.b]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };
  return [...by.values()].sort((x, y) => extent(y) - extent(x) || x[0]! - y[0]!);
}

/** `width`: the sheet's width in its own units — the screen's width on «Просмотр» (the text stays its true size on a
 *  phone), the paper's (sheetW) in a PDF */
export function blueprint(d: Drawing, t: Tr, stamp: SheetStamp, width: number = DP.sheetW): Sheet {
  const W = Math.max(width, DP.sheetW / 3);
  const fmt = stamp.fmt ?? "ftin";
  const m = DP.margin;
  const items: DocPrim[] = [];
  const boxes: Box[] = [];
  const line = (a: [number, number], b: [number, number], sw: number, ink: "ink" | "mut" = "ink") =>
    items.push({ t: "l", x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), sw, ink });
  const text = (x: number, y: number, s: string, fs: number, anchor: "start" | "middle" | "end" = "middle") => {
    items.push({ t: "x", x: r1(x), y: r1(y), s, fs, anchor });
  };
  /** a text on white, in the middle of (x, y); remembered so nothing else lands on it */
  const label = (x: number, y: number, s: string, fs: number) => {
    const w = textW(s, fs) + 4, h = fs * 1.3;
    items.push({ t: "r", x: r1(x - w / 2), y: r1(y - h / 2), w: r1(w), h: r1(h) });
    text(x, y + fs * 0.35, s, fs);
    boxes.push({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
  };
  const boxAt = (x: number, y: number, s: string, fs: number): Box => {
    const w = textW(s, fs) + 4, h = fs * 1.3;
    return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  };
  const free = (b: Box) => !boxes.some((x) => hit(x, b));
  /** a line is an obstacle for the texts (#1091): small boxes along it, so a word never lies on a gutter or a dimension line */
  const obstacle = (a: [number, number], b: [number, number]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / DP.tick));
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n, y = a[1] + ((b[1] - a[1]) * i) / n;
      boxes.push({ x0: x - DP.thinW * 2, y0: y - DP.thinW * 2, x1: x + DP.thinW * 2, y1: y + DP.thinW * 2 });
    }
  };

  // the sheet: the drawing area keeps the drawing's shape (wide house — a low sheet), the title block under it
  const pts = d.runs.flatMap((r) => [r.a, r.b]);
  const inner = W - 2 * m;
  // room around the drawing for the dimension lines and their texts (both sides)
  const pad = DP.dimOff + DP.font * 2.2;
  // one scale for all, unless a contour would come out too small to read next to a big one (#1091): then every contour
  // gets its own panel and its own scale bar
  const all = contours(d);
  const kAll = fitView(pts, { w: inner, h: inner }, pad).k;
  const spanOf = (ix: number[]) => {
    const q = ix.flatMap((i) => [d.runs[i]!.a, d.runs[i]!.b]);
    const x = q.map((v) => v[0]), y = q.map((v) => v[1]);
    return [pts.length ? Math.max(...x) - Math.min(...x) : 1, pts.length ? Math.max(...y) - Math.min(...y) : 1] as const;
  };
  // a tall house gets a tall area, but never taller than the sheet is wide — nor than a page shows at once (a desktop)
  const areaH = (ix: number[]) => {
    const [spanX, spanY] = spanOf(ix);
    return Math.round(Math.min(inner, DP.sheetW * 0.7, Math.max(inner * 0.45, ((inner - 2 * pad) * spanY) / Math.max(spanX, 1) + 2 * pad)));
  };
  const split = all.length > 1 && all.some((g) => Math.max(...spanOf(g)) * kAll < DP.panelMin);
  // contours of one size share a panel and a scale (#1091, the founder's «David Kim» sample): from the biggest down, a
  // contour joins the last panel when, on the scale of them all, the smallest of them is still `panelMin` big
  const panelRuns: number[][] = [];
  if (split) {
    const members: number[][][] = [];
    for (const g of all) {
      const last = members.length - 1;
      if (last >= 0) {
        const u = [...members[last]!.flat(), ...g];
        const k = fitView(u.flatMap((i) => [d.runs[i]!.a, d.runs[i]!.b]), { w: inner, h: areaH(u) }, pad).k;
        if ([...members[last]!, g].every((c) => Math.max(...spanOf(c)) * k >= DP.panelMin)) {
          members[last]!.push(g);
          continue;
        }
      }
      members.push([g]);
    }
    members.forEach((ms) => panelRuns.push(ms.flat()));
  }
  const panels = split ? panelRuns : [d.runs.map((_, i) => i)];
  const panelOf: number[] = [];
  panels.forEach((g, pi) => g.forEach((i) => (panelOf[i] = pi)));
  const titleH = split ? DP.fontSm * 3.4 : 0;
  const drawHs = panels.map((g) => (g.length ? areaH(g) : areaH([])));
  // the frame of a short gutter's inset (#1190) is at most half a narrow sheet wide; a panel that has such a gutter gets a strip
  // under its drawing for it, so the drawing keeps its scale and the frame always has a place
  const iw = Math.min(DP.insetW, Math.max(inner * 0.5, DP.insetW * 0.85)), ih = Math.round((DP.insetH * iw) / DP.insetW);
  // the strip goes on the side of the short gutter: above the drawing when it is in its upper half (the leader stays short)
  const stripTop: boolean[] = [];
  const strip = panels.map((g, pi) => {
    if (!g.length) return 0;
    const v = fitView(g.flatMap((i) => [d.runs[i]!.a, d.runs[i]!.b]), { w: inner, h: drawHs[pi]! }, pad);
    const lens = g.map((i) => runLengthIn(d.runs[i]!) * v.k);
    const at0 = lens.findIndex((l) => l < inner * DP.insetFrac && l * 3 < Math.max(...lens));
    if (at0 < 0) return 0;
    const r0 = d.runs[g[at0]!]!;
    stripTop[pi] = (toScreen(v, r0.a)[1] + toScreen(v, r0.b)[1]) / 2 < drawHs[pi]! / 2;
    return ih + DP.extGap * 3;
  });
  const heights = drawHs.map((h, pi) => h + strip[pi]!);
  const tops: number[] = [];
  let acc = m;
  heights.forEach((h, pi) => {
    tops[pi] = acc;
    acc += titleH + h + (pi < heights.length - 1 ? DP.panelGap : 0);
  });
  const drawH = acc - m;
  // the title block grows with its rows (company, address, how measured, date) — stampH is its least
  const stampRows = [stamp.company, stamp.address, true, stamp.date].filter(Boolean).length;
  const stampH = Math.max(DP.stampH, DP.font * 1.5 * stampRows + DP.font);
  const H = m + drawH + stampH + m;
  const views = panels.map((g, pi) => fitView(g.length ? g.flatMap((i) => [d.runs[i]!.a, d.runs[i]!.b]) : pts, { w: inner, h: drawHs[pi]! }, pad));
  const at = (p: P, pi = 0): [number, number] => {
    const s = toScreen(views[pi]!, p);
    return [s[0] + m, s[1] + tops[pi]! + titleH + (stripTop[pi] ? strip[pi]! : 0)];
  };
  /** the scale bar from (x1, y) to the left: a nice length near scalePx, its ends and middle ticked */
  const scaleBar = (view: (typeof views)[number], x1: number, y: number) => {
    const barIn = scaleBarIn(view.k, fmt);
    const x0 = x1 - barIn * view.k;
    line([x0, y], [x1, y], DP.thinW * 1.5);
    for (const x of [x0, (x0 + x1) / 2, x1]) line([x, y - DP.tick], [x, y + DP.tick], DP.thinW);
    text(x0 - DP.extGap * 2, y + DP.fontSm * 0.35, t("mod.gutters.sheet.scale", { len: fmtLen(barIn, fmt) }), DP.fontSm, "end");
  };

  // a panel's title row (its name and scale bar) is taken: no word or number is put there (#1091)
  if (split) tops.forEach((y0) => boxes.push({ x0: 0, y0: y0 - DP.thinW, x1: W, y1: y0 + titleH }));

  // the frame and the title block's line
  const frame: [number, number][] = [[m / 2, m / 2], [W - m / 2, m / 2], [W - m / 2, H - m / 2], [m / 2, H - m / 2]];
  frame.forEach((p, i) => line(p, frame[(i + 1) % 4]!, DP.thinW));
  const stampY = H - m / 2 - stampH;
  line([m / 2, stampY], [W - m / 2, stampY], DP.thinW);
  if (split)
    panels.forEach((g, pi) => {
      if (pi) line([m / 2, tops[pi]! - DP.panelGap / 2], [W - m / 2, tops[pi]! - DP.panelGap / 2], DP.thinW, "mut");
      const nums = g.map((i) => i + 1);
      const first = nums[0]!, last = nums[nums.length - 1]!;
      text(m, tops[pi]! + DP.fontSm * 1.2, t("mod.gutters.sheet.panel", { n: pi + 1, runs: nums.length > 1 && last - first === nums.length - 1 ? `${first}–${last}` : nums.join(", ") }), DP.fontSm, "start");
      scaleBar(views[pi]!, W - m, tops[pi]! + DP.fontSm * 2.6);
    });

  const sideOf = houseSides(d);
  const stories = new Set(d.runs.map((r) => storyOf(r.attrs.story)));
  const many = stories.size > 1;
  const found = findCorners(d);
  const ends = runEnds(d, found);

  // the gutters: the line itself first (their boxes keep texts off them)
  const geo = d.runs.map((r, i) => {
    const a = at(r.a, panelOf[i]), b = at(r.b, panelOf[i]);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u: [number, number] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    // away from the house on the sheet: plan «right of a→b» is (vy, −vx); y is flipped on the sheet
    const sgn = sideOf(r) === "L" ? 1 : -1;
    const out: [number, number] = [-u[1] * sgn, u[0] * sgn];
    line(a, b, DP.runW);
    obstacle(a, b);
    return { r, n: i + 1, a, b, u, out, L };
  });

  // end caps: a tick across the end
  for (const g of geo) {
    ([0, 1] as const).forEach((e) => {
      if (ends[g.r.id]?.[e]?.kind !== "cap") return;
      const p = e ? g.b : g.a;
      const k = DP.tick * 1.6;
      line([p[0] - g.out[0] * k, p[1] - g.out[1] * k], [p[0] + g.out[0] * k, p[1] + g.out[1] * k], DP.runW / 2);
    });
  }

  // a gutter drawn tiny next to the biggest of its panel is shown in an inset in a big scale (#1190): its dimension line and its
  // corners' words go there, a leader joins it to the gutter. Where there is no room for the frame it stays as it was.
  const panelMax = panels.map((g) => Math.max(0, ...g.map((i) => geo[i]!.L)));
  const tiny = geo.filter((g) => g.L < inner * DP.insetFrac && g.L * 3 < panelMax[panelOf[g.n - 1]!]!);
  const tinySet = new Set(tiny);

  // dimension lines outside the house: extension lines, slash ticks, the length over the line
  const dim = (g: (typeof geo)[number]) => {
    const len = fmtLen(runLengthIn(g.r), fmt);
    const s = many ? `${len} · ${t("mod.gutters.story", { n: storyOf(g.r.attrs.story) })}` : len;
    // the dimension line stands off the gutter by dimOff, one dimStep further each time the text's place is taken; the text
    // may also slide along the line. No place at all — the text goes far out and a leader brings it back to its line (#1091)
    const mid0 = (o: number): [number, number] => [(g.a[0] + g.b[0]) / 2 + g.out[0] * o, (g.a[1] + g.b[1]) / 2 + g.out[1] * o];
    const slide = textW(s, DP.font) / 2 + DP.tick;
    let off = DP.dimOff;
    let tp: [number, number] = [0, 0];
    let found = false;
    for (let k = 0; k < 6 && !found; k++) {
      for (const al of [0, 1, -1, 2, -2]) {
        const m = mid0(DP.dimOff + k * DP.dimStep);
        const c: [number, number] = [m[0] + g.out[0] * DP.font * 0.9 + g.u[0] * al * slide, m[1] + g.out[1] * DP.font * 0.9 + g.u[1] * al * slide];
        if (free(boxAt(c[0], c[1], s, DP.font))) {
          off = DP.dimOff + k * DP.dimStep;
          tp = c;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      const far = mid0(DP.dimOff + 6 * DP.dimStep);
      tp = [far[0] + g.out[0] * DP.font * 0.9, far[1] + g.out[1] * DP.font * 0.9];
      const from = mid0(off);
      line(from, [tp[0] - g.out[0] * DP.font * 0.7, tp[1] - g.out[1] * DP.font * 0.7], DP.thinW, "mut");
    }
    const A: [number, number] = [g.a[0] + g.out[0] * off, g.a[1] + g.out[1] * off];
    const B: [number, number] = [g.b[0] + g.out[0] * off, g.b[1] + g.out[1] * off];
    for (const [p, q] of [[g.a, A], [g.b, B]] as const) {
      line([p[0] + g.out[0] * DP.extGap, p[1] + g.out[1] * DP.extGap], [q[0] + g.out[0] * DP.extGap, q[1] + g.out[1] * DP.extGap], DP.thinW, "mut");
      // a slash tick at 45° across the dimension line (architectural)
      const dx = (g.u[0] + g.out[0]) * DP.tick, dy = (g.u[1] + g.out[1]) * DP.tick;
      line([q[0] - dx, q[1] - dy], [q[0] + dx, q[1] + dy], DP.thinW * 1.5);
    }
    line(A, B, DP.thinW);
    obstacle(A, B);
    label(tp[0], tp[1], s, DP.font);
  };
  for (const g of geo) if (!tinySet.has(g)) dim(g);

  const insetOf = new Set<(typeof geo)[number]>();
  for (const g of tiny) {
    const pi = panelOf[g.n - 1]!;
    const mid: [number, number] = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
    // the free frame nearest to the gutter, inside its panel
    const yTop = tops[pi]! + titleH, yMax = yTop + heights[pi]! - ih;
    let best: Box | null = null;
    let bd = Infinity;
    for (let y = yTop; y <= yMax; y += 8)
      for (let x = m; x <= W - m - iw; x += 8) {
        const b: Box = { x0: x - DP.extGap, y0: y - DP.extGap, x1: x + iw + DP.extGap, y1: y + ih + DP.extGap };
        if (!free(b)) continue;
        const dd = Math.hypot(x + iw / 2 - mid[0], y + ih / 2 - mid[1]);
        if (dd < bd) { bd = dd; best = { x0: x, y0: y, x1: x + iw, y1: y + ih }; }
      }
    if (!best) { dim(g); continue; }
    insetOf.add(g);
    const bx = best;
    boxes.push(bx);
    const hdr = DP.fontSm * 2.2, cap = DP.fontSm * 1.8;
    const rect: [number, number][] = [[bx.x0, bx.y0], [bx.x1, bx.y0], [bx.x1, bx.y1], [bx.x0, bx.y1]];
    rect.forEach((p, i) => line(p, rect[(i + 1) % 4]!, DP.thinW));
    text(bx.x0 + DP.extGap * 2, bx.y0 + hdr * 0.68, `№${g.n}`, DP.fontSm, "start");
    // the gutter along the frame, its ends in order left to right as on the sheet
    const padX = DP.tick * 3;
    const x0 = bx.x0 + padX, x1 = bx.x1 - padX;
    const ly = bx.y0 + hdr + (ih - hdr - cap) * 0.7;
    line([x0, ly], [x1, ly], DP.runW + DP.thinW);
    const dy = DP.dimOff * 0.55;
    for (const x of [x0, x1]) {
      line([x, ly - DP.extGap], [x, ly - dy - DP.extGap], DP.thinW, "mut");
      line([x - DP.tick, ly - dy + DP.tick], [x + DP.tick, ly - dy - DP.tick], DP.thinW * 1.5);
    }
    line([x0, ly - dy], [x1, ly - dy], DP.thinW);
    const lenS = fmtLen(runLengthIn(g.r), fmt);
    const lw = textW(lenS, DP.font) + 4, lh = DP.font * 1.3;
    items.push({ t: "r", x: r1((x0 + x1) / 2 - lw / 2), y: r1(ly - dy - lh * 0.9), w: r1(lw), h: r1(lh) });
    text((x0 + x1) / 2, ly - dy - lh * 0.9 + lh * 0.75, lenS, DP.font);
    // the words of the corners at its ends (left end by its place on the sheet)
    const left = g.a[0] < g.b[0] || (g.a[0] === g.b[0] && g.a[1] <= g.b[1]) ? 0 : 1;
    const words = [0, 1].map((slot) => {
      const e = slot === 0 ? left : 1 - left;
      // the corner of this end: of the corners on this gutter, the one nearest the end
      const end = e === 0 ? g.r.a : g.r.b;
      const f = found.filter((c) => c.runs.some((r) => r.id === g.r.id)).sort((p, q) => Math.hypot(p.at[0] - end[0], p.at[1] - end[1]) - Math.hypot(q.at[0] - end[0], q.at[1] - end[1]))[0];
      if (f && Math.hypot(f.at[0] - (e === 0 ? g.r.b[0] : g.r.a[0]), f.at[1] - (e === 0 ? g.r.b[1] : g.r.a[1])) < Math.hypot(f.at[0] - end[0], f.at[1] - end[1])) return null;
      if (!f) return null;
      const word = t(f.kind === "in" ? "mod.gutters.draw.cornerIn" : f.kind === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");
      return `${word} ${Math.round(cornerCut(d, f, found).angleDeg)}°`;
    });
    words.forEach((wd, slot) => {
      if (!wd) return;
      const ww = textW(wd, DP.fontSm) + 4, wh = DP.fontSm * 1.3;
      const cx = slot === 0 ? x0 + ww / 2 - DP.tick : x1 - ww / 2 + DP.tick;
      const cy = bx.y1 - cap * 0.55;
      items.push({ t: "r", x: r1(cx - ww / 2), y: r1(cy - wh / 2), w: r1(ww), h: r1(wh) });
      text(cx, cy + DP.fontSm * 0.35, wd, DP.fontSm);
    });
    // the leader from the gutter to the frame
    const to: [number, number] = [Math.min(bx.x1, Math.max(bx.x0, mid[0])), Math.min(bx.y1, Math.max(bx.y0, mid[1]))];
    line(mid, to, DP.thinW, "mut");
    obstacle(mid, to);
  }

  // the gutter's number in a circle, on the house side of its middle; where that place is taken (a short run next to
  // another, #1091) — along the gutter and further off the line, the nearest free place
  for (const g of geo) {
    const off = DP.numR + DP.extGap * 2;
    const step = DP.numR * 2 + DP.extGap;
    const place = (along: number, away: number): [number, number] => [(g.a[0] + g.b[0]) / 2 + g.u[0] * along - g.out[0] * away, (g.a[1] + g.b[1]) / 2 + g.u[1] * along - g.out[1] * away];
    const segDist = (c: [number, number], h: (typeof geo)[number]) => {
      const vx = h.b[0] - h.a[0], vy = h.b[1] - h.a[1];
      const t = Math.max(0, Math.min(1, ((c[0] - h.a[0]) * vx + (c[1] - h.a[1]) * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(c[0] - (h.a[0] + t * vx), c[1] - (h.a[1] + t * vy));
    };
    /** free, and this gutter is the nearest one to it: the number never points at its neighbour (#1091) */
    const fits = (c: [number, number]) =>
      free({ x0: c[0] - DP.numR, y0: c[1] - DP.numR, x1: c[0] + DP.numR, y1: c[1] + DP.numR }) && geo.every((h) => h === g || segDist(c, h) > segDist(c, g));
    // near its gutter only: along it no further than the gutter itself reaches (a number beside another gutter points at the
    // wrong one, #1091), and a little further off the line; where nothing is free there, far out with a leader to the gutter
    const reach = Math.max(0, g.L / 2 - DP.numR);
    const near: [number, number][] = [];
    // the house side first, then the other side of the line (a short run in a bend has no room on the house side)
    for (const side of [1, -1]) for (const k of [0, 1, 2, 3]) for (const along of [0, 1, -1, 2, -2, 3, -3]) if (Math.abs(along * step) <= reach) near.push([along * step, side * (off + k * step)]);
    const own = (c: [number, number]) => geo.every((h) => h === g || segDist(c, h) > segDist(c, g));
    let spot = near.map(([al, aw]) => place(al, aw)).find(fits);
    if (!spot) {
      // nowhere near it: the nearest free place all round, still nearest to this gutter, with a leader back to it
      const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2;
      const ring: [number, number][] = [];
      for (let r = off; r <= off + 10 * step; r += 4) for (let deg = 0; deg < 360; deg += 15) ring.push([mx + r * Math.cos((deg * Math.PI) / 180), my + r * Math.sin((deg * Math.PI) / 180)]);
      const last = ring.find(fits) ?? ring.find(own) ?? place(0, off);
      spot = last;
      const lx = last[0] - mx, ly = last[1] - my, ll = Math.hypot(lx, ly) || 1;
      line([mx + (lx / ll) * DP.extGap, my + (ly / ll) * DP.extGap], [last[0] - (lx / ll) * DP.numR, last[1] - (ly / ll) * DP.numR], DP.thinW, "mut");
    }
    items.push({ t: "c", cx: r1(spot[0]), cy: r1(spot[1]), r: DP.numR, sw: DP.thinW, fill: "paper" });
    text(spot[0], spot[1] + DP.fontSm * 0.35, String(g.n), DP.fontSm);
    boxes.push({ x0: spot[0] - DP.numR, y0: spot[1] - DP.numR, x1: spot[0] + DP.numR, y1: spot[1] + DP.numR });
  }

  // downspouts: a circle on the gutter, «D1» on the house side, moved along if the place is taken
  const byId = new Map(geo.map((g) => [g.r.id, g]));
  d.downspouts.forEach((s, i) => {
    const g = byId.get(s.runId);
    if (!g) return;
    const f = Math.min(1, Math.max(0, s.atIn / (runLengthIn(g.r) || 1)));
    const p: [number, number] = [g.a[0] + (g.b[0] - g.a[0]) * f, g.a[1] + (g.b[1] - g.a[1]) * f];
    items.push({ t: "c", cx: r1(p[0]), cy: r1(p[1]), r: DP.dsR, sw: DP.thinW * 1.5, fill: "paper" });
    const name = t("mod.gutters.ds", { n: i + 1 });
    const off = DP.dsR + DP.fontSm;
    let q: [number, number] = [p[0] - g.out[0] * off, p[1] - g.out[1] * off];
    for (const along of [0, 1, -1, 2, -2]) {
      const c2: [number, number] = [p[0] - g.out[0] * off + g.u[0] * along * DP.fontSm * 2, p[1] - g.out[1] * off + g.u[1] * along * DP.fontSm * 2];
      if (free(boxAt(c2[0], c2[1], name, DP.fontSm))) {
        q = c2;
        break;
      }
    }
    label(q[0], q[1], name, DP.fontSm);
  });

  // corners: «outside 90°» inside the angle
  for (const f of found) {
    if (f.runs.some((r) => insetOf.has(byId.get(r.id)!))) continue; // its word is in the inset
    const p = at(f.at, panelOf[d.runs.findIndex((x) => x.id === f.runs[0].id)]);
    const ga = byId.get(f.runs[0].id), gb = byId.get(f.runs[1].id);
    if (!ga || !gb) continue;
    const dir: [number, number] = [-(ga.out[0] + gb.out[0]), -(ga.out[1] + gb.out[1])];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const word = t(f.kind === "in" ? "mod.gutters.draw.cornerIn" : f.kind === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");
    const s = `${word} ${Math.round(cornerCut(d, f, found).angleDeg)}°`;
    const w = textW(s, DP.fontSm) / 2 + DP.numR;
    // the nearest free place round the corner: inside the angle first, then the sides, nearer before farther (#1091)
    const ux = dir[0] / dl, uy = dir[1] / dl;
    const tries: [number, number][] = [];
    for (const r of [1, 1.5, 2, 2.6, 3.4]) for (const turn of [0, 35, -35, 70, -70, 110, -110, 150, -150, 180]) {
      const c = Math.cos((turn * Math.PI) / 180), sn = Math.sin((turn * Math.PI) / 180);
      tries.push([p[0] + (ux * c - uy * sn) * w * r, p[1] + (ux * sn + uy * c) * w * r]);
    }
    let q = tries.find((c) => free(boxAt(c[0], c[1], s, DP.fontSm))) ?? tries[tries.length - 1]!;
    // a word that had to move far from its corner keeps a thin leader to it
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) > w * 1.6) {
      const lx = q[0] - p[0], ly = q[1] - p[1], ll = Math.hypot(lx, ly) || 1;
      line([p[0] + (lx / ll) * DP.numR, p[1] + (ly / ll) * DP.numR], [q[0] - (lx / ll) * Math.min(textW(s, DP.fontSm) / 2, ll / 2), q[1] - (ly / ll) * DP.fontSm * 0.65], DP.thinW, "mut");
    }
    label(q[0], q[1], s, DP.fontSm);
  }

  // the title block, a row each (a phone is narrow): company, address, how it was measured; the date and the scale bar
  const rows = [stamp.company && { s: stamp.company, fs: DP.font }, stamp.address && { s: stamp.address, fs: DP.fontSm }, { s: t(stamp.rough ? "mod.gutters.view.rough" : "mod.gutters.sheet.tape"), fs: DP.fontSm }].filter(Boolean) as { s: string; fs: number }[];
  let y = stampY + DP.font * 1.5;
  for (const r of rows) {
    text(m, y, r.s, r.fs, "start");
    y += r.fs * 1.5;
  }
  if (stamp.date) text(m, y, stamp.date, DP.fontSm, "start");
  // the scale bar on the date's row, right (one scale for the sheet); with panels each has its own, under its title
  if (!split) scaleBar(views[0]!, W - m, y - DP.fontSm * 0.3);

  return { w: W, h: Math.round(H), items };
}

/** the sheet as an attached page of the estimate (P4b-2) or of a PDF: the core draws it */
export const sheetPage = (id: string, title: string, s: Sheet): DocAttachPage => ({ id, title, w: s.w, h: s.h, items: s.items });
