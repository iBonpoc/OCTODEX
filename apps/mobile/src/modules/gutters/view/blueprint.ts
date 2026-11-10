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
import { centre, cornerCut, findCorners, houseSide, runEnds, runLengthIn, type Drawing, type P } from "../geometry";
import { fmtLen } from "../canvas/format";
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

/** `width`: the sheet's width in its own units — the screen's width on «Просмотр» (the text stays its true size on a
 *  phone), the paper's (sheetW) in a PDF */
export function blueprint(d: Drawing, t: Tr, stamp: SheetStamp, width: number = DP.sheetW): Sheet {
  const W = Math.max(width, DP.sheetW / 3);
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

  // the sheet: the drawing area keeps the drawing's shape (wide house — a low sheet), the title block under it
  const pts = d.runs.flatMap((r) => [r.a, r.b]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const spanX = pts.length ? Math.max(...xs) - Math.min(...xs) : 1;
  const spanY = pts.length ? Math.max(...ys) - Math.min(...ys) : 1;
  const inner = W - 2 * m;
  // room around the drawing for the dimension lines and their texts (both sides)
  const pad = DP.dimOff + DP.font * 2.2;
  // a tall house gets a tall area, but never taller than the sheet is wide — nor than a page shows at once (a desktop)
  const drawH = Math.round(Math.min(inner, DP.sheetW * 0.7, Math.max(inner * 0.45, ((inner - 2 * pad) * spanY) / Math.max(spanX, 1) + 2 * pad)));
  // the title block grows with its rows (company, address, how measured, date) — stampH is its least
  const stampRows = [stamp.company, stamp.address, true, stamp.date].filter(Boolean).length;
  const stampH = Math.max(DP.stampH, DP.font * 1.5 * stampRows + DP.font);
  const H = m + drawH + stampH + m;
  const view = fitView(pts, { w: inner, h: drawH }, pad);
  const at = (p: P): [number, number] => {
    const s = toScreen(view, p);
    return [s[0] + m, s[1] + m];
  };

  // the frame and the title block's line
  const frame: [number, number][] = [[m / 2, m / 2], [W - m / 2, m / 2], [W - m / 2, H - m / 2], [m / 2, H - m / 2]];
  frame.forEach((p, i) => line(p, frame[(i + 1) % 4]!, DP.thinW));
  const stampY = H - m / 2 - stampH;
  line([m / 2, stampY], [W - m / 2, stampY], DP.thinW);

  const c = centre(d.runs);
  const stories = new Set(d.runs.map((r) => storyOf(r.attrs.story)));
  const many = stories.size > 1;
  const found = findCorners(d);
  const ends = runEnds(d, found);

  // the gutters: the line itself first (their boxes keep texts off them)
  const geo = d.runs.map((r, i) => {
    const a = at(r.a), b = at(r.b);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u: [number, number] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    // away from the house on the sheet: plan «right of a→b» is (vy, −vx); y is flipped on the sheet
    const sgn = houseSide(r, c) === "L" ? 1 : -1;
    const out: [number, number] = [-u[1] * sgn, u[0] * sgn];
    line(a, b, DP.runW);
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

  // dimension lines outside the house: extension lines, slash ticks, the length over the line
  for (const g of geo) {
    const len = fmtLen(runLengthIn(g.r), g.r.unit);
    const s = many ? `${len} · ${t("mod.gutters.story", { n: storyOf(g.r.attrs.story) })}` : len;
    let off = DP.dimOff;
    let tp: [number, number] = [0, 0];
    for (let k = 0; k < 4; k++, off += DP.dimStep) {
      const mid: [number, number] = [(g.a[0] + g.b[0]) / 2 + g.out[0] * off, (g.a[1] + g.b[1]) / 2 + g.out[1] * off];
      tp = [mid[0] + g.out[0] * DP.font * 0.9, mid[1] + g.out[1] * DP.font * 0.9];
      if (free(boxAt(tp[0], tp[1], s, DP.font))) break;
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
    label(tp[0], tp[1], s, DP.font);
  }

  // the gutter's number in a circle, on the house side of its middle
  for (const g of geo) {
    const off = DP.numR + DP.extGap * 2;
    const p: [number, number] = [(g.a[0] + g.b[0]) / 2 - g.out[0] * off, (g.a[1] + g.b[1]) / 2 - g.out[1] * off];
    items.push({ t: "c", cx: r1(p[0]), cy: r1(p[1]), r: DP.numR, sw: DP.thinW, fill: "paper" });
    text(p[0], p[1] + DP.fontSm * 0.35, String(g.n), DP.fontSm);
    boxes.push({ x0: p[0] - DP.numR, y0: p[1] - DP.numR, x1: p[0] + DP.numR, y1: p[1] + DP.numR });
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
    const p = at(f.at);
    const ga = byId.get(f.runs[0].id), gb = byId.get(f.runs[1].id);
    if (!ga || !gb) continue;
    const dir: [number, number] = [-(ga.out[0] + gb.out[0]), -(ga.out[1] + gb.out[1])];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const word = t(f.kind === "in" ? "mod.gutters.draw.cornerIn" : f.kind === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");
    const s = `${word} ${Math.round(cornerCut(d, f, found).angleDeg)}°`;
    const w = textW(s, DP.fontSm) / 2 + DP.numR;
    let q: [number, number] = [p[0] + (dir[0] / dl) * w, p[1] + (dir[1] / dl) * w];
    for (let k = 1; k < 4 && !free(boxAt(q[0], q[1], s, DP.fontSm)); k++) q = [p[0] + (dir[0] / dl) * w * (1 + k * 0.6), p[1] + (dir[1] / dl) * w * (1 + k * 0.6)];
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
  // the scale bar on the date's row, right: a nice length near scalePx, its ends and middle ticked
  const ft = scaleBarFt(view.k);
  const bw = ft * 12 * view.k;
  const bx1 = W - m, bx0 = bx1 - bw, by = y - DP.fontSm * 0.3;
  line([bx0, by], [bx1, by], DP.thinW * 1.5);
  for (const x of [bx0, (bx0 + bx1) / 2, bx1]) line([x, by - DP.tick], [x, by + DP.tick], DP.thinW);
  text(bx0 - DP.extGap * 2, by + DP.fontSm * 0.35, t("mod.gutters.sheet.scale", { len: fmtLen(ft * 12) }), DP.fontSm, "end");

  return { w: W, h: Math.round(H), items };
}

/** the sheet as an attached page of the estimate (P4b-2) or of a PDF: the core draws it */
export const sheetPage = (id: string, title: string, s: Sheet): DocAttachPage => ({ id, title, w: s.w, h: s.h, items: s.items });
