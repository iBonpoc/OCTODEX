/** The lower band of the plan sheet (#1349): the typical gutter section (3" = 1'-0"), the general notes, the legend. */
import { dimAligned } from "./dim";
import { BAND_Y, R, TBT, bubble, header } from "./frame";
import { SW, attrWord, dsSizeText, type ShopCtx, type Tr } from "./job";
import { miterCutDeg, type ShopDs, type ShopModel, type ShopSeg } from "./model";
import { LW, TH, ngon, wrap, type Part, type Pt, type Sheet } from "./sheet";

const TOP = BAND_Y - 0.3;
/** a line of the smallest text and the room under it */
const LINE = 0.2;
const LEGEND_X = 7.8;

const uniq = (xs: string[]) => [...new Set(xs)];
/** the gutters' stock as measured: «K-STYLE 5", .032", ALUMINUM, BLACK»; several kinds — each */
export const gutterStock = (t: Tr, segs: ShopSeg[]) =>
  uniq(segs.map(({ run: { attrs: a } }) => [`${attrWord(t, "p", String(a.profile))} ${a.size}"`, a.gauge ? `${a.gauge}"` : "", a.material ? attrWord(t, "m", String(a.material)) : "", a.color ? attrWord(t, "c", String(a.color)) : ""].filter(Boolean).join(", "))).join("; ");
export const dsStock = (t: Tr, ds: ShopDs[]) =>
  uniq(ds.map((d) => [dsSizeText(d.size), d.material ? attrWord(t, "m", d.material) : "", d.color ? attrWord(t, "c", d.color) : ""].filter(Boolean).join(", "))).join("; ");

export function lowerBand(s: Sheet, x: ShopCtx, m: ShopModel, story: number, no: { sheet: string; detail: string; schedules: string }) {
  const segs = m.chains.filter((c) => c.story === story).flatMap((c) => c.segs);
  // the section shows the storey's widest gutter (its size is on the sheet; the others are in the schedule)
  section(s, x.t, Math.max(...segs.map((g) => g.widthIn)), no);
  const under = legend(s, x.t, no);
  notes(s, x, m, story, no.schedules, under);
}

/** the section through the eave: fascia, rafter, sheathing, shingles, the flashing's leg INSIDE the gutter, the gutter's
 *  straight back tucked UNDER it, the front lip with its hem. A schematic of a K profile, stretched to the gutter's
 *  width; its depth is not measured by the app — «VERIFY», never a guessed number. */
