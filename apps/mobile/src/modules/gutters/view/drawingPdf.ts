/**
 * «Чертёж в PDF» (founder 09.11, #509; spec 33 П20.25 п.4): two documents of a measurement from «Просмотр замера».
 * - for the client: the drawing and the gutters with their lengths, storey, profile and colour — no prices, no cut,
 *   in the CLIENT's language (rule 7: tFor(clientLangOf));
 * - for the crew: the drawing, every gutter along the wall and along the face, the corners' cut, the downspouts'
 *   fittings and the parts with their quantities — in the app's language (the company's own people).
 * The drawing is an SVG of the same scene as the screen, in print ink: the storey is a word («эт 2»), never a colour
 * (rule 2: the storey colours live on the canvas only). The page shell is the core's (docPage). Pure: HTML out.
 */
import { drawing as dt, print, space } from "@octo/design-tokens";
import type { PartQty } from "@octo/estimating-engine";
import type { DictKey } from "@/i18n";
import { docPage, esc, type DocOpts } from "@/features/docPdf";
import type { PortalData } from "@/cloud/portal";
import { buildScene, fitView, type Scene } from "../canvas/scene";
import { ftIn } from "../canvas/format";
import type { Drawing } from "../geometry";
import { partName } from "../prices";
import type { MeasureSpec } from "./spec";

type Tr = (key: DictKey, params?: Record<string, string | number>) => string;

/** the drawing's box on the page, in its own units (the SVG scales to the page width) */
const SVG_W = 600;
const SVG_H = 400;
const FONT = print.fontPt.heading;

/** a dictionary word, or the value itself when the company named it its own way (a colour of its own) */
const word = (t: Tr, key: string, raw: string) => {
  const v = t(key as DictKey);
  return v === key ? raw : v;
};

/** the scene in print ink: lines, the face beside them, corner diamonds, downspout circles, the labels on white */
export function drawingSvg(scene: Scene): string {
  const ink = print.ink;
  const mut = print.mut;
  const n = (x: number) => Math.round(x * 10) / 10;
  const parts: string[] = [];
  for (const r of scene.runs) {
    parts.push(`<line x1="${n(r.a[0])}" y1="${n(r.a[1])}" x2="${n(r.b[0])}" y2="${n(r.b[1])}" stroke="${ink}" stroke-width="${dt.runW}" stroke-linecap="round"/>`);
    parts.push(`<line x1="${n(r.face[0][0])}" y1="${n(r.face[0][1])}" x2="${n(r.face[1][0])}" y2="${n(r.face[1][1])}" stroke="${mut}" stroke-width="${dt.runW / 4}" stroke-dasharray="${dt.runW} ${dt.runW}"/>`);
  }
  for (const k of scene.corners) {
    const [x, y] = k.at;
    const r = dt.dsR;
    parts.push(`<path d="M${n(x)} ${n(y - r)}L${n(x + r)} ${n(y)}L${n(x)} ${n(y + r)}L${n(x - r)} ${n(y)}Z" fill="${k.kind === "in" ? ink : print.paper}" stroke="${ink}" stroke-width="${dt.runW / 2}"/>`);
  }
  for (const d of scene.ds) {
    parts.push(`<circle cx="${n(d.at[0])}" cy="${n(d.at[1])}" r="${dt.dsR}" fill="${print.paper}" stroke="${ink}" stroke-width="${dt.runW / 2}"/>`);
  }
  for (const l of scene.labels) {
    parts.push(`<rect x="${n(l.x - l.w / 2)}" y="${n(l.y - l.h / 2)}" width="${n(l.w)}" height="${n(l.h)}" fill="${print.paper}"/>`);
    parts.push(`<text x="${n(l.x)}" y="${n(l.y + FONT * 0.35)}" font-size="${FONT}" text-anchor="middle" fill="${ink}">${esc(l.text)}</text>`);
  }
  return `<svg class="drawing" viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;border:1px solid ${print.rule}">${parts.join("")}</svg>`;
}

