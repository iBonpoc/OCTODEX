/** The sheet's border and title block (the bottom of every sheet), ANSI B portrait 11 × 17 (#1349). */
import { shopSheet as SS } from "@octo/design-tokens";
import { SW, type ShopJob, type Tr } from "./job";
import { LW, Sheet, TH, textW, wrap, type Part } from "./sheet";

export const SHEET_W = SS.wIn, SHEET_H = SS.hIn, B = SS.borderIn;
export const L = B, R = SHEET_W - B, T = SHEET_H - B;
/** the title block's top */
export const TBT = 2.375;
/** the top rule of the plan sheet's lower band (section, notes, legend) */
export const BAND_Y = 6.9;
const PAD = 0.12;

/** a section heading with its rule */
export function header(p: Part, txt: string, x0: number, x1: number, y: number, h: number = 0.14) {
  p.text(txt, x0, y, h, { bold: true });
  p.line([x0, y - h], [x1, y - h], { lw: LW.ttlb });
}

/** a bubble of a drawing or a detail: its letter over the sheet where it is drawn */
export function bubble(p: Part, cx: number, cy: number, top: string, bottom: string, r = 0.24) {
  p.circle([cx, cy], r, { lw: LW.ttlb });
  p.line([cx - r, cy], [cx + r, cy], { lw: LW.med, ghost: true });
  p.text(top, cx, cy + r * 0.45, TH.body, { anchor: "c", bold: true, pad: 0 });
  p.text(bottom, cx, cy - r * 0.47, TH.sm, { anchor: "c", pad: 0 });
}

/** a text made to fit a width: smaller down to the sheet's smallest text, then cut with «...» */
export function fitText(txt: string, h: number, maxW: number, bold = false): { txt: string; h: number } {
  let hh = h;
  while (hh - 0.005 >= TH.sm && textW(txt, hh, bold) > maxW) hh -= 0.005;
  let s = txt;
  while (s.length > 1 && textW(s === txt ? s : `${s}...`, hh, bold) > maxW) s = s.slice(0, -1).trimEnd();
  return { txt: s === txt ? s : `${s}...`, h: hh };
}

export interface FrameInfo { sheet: string; title: string; sub: string[]; scale: string }

export function sheetFrame(t: Tr, job: ShopJob, f: FrameInfo, h: number = SHEET_H): Sheet {
  const s = new Sheet(SHEET_W, h, B);
  s.draw("border", (p) => {
    p.rect(0, 0, SHEET_W, h, { lw: LW.hair, ghost: true });
    p.rect(B, B, R, h - B, { lw: LW.border, ghost: true });
  });
  const c1 = 3.3, c2 = 5.7, cm = 6.95, c3 = 8.2;
  const rh = (TBT - B) / 3, ym = TBT - 1.02;
  s.draw("title block", (p) => {
    p.line([B, TBT], [R, TBT], { lw: LW.heavy });
    for (const x of [c1, c2, c3]) p.line([x, B], [x, TBT], { lw: LW.ttlb });
    p.line([cm, B], [cm, TBT], { lw: LW.med });
    for (const i of [1, 2]) p.line([c1, TBT - i * rh], [c3, TBT - i * rh], { lw: LW.med });
    p.line([c3, ym], [R, ym], { lw: LW.med });
  });
  // every text is a part of its own: one that does not fit its cell is caught by `problems`
  const cw = c1 - B - 2 * PAD;
  const name = job.company.name.toLocaleUpperCase();
  let nh = 0.17, lines = wrap(name, nh, cw, true);
  while (lines.length > 2 && nh - 0.01 >= TH.sm) { nh -= 0.01; lines = wrap(name, nh, cw, true); }
  s.draw("company", (p) => {
    // a name longer than two lines: the second ends with «...»
    [lines[0]!, lines.slice(1).join(" ")].filter(Boolean).forEach((ln, i) => { const x = fitText(ln, nh, cw, true); p.text(x.txt, B + PAD, TBT - 0.35 - i * (nh + 0.1), x.h, { bold: true }); });
    const down = (Math.min(2, lines.length) - 1) * (nh + 0.1);
    job.company.lines.slice(0, 5).forEach((ln, i) => { const x = fitText(ln.toLocaleUpperCase(), TH.sm, cw); p.text(x.txt, B + PAD, TBT - 0.62 - down - i * 0.2, x.h); });
  });
  const field = (key: string, value: string | undefined, x0: number, x1: number, ytop: number) =>
    s.draw(key, (p) => {
      p.text(fitText(SW(t, key), TH.sm, x1 - x0 - 2 * PAD).txt, x0 + PAD, ytop - 0.17, TH.sm);
      // a blank to fill by hand, as on a paper form — never a made-up value
      if (value) { const x = fitText(value.toLocaleUpperCase(), 0.13, x1 - x0 - 2 * PAD, true); p.text(x.txt, x0 + PAD, ytop - 0.45, x.h, { bold: true }); }
      else p.line([x0 + PAD, ytop - rh + 0.14], [x1 - PAD, ytop - rh + 0.14], { lw: LW.hair });
    });
  const dash = "—";
  field("project", job.project ?? SW(t, "projectDefault"), c1, c2, TBT);
  field("client", job.client, c1, c2, TBT - rh);
  field("site", job.address, c1, c2, TBT - 2 * rh);
  field("drawnBy", job.drawnBy ?? dash, c2, cm, TBT); field("checked", job.checked ?? dash, cm, c3, TBT);
  field("date", job.date, c2, cm, TBT - rh); field("scale", f.scale, cm, c3, TBT - rh);
  field("rev", job.rev ?? dash, c2, cm, TBT - 2 * rh); field("projectNo", job.projectNo ?? dash, cm, c3, TBT - 2 * rh);
  s.draw("sheet title", (p) => {
    const w = R - c3 - 2 * PAD;
    p.text(SW(t, "sheetTitle"), c3 + PAD, TBT - 0.17, TH.sm);
    const x = fitText(f.title, 0.13, w, true);
    p.text(x.txt, c3 + PAD, TBT - 0.43, x.h, { bold: true });
    f.sub.slice(0, 2).forEach((ln, i) => p.text(fitText(ln, TH.sm, w).txt, c3 + PAD, TBT - 0.66 - i * 0.2, TH.sm));
  });
  s.draw("sheet no.", (p) => {
    p.text(SW(t, "sheet"), c3 + PAD, ym - 0.17, TH.sm);
    const x = fitText(f.sheet, TH.sheet, R - c3 - 2 * PAD, true);
    p.text(x.txt, (c3 + R) / 2, (ym + B) / 2 - 0.1, x.h, { anchor: "c", bold: true });
  });
  return s;
}