function section(s: Sheet, t: Tr, W: number, no: { sheet: string; detail: string }) {
  const Dp = W * 0.8;
  const ox = 1.5, oy = 4.05, K = 4; // 3" = 1'-0": four inches of the eave in an inch of paper
  const D = (px: number, py: number): Pt => [ox + px / K, oy + py / K];
  const kx = W / 5, ky = Dp / 4; // the gutter's own points follow its size; the eave's stay
  const sb = (px: number) => 5 * ky + (0.25 - px) / 3; // the sheathing's underside, 4:12
  const st = (px: number) => sb(px) + 0.53;
  const ft = (px: number) => st(px) + 0.03;
  const s0 = (px: number) => ft(px) + 0.05;
  const map = (ps: Pt[]) => ps.map(([px, py]) => D(px, py));
  s.draw("section", (p) => {
    p.poly(map([[-1.5, 0.3], [-1.5, sb(-1.5)], [-3.1, sb(-3.1)], [-3.1, 0.3 + 1.6 / 3]]), { close: true, lw: LW.med });
    const fb = map([[-1.5, -2.4], [0, -2.4], [0, sb(0)], [-1.5, sb(-1.5)]]);
    p.hatch(fb, "ansi31", 0.05, `fascia-${no.sheet}`).poly(fb, { close: true, lw: LW.ttlb });
    const sh = map([[0.25, sb(0.25)], [0.25, st(0.25)], [-3.1, st(-3.1)], [-3.1, sb(-3.1)]]);
    p.hatch(sh, "ansi37", 0.035, `sheath-${no.sheet}`).poly(sh, { close: true, lw: LW.med });
    p.poly(map([[-3.1, s0(-3.1)], [0.8, s0(0.8)], [0.8, s0(0.8) + 0.28], [-3.1, s0(-3.1) + 0.28]]), { close: true, lw: LW.med });
    p.poly(map([[-2.6, ft(-2.6)], [0.32, ft(0.32)], [0.32, 3.15 * ky], [0.6, 2.9 * ky]]), { lw: LW.gutter });
    const prof: Pt[] = [[0, 4.0], [0, 0], [3.25, 0], [3.55, 0.45], [3.55, 1.6], [4.25, 2.1], [4.55, 2.55], [4.55, 3.45], [5.0, 3.9], [5.0, 4.0], [4.65, 4.0]];
    p.poly(map(prof.map(([px, py]) => [px * kx, py * ky] as Pt)), { lw: LW.gutter });
  });
  s.draw("section width", (p) => dimAligned(p, D(0, -0.35), D(W, -0.35), [0, -1], 0.2, SW(t, "width", { n: W })));
  s.draw("section depth", (p) => {
    dimAligned(p, D(W + 0.25, 0), D(W + 0.25, Dp), [1, 0], 0.2, "");
    const at = D(W + 0.25, Dp / 2);
    p.text(SW(t, "depth1"), at[0] + 0.27, at[1] + 0.1, TH.sm).text(SW(t, "depth2"), at[0] + 0.27, at[1] - 0.1, TH.sm);
  });
  const up4 = (Dp - 4) / K; // the callouts ride with the gutter's top
  const callout = (at: Pt, tx: number, ty: number, keys: string[]) =>
    s.draw(`callout ${keys[0]}`, (p) => {
      p.line(D(at[0], at[1]), [tx, ty], { ghost: true });
      keys.forEach((k, i) => p.text(SW(t, k), tx + 0.04, ty - i * 0.19, TH.sm, { bold: i === 0 }));
    });
  callout([-2.85, s0(-2.85) + 0.2], 0.5, oy + 2.5 + up4, ["shingles"]);
  callout([-1.9, sb(-1.9) + 0.25], 0.85, oy + 2.27 + up4, ["sheathing"]);
  callout([0.32, 3.9 * ky], ox + 0.72, oy + 2.04 + up4, ["drip1", "drip2"]);
  callout([0.05, 3.5 * ky], ox + 0.72, oy + 1.58 + up4, ["back1", "back2"]);
  callout([4.8 * kx, 3.75 * ky], ox + W / K + 0.2, oy + Dp / K + 0.2, ["front"]);
  callout([-0.75, -1.9], ox + 0.15, oy - 0.72, ["fascia"]);
  s.draw("section words", (p) => {
    const r = D(-2.3, 2.3 * ky);
    p.text(SW(t, "rafter"), r[0], r[1], TH.sm, { anchor: "c", rot: 90, pad: 0 });
    p.text(SW(t, "house1"), 0.45, oy - 0.25, TH.sm, { bold: true, pad: 0.005 }).text(SW(t, "house2"), 0.45, oy - 0.44, TH.sm, { bold: true, pad: 0.005 });
  });
  s.draw("section title", (p) => {
    const tx = 1.08, y = 2.92;
    bubble(p, 0.74, y, no.detail, no.sheet);
    p.text(SW(t, "secTitle"), tx, y + 0.09, TH.body, { bold: true });
    p.line([tx, y - 0.02], [3.8, y - 0.02], { lw: LW.heavy });
    p.text(SW(t, "secScale"), tx, y - 0.16, TH.sm);
  });
}