/** the drawing's scene for the page: fitted into the box, every label (the storey as a word) */
export function printScene(d: Drawing, t: Tr): Scene | null {
  if (!d.runs.length) return null;
  const vp = { w: SVG_W, h: SVG_H };
  return buildScene(d, {
    view: fitView(d.runs.flatMap((r) => [r.a, r.b]), vp, space[8]),
    viewport: vp,
    fontSize: FONT,
    padX: space[1],
    gap: dt.labelGap,
    lenWithStory: true,
    dsPad: dt.dsR,
    dsText: (k) => t("mod.gutters.ds", { n: k }),
    storyText: (k) => t("mod.gutters.story", { n: k }),
    cornerText: (kind, splash) => {
      const k = t(kind === "in" ? "mod.gutters.draw.cornerIn" : kind === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");
      return splash ? t("mod.gutters.draw.cornerSplash", { k }) : k;
    },
    faceOff: dt.runW * 2,
  });
}

export interface DrawingPdfInput {
  kind: "client" | "crew";
  drawing: Drawing;
  spec: MeasureSpec;
  /** the client's language for «client», the app's for «crew» */
  t: Tr;
  opts: DocOpts;
  company: PortalData["company"];
  /** who and where: the client's or lead's name, the address */
  who?: string;
  address?: string;
  /** measured roughly: «measure again before cutting» */
  rough: boolean;
  /** today, as the document's date (US format) */
  date: string;
}

export function drawingPdfHtml(x: DrawingPdfInput): string {
  const { t, spec } = x;
  const crew = x.kind === "crew";
  const scene = printScene(x.drawing, t);
  const th = (k: DictKey) => `<th>${esc(t(k))}</th>`;
  const gutterOf = (r: MeasureSpec["runs"][number]) => `${word(t, `mod.gutters.attr.p.${r.profile}`, r.profile)} ${esc(r.size)}″`;
  const runs = spec.runs
    .map(
      (r) =>
        `<tr><td>${r.n}</td>${crew ? `<td>${esc(ftIn(r.backIn))}</td><td><b>${esc(ftIn(r.frontIn))}</b></td>` : `<td>${esc(ftIn(r.backIn))}</td>`}<td>${esc(t("mod.gutters.story", { n: r.story }))}</td><td>${esc(gutterOf(r))}</td><td>${esc(r.color ? word(t, `mod.gutters.attr.c.${r.color}`, r.color) : "")}</td></tr>`,
    )
    .join("");
  const runsTable = `<h2>${esc(t("mod.gutters.view.runs"))}</h2><table><tr>${th("mod.gutters.pdf.n")}${crew ? th("mod.gutters.pdf.wall") + th("mod.gutters.pdf.face") : th("mod.gutters.pdf.len")}${th("mod.gutters.pdf.story")}${th("mod.gutters.pdf.gutter")}${th("mod.gutters.pdf.color")}</tr>${runs}</table>`;
  const kindWord = (k: string) => t(k === "in" ? "mod.gutters.draw.cornerIn" : k === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");
  const corners = crew && spec.corners.length
    ? `<h2>${esc(t("mod.gutters.view.corners"))}</h2>${spec.corners
        .map((c) => `<p><b>${esc(t("mod.gutters.view.cornerTitle", { k: kindWord(c.kind), deg: c.angleDeg }))}</b><br>${c.runs.map((r) => esc(t("mod.gutters.view.cornerRun", { n: r.n, back: ftIn(r.backIn), front: ftIn(r.frontIn) }))).join("<br>")}</p>`)
        .join("")}`
    : "";
  const ds = spec.ds.length
    ? crew
      ? `<h2>${esc(t("mod.gutters.view.ds"))}</h2><table>${spec.ds.map((d) => `<tr><td>${esc(t("mod.gutters.ds", { n: d.n }))}</td><td>${esc(t("mod.gutters.story", { n: d.story }))}</td><td>${esc(d.size)}</td><td>${esc(t("mod.gutters.view.dsLine", { e: d.elbows, o: d.offsets }))}</td></tr>`).join("")}</table>`
      : `<p>${esc(t("mod.gutters.pdf.dsCount", { n: spec.ds.length }))}</p>`
    : "";
  const unit = (u: string) => word(t, `mod.gutters.view.u.${u}`, u);
  const partsTable = crew && spec.parts.length
    ? `<h2>${esc(t("mod.gutters.view.parts"))}</h2><table>${spec.parts.map((p: PartQty) => `<tr><td>${esc(partName(t, p))}</td><td class="r">${esc(`${Number(p.qty)} ${unit(p.unit)}`)}</td></tr>`).join("")}</table>`
    : "";
  const rough = x.rough ? `<p class="note"><b>${esc(t("mod.gutters.view.rough"))}</b></p>` : "";
  const title = t(crew ? "mod.gutters.pdf.titleCrew" : "mod.gutters.pdf.title");
  const meta = [`${t("mod.gutters.pdf.date")}: ${x.date}`, x.who, x.address].filter(Boolean) as string[];
  const body = `${scene ? drawingSvg(scene) : ""}${rough}${runsTable}${corners}${ds}${partsTable}`;
  return docPage({ title, meta, footer: [title, x.company.name].filter(Boolean).join(" · "), company: x.company, body, opts: x.opts });
}

export const drawingPdfName = (kind: "client" | "crew", t: Tr, who?: string) =>
  [t(kind === "crew" ? "mod.gutters.pdf.titleCrew" : "mod.gutters.pdf.title"), who].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "").trim();