/** the notes in their column; what does not fit it goes on under the legend (`under` is the legend's bottom) */
function notes(s: Sheet, x: ShopCtx, m: ShopModel, story: number, schedules: string, under: number) {
  const { t } = x, IN = 0.24;
  let X0 = 4.15, X1 = 7.55, moved = false;
  const here = m.chains.filter((c) => c.story === story), ds = m.ds.filter((d) => d.seg.story === story);
  const segs = here.flatMap((c) => c.segs);
  const miters = m.tags.filter((g) => g.kind === "miter" && g.cut > 0 && segs.some((sg) => sg.ends.some((e) => e.tag === g.tag)));
  const kind = (k?: string) => t(k === "in" ? "mod.gutters.draw.cornerIn" : k === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");
  const list: string[] = [
    SW(t, "n.gutter", { g: gutterStock(t, segs) }),
    ...(ds.length ? [SW(t, "n.ds", { d: dsStock(t, ds) })] : []),
    SW(t, "n.lengths"),
    ...(here.length > 1 ? [SW(t, "n.runs")] : []),
    ...(ds.length ? [SW(t, "n.dsLoc")] : []),
    ...(miters.length ? [`${SW(t, "n.miters")} ${miters.map((g) => SW(t, "n.miter", { tag: g.tag, kind: kind(g.cornerKind), deg: g.angleDeg!, cut: miterCutDeg(g.angleDeg!) })).join("; ")}.`] : []),
    SW(t, "n.flashing"),
    SW(t, "n.hangers", { n: x.rules.hangerSpacingIn }),
  ];
  s.draw("notes heading", (p) => header(p, SW(t, "notes"), X0, X1, TOP));
  let y = TOP - 0.34;
  const put = (n: number, txt: string, bold = false) => {
    let lines = wrap(txt, TH.sm, X1 - X0 - IN, bold);
    if (!moved && y - (lines.length - 1) * LINE < TBT + 0.14) {
      moved = true;
      X0 = LEGEND_X; X1 = R - 0.25; y = under - 0.1;
      lines = wrap(txt, TH.sm, X1 - X0 - IN, bold);
    }
    s.draw(`note ${n}`, (p) => {
      for (const [i, ln] of lines.entries()) {
        if (i === 0) p.text(`${n}.`, X0, y, TH.sm, { bold });
        p.text(ln, X0 + IN, y, TH.sm, { bold });
        y -= LINE;
      }
      y -= 0.03;
    });
  };
  list.forEach((txt, i) => put(i + 1, txt));
  put(list.length + 1, SW(t, "n.see", { s: schedules }), true);
}

function legend(s: Sheet, t: Tr, no: { sheet: string; detail: string }): number {
  const X0 = LEGEND_X, X1 = R - 0.25, TX = X0 + 0.72, SX = X0 + 0.3;
  let y = TOP;
  s.draw("legend heading", (p) => header(p, SW(t, "legend"), X0, X1, y));
  y -= 0.4;
  /** a symbol of height `sh` centred on the row, its words beside it */
  const row = (key: string, sh: number, f: (p: Part, c: number) => void) => {
    const lines = wrap(SW(t, key), TH.sm, X1 - TX), h = Math.max(sh, lines.length * LINE), c = y - h / 2;
    s.draw(`legend ${key}`, (p) => {
      f(p, c);
      lines.forEach((ln, i) => p.text(ln, TX, c + ((lines.length - 1) / 2 - i) * LINE, TH.sm));
    });
    y -= h + 0.12;
  };
  row("lg.gutter", 0.1, (p, c) => {
    p.rect(X0, c - 0.04, X0 + 0.6, c + 0.04, { fill: "gray", lw: 0, ghost: true });
    p.line([X0, c + 0.04], [X0 + 0.6, c + 0.04], { lw: LW.gutter }).line([X0, c - 0.04], [X0 + 0.6, c - 0.04]);
  });
  row("lg.face", 0.1, (p, c) => {
    p.line([X0, c], [X0 + 0.48, c]);
    p.poly([[X0 + 0.6, c], [X0 + 0.48, c + 0.04], [X0 + 0.48, c - 0.04]], { close: true, fill: "ink", lw: 0, ghost: true });
  });
  row("lg.segment", 0.22, (p, c) => {
    p.solid([[SX - 0.2, c - 0.105], [SX + 0.2, c - 0.105], [SX + 0.2, c + 0.105], [SX - 0.2, c + 0.105]]);
    p.text("1-2", SX, c, TH.sm, { anchor: "c", bold: true, pad: 0 });
  });
  row("lg.section", 0.48, (p, c) => bubble(p, SX, c, no.detail, no.sheet));
  row("lg.tag", 0.32, (p, c) => {
    p.circle([SX, c], 0.16);
    p.text("A", SX, c, TH.body, { anchor: "c", bold: true, pad: 0 });
  });
  row("lg.ds", 0.4, (p, c) => {
    p.solid(ngon([X0 + 0.2, c], 0.2, 6, 30));
    p.text("DS1", X0 + 0.2, c, TH.sm, { anchor: "c", bold: true, pad: 0 });
    const q = 0.055, cx = X0 + 0.54;
    p.rect(cx - q, c - q, cx + q, c + q, { lw: LW.ttlb }).line([cx - q, c - q], [cx + q, c + q], { ghost: true }).line([cx - q, c + q], [cx + q, c - q], { ghost: true });
  });
  return y;
}
